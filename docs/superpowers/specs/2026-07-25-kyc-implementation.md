# Sub-project #5 — Implementation deep-dive: KYC Documents (collect → verify → track)

> Grounded on the live codebase (2026-07-25) via an Explore pass. Companion to the architecture spec
> `2026-07-22-eduos-feature-architecture-design.md` (decisions **D12** + **D18**) and the UX mockups
> `stitch-designs/eduos-v2/kyc-*.html`. Source for the ERP "KYC" epic + stories.

**Context that shapes this:**
- KYC is **fully greenfield** (no kyc/document/verification table). **Students only** in v1 (polymorphic schema kept for staff-later, D18).
- **Admin-upload, web-only** feature (D18) — no parent/student upload surface; no mobile.
- **Reuse spine (verified):** clone the **`homework_attachments`** table (`20240001000046`, `file_url` stores the object *path*,
  `file_size` CHECK) + the private **`homework-attachments`** bucket (`20240001000049`, only existing private bucket);
  `createSignedUrl(path,60)` reads (`apps/web/lib/homework.ts:68-72`); the **`review_homework`** SECURITY DEFINER authz
  pattern (`20240001000048:105-135`); `is_parent_of_student`/`teaches_student` (`20240001000061:47-63`); `audit_log`
  (`20240001000009`, exists, near-zero writers).
- **CRITICAL storage caveat:** `get_my_school_id()`/`get_my_role()` **return NULL on Storage requests** (Storage doesn't run
  the PostgREST `db_pre_request` GUC hook — see `20240001000052:1-14`). KYC storage RLS must be **`auth.uid()`-direct**
  (reading `user_roles`), the migration-51/52 rewrite — NOT the GUC helpers. Table RLS (normal PostgREST) CAN use the GUC helpers.
- **Hard dependency:** F1 core (`feature_enabled()` + registry; `kyc_documents` key already reserved, seeded false).
- **Migration numbering:** current max `20240001000062`; F1 reserves `063+`. KYC uses the next free numbers **after F1's block** (unpinned).
- **Zero cron jobs** (expiry is derived on-read, §7) and **zero edge functions** in v1 (no comms; reads via a Next.js route).

---

## 1. Data model (migrations)

**Enums:**
```sql
CREATE TYPE public.kyc_subject_type AS ENUM ('student','staff');   -- 'staff' defined now, unused in v1
CREATE TYPE public.kyc_doc_status   AS ENUM ('submitted','verified','rejected','expired');
```
> `'expired'` exists for completeness but is **derived on read** in v1 (§7); the stored status stays `verified`.
> `missing` / `expiring_soon` are never stored — purely derived.

**`document_types`** (per-school config):
```sql
CREATE TABLE public.document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.kyc_subject_type NOT NULL DEFAULT 'student',
  name text NOT NULL, description text,
  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  expires boolean NOT NULL DEFAULT false,
  default_validity_months integer,          -- prefill expires_on on verify (NULL ⇒ never)
  is_custom boolean NOT NULL DEFAULT false,  -- seeded vs school-added
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doctype_school ON public.document_types(school_id, subject_type, is_active);
```

**`kyc_documents`** (clone `homework_attachments` + status/verification/expiry):
```sql
CREATE TABLE public.kyc_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_type public.kyc_subject_type NOT NULL DEFAULT 'student',
  subject_id uuid NOT NULL,                              -- student_profiles.id; NO hard FK (polymorphic; RPC validates)
  document_type_id uuid NOT NULL REFERENCES public.document_types(id),
  file_path text NOT NULL,                               -- storage OBJECT PATH (not a public URL) — homework convention
  file_name text NOT NULL, file_type text,
  file_size integer CHECK (file_size > 0 AND file_size <= 5242880),   -- 5 MB
  status public.kyc_doc_status NOT NULL DEFAULT 'submitted',
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  verified_by uuid REFERENCES auth.users(id), verified_at timestamptz,
  rejection_reason text,
  expires_on date,                                       -- set on verify from doc-type validity
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject_type, subject_id, document_type_id)   -- one doc per (subject × type)
);
CREATE INDEX idx_kyc_subject ON public.kyc_documents(school_id, subject_type, subject_id);
CREATE INDEX idx_kyc_status  ON public.kyc_documents(school_id, status);
```
**Re-upload = UPSERT** `ON CONFLICT (school_id,subject_type,subject_id,document_type_id)` → replace `file_*`, reset
`status='submitted'`, clear `verified_by/at` + `rejection_reason` + `expires_on`.

## 2. Private bucket + write (upload) path

**Bucket** `kyc-docs`, `public=false`. **Path** `kyc/{school_id}/{subject_id}/{document_type_id}-{ts}.{ext}` — school at
`(storage.foldername(name))[2]`, subject at `[3]`.

**Storage write RLS — `auth.uid()`-direct** (NOT GUC helpers), admin/principal only, school-scoped:
```sql
CREATE POLICY kyc_docs_write ON storage.objects FOR ALL
USING (bucket_id='kyc-docs' AND EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active
    AND ur.role IN ('super_admin','school_admin','principal')
    AND (ur.role='super_admin' OR ur.school_id::text = (storage.foldername(name))[2])
));  -- WITH CHECK identical
```
Teachers cannot write. **Storage SELECT is fully locked** (no client read — §3).

**Upload flow (homework two-step):** client uploads to the bucket (gated by the policy above) → calls
**`upsert_kyc_document(p_subject_id, p_document_type_id, p_file_path, p_file_name, p_file_type, p_file_size)`** (SECURITY
DEFINER): validates `feature_enabled(school,'kyc_documents')`, role ∈ (school_admin, principal), `subject_id ∈
student_profiles` of the school, `document_type_id` belongs to the school → UPSERTs the row (reset semantics above);
writes an `audit_log` row (`action='kyc_upload'`).

## 3. Read path — unified server signed-URL endpoint (where teacher scoping lives)

Storage SELECT RLS **cannot** express "teacher teaches this student" (`teaches_student` needs GUCs → NULL on storage). So
**all reads go through one Next.js route** `GET /api/kyc/[documentId]/url`:
1. Load the doc (school_id, subject_id, file_path).
2. **App-layer authz** (GUCs set on a normal request): allow if `get_my_role() IN ('school_admin','principal')` (school-wide)
   OR `teaches_student(subject_id)` (teacher, own students). Else 403.
3. **Service-role** `createSignedUrl(file_path, 60)` → return the 60-second URL.

**Storage SELECT is denied to all clients** — the service-role endpoint is the sole read path and *is* the authz gate
(strongest posture for Aadhaar/birth certs). Mutations are audited (§2, §4); per-view audit deferred (trivial to add at this
one chokepoint).

## 4. Write RPCs (SECURITY DEFINER, `search_path=''`, self-authorizing, `feature_enabled` gate — mirror `review_homework`)

- **`upsert_kyc_document(...)`** — §2.
- **`verify_documents(p_ids uuid[])`** — D12 **bulk**. One transaction; per id: authz `get_my_role() IN
  ('school_admin','principal')` at the doc's school; **state guard** (only from `submitted`); set `status='verified'`,
  `verified_by=auth.uid()`, `verified_at=now()`; **`expires_on` = `current_date + (dt.default_validity_months || ' months')::interval`
  iff `dt.expires`** else NULL; `audit_log` (`kyc_verify`) per doc.
- **`reject_document(p_id, p_reason)`** — single; same authz + state guard; `status='rejected'`, `rejection_reason=p_reason`,
  `verified_by/at` as decider; `audit_log` (`kyc_reject`).
- **`save_document_type(...)`** / **`set_document_type_active(p_id, p_active)`** — `school_admin` (+super); deactivate never
  hard-deletes a type with documents. **`seed_document_types(p_school_id)`** — idempotent seed of the Indian-standard set
  (Birth cert, TC, prev marksheet, photo, address proof required; Aadhaar, medical, caste optional; medical `expires`=true,
  validity 12mo). All `GRANT EXECUTE TO authenticated`.

## 5. On-read checklist (Q5)

- **`get_student_kyc_checklist(p_student_id)`** → for each **active** `document_types` row (LEFT JOIN the student's doc):
  the document (status/file_path/expires_on) or `missing`, plus derived `expiring_soon` (verified & `expires_on` within 30d)
  and derived `expired` (verified & `expires_on < today`). Powers the student Documents tab.
- **`student_kyc_completeness`** VIEW (per student × school): `required_total`, `verified_count` (verified & non-expired),
  `pending_count`, `missing_count`, `is_complete` (= all active+required types satisfied). Powers dashboard KPIs + the
  incomplete-students list.
- **Definition:** a required type is **satisfied only by a `verified`, non-expired document** — `submitted`/`rejected`/`expired`/
  `missing` are all unsatisfied. **Optional types never count toward completeness.**
- Verification queue = `kyc_documents WHERE status='submitted'`; expiring = `verified AND expires_on BETWEEN today AND today+30`.

## 6. RLS (mirror homework/leave — SELECT-only, writes via RPCs)

- **`kyc_documents` SELECT:** `super_admin` OR (`school_id=get_my_school_id()` AND (`get_my_role() IN ('school_admin','principal')`
  **OR `teaches_student(subject_id)`**) AND `feature_enabled(school_id,'kyc_documents')`). Table RLS CAN use `teaches_student`
  (GUCs set on normal requests) — this is the teacher "own students" metadata visibility; the *file* still routes through §3.
- **`document_types` SELECT:** same-school authenticated (config, not sensitive; teachers need it to render the checklist),
  `feature_enabled`-gated. **No write policies** on either table (writes via the RPCs / service-role).

## 7. Expiry — derived on-read, ZERO cron (D18 revised)

No `cron.schedule`, no edge function. A verified doc with `expires_on < today` **reads as expired** (unsatisfied) via the
checklist/completeness derivation (§5); the stored status stays `verified`. Always accurate the instant the date passes.
> Revises D18's "nightly cron flip." The only reason to physically flip via cron is a scheduled side-effect at expiry
> (e.g., parent nudge) — v1 has none; that cron lands later with the deferred parent-comms fast-follow.

## 8. Feature-flag wiring + seeding (Q7)

- `kyc_documents` gates: the "KYC" nav item (`nav-config.ts`, `feature:'kyc_documents'`, school_admin + principal), the KYC
  pages, and the write RPCs (`feature_enabled` check). Storage write RLS stays role/school-scoped (the upsert RPC owns the flag gate).
- **Lazy seeding:** the KYC dashboard/settings, on first load with zero `document_types` for the school, calls
  `seed_document_types(school_id)` (idempotent). No F1-flag-flip trigger coupling, no migration backfill.

## 9. Surfaces (mockups → build targets) — web-only

- **Dashboard + verification queue** (`kyc-dashboard-web.html`) — `(school)/admin/kyc`; completeness KPIs (from
  `student_kyc_completeness`), segmented To-verify / Incomplete students / Expiring, **multi-select bulk-verify** +
  reject-with-reason. Nav-badge = count of `stage`... (pending verification count).
- **Per-student Documents tab** (`kyc-student-docs-web.html`) — on the student detail page; `get_student_kyc_checklist`
  rows (verified/submitted/rejected+reason/expiring/missing), upload/re-upload, **View** → `/api/kyc/[id]/url`.
- **Doc-type settings** (`kyc-settings-web.html`) — required/optional toggle, validity, activate/deactivate, add custom.

## 10. Edge cases
1. Re-upload of a rejected/verified doc → UPSERT resets to `submitted` (new review). ✔
2. Verify a `rejected` doc directly → blocked (state guard: only from `submitted`; must re-upload first). ✔
3. Doc type deactivated while docs exist → soft (`is_active=false`), documents kept, drops from new checklists; never hard-deleted. ✔
4. Expired verified doc → derived unsatisfied; re-collect signal in queue + counts incomplete. No cron. ✔
5. Optional type → collected + verifiable but never affects completeness. ✔
6. Teacher views a non-own student's doc → 403 at the signed-URL endpoint (`teaches_student` false). ✔
7. Flag OFF → nav hidden, pages 404, RPCs reject; a stray storage upload creates no row (RPC gate). ✔
8. New student (admission convert / add-student) → checklist auto-exists (on-read; all required = missing). No seeding step. ✔
9. Subject_id not a real student → `upsert_kyc_document` validation rejects (no hard FK). ✔
10. Same doc type, two files (Aadhaar front/back) → combine into one PDF (one doc per type; D18/Q7). ✔

## 11. ERP ticket breakdown (Epic → stories; each cites arch D12/D18 + this doc § + mockup artifact + repo html path)
- **Epic: KYC Documents** — collect → verify → track (students only; web-only; F1 hard dep).
- **Story A — Data model + doc-type config + RLS + seeding:** 2 tables + enums (§1), `document_types` CRUD RPCs +
  `seed_document_types` (§4), SELECT-only RLS + flag gate (§6), lazy seed (§8).
- **Story B — Private bucket + upload + signed-URL reads:** `kyc-docs` bucket + `auth.uid()`-direct write RLS (§2),
  `upsert_kyc_document` RPC, the unified `/api/kyc/[id]/url` read endpoint with teacher scoping + locked SELECT (§3).
- **Story C — Verification workflow (dashboard + queue):** `verify_documents(ids[])` bulk + `reject_document` (§4),
  `student_kyc_completeness` view + queries (§5), the dashboard/queue UI with multi-select bulk-verify (§9), nav gating.
- **Story D — Per-student Documents tab + checklist + settings:** `get_student_kyc_checklist` (§5), the student tab
  (upload/re-upload/view + derived states incl. expired-on-read §7), the doc-type settings panel (§9).
