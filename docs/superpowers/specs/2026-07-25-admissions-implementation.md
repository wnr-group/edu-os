# Sub-project #4 — Implementation deep-dive: Admissions (public form → pipeline → enrolled student)

> Grounded on the live codebase (2026-07-25) via two targeted Explore passes. Companion to the architecture spec
> `2026-07-22-eduos-feature-architecture-design.md` (decisions **D10** + **D17**) and the UX mockups
> `stitch-designs/eduos-v2/admission-*.html`. Source for the ERP "Admissions" epic + stories.

**Context that shapes this:**
- Admissions is **fully greenfield** — no lead/enquiry/application table, route, or unauthenticated edge function. Every
  edge function today is `verify_jwt=true` (`config.toml` has no `[functions.*]` sections); `enable_anonymous_sign_ins=false`.
- **This is the system's only unauthenticated write** — isolated in an edge function with its own throttle, never a direct
  RLS insert (arch spec §Module A).
- **Reuse (verified):** phone-based parent provisioning (`apps/web/lib/provisioning/find-or-create-user.ts`,
  `apps/web/app/api/students/resolve-parent/route.ts`), the add-student two-step insert
  (`apps/web/app/(school)/admin/students/add-student-drawer.tsx`), `get_active_academic_year` (already `anon`-callable,
  `20240001000044_attendance_helpers.sql:7-21`), classes/sections, the `payments`/`razorpay-webhook` reconciliation seam,
  `send-welcome-sms` (Nettyfish SMS), the RLS helpers `get_my_school_id()`/`get_my_role()` (`20240001000038_scope_hook.sql`),
  and `audit_log` (`20240001000009_audit.sql` — exists, **zero writers today**; convert is its first).
- **Hard dependencies:** **F1 core** (`feature_enabled()` + registry — the `'admissions'` key is already reserved in the
  F1 design; new modules are hard-gated per D3) is required for the whole feature; **ERP-63** (per-school Razorpay:
  `school_payment_gateways` + `get_payment_secret` + per-school webhook verification) is required **only for the fee
  sub-path**. Admissions-without-fee ships independently of ERP-63.
- **Migration numbering:** the current max is `20240001000062_files_bucket.sql`; F1 reserves `063+`. Do **not** hard-pin —
  admissions migrations use the next free numbers **after F1's block** at build time (same convention as sub-projects #2/#3).
- `student_profiles.roll_number`/`class_id`/`section_id` were moved to `student_enrollments` (`20240001000029`); an applicant
  applies to a **class**, and section/roll#/admission# are assigned at **convert** (mirrors the add-student flow).

---

## 1. Data model (migrations)

**(a) Enums:**
```sql
CREATE TYPE public.admission_stage          AS ENUM ('enquiry','under_review','offered','enrolled','rejected');
CREATE TYPE public.admission_payment_status AS ENUM ('not_required','pending','paid');
CREATE TYPE public.admission_source         AS ENUM ('online','walk_in');
```

**(b) `admission_settings`** (per-school config; also holds the ref counter + the admitting-for year, D9/D17):
```sql
CREATE TABLE public.admission_settings (
  school_id uuid PRIMARY KEY REFERENCES public.schools(id) ON DELETE CASCADE,
  is_open boolean NOT NULL DEFAULT false,                 -- seasonal accept/close (distinct from the platform flag)
  application_fee integer NOT NULL DEFAULT 0,             -- PAISE (Razorpay unit); forced 0 when online_payments OFF
  admission_academic_year_id uuid REFERENCES public.academic_years(id),  -- NULL ⇒ fall back to active year
  next_ref_seq integer NOT NULL DEFAULT 1,               -- per-school atomic counter for reference_no
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```
> Row is created (defaults) the first time a school opens admissions. `application_fee` is **paise** to match the Razorpay
> boundary (`create-razorpay-order` validates `amount_paise`); the settings UI accepts rupees and multiplies by 100.

**(c) `admission_applications`** (one row per application; payment self-contained per D17):
```sql
CREATE TABLE public.admission_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),   -- the admission target year (D9)
  reference_no text NOT NULL,                                            -- "A-1042", unique per school
  -- applicant
  applicant_name text NOT NULL,
  date_of_birth date,
  gender text CHECK (gender IN ('male','female','other')),
  class_applied_id uuid NOT NULL REFERENCES public.classes(id),
  -- parent / guardian
  parent_name text NOT NULL,
  parent_phone text NOT NULL,                                            -- normalized +91XXXXXXXXXX
  parent_email text,
  -- optional
  previous_school text, area text, applicant_note text,
  -- pipeline
  stage public.admission_stage NOT NULL DEFAULT 'enquiry',
  source public.admission_source NOT NULL DEFAULT 'online',
  assigned_to uuid REFERENCES auth.users(id),
  -- review fields (D17 card fields)
  entrance_test_score numeric,
  docs_reviewed boolean NOT NULL DEFAULT false, docs_note text,
  internal_notes text, rejection_reason text,
  -- payment (self-contained; NOT fee_line_items — applicant has no student row)
  fee_amount integer NOT NULL DEFAULT 0,                                 -- paise, snapshot at submit
  payment_status public.admission_payment_status NOT NULL DEFAULT 'not_required',
  razorpay_order_id text, razorpay_payment_id text,
  -- convert
  converted_student_id uuid REFERENCES public.student_profiles(id), converted_at timestamptz,
  -- meta / abuse
  submit_ip inet,                                                        -- online source only, for rate-limit + forensics
  created_by uuid REFERENCES auth.users(id),                            -- NULL for public, set for walk-in
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, reference_no)
);
CREATE INDEX idx_adm_app_school_stage ON public.admission_applications(school_id, stage);
CREATE INDEX idx_adm_app_phone_time   ON public.admission_applications(parent_phone, created_at);  -- rate-limit
CREATE INDEX idx_adm_app_ip_time      ON public.admission_applications(submit_ip, created_at);      -- rate-limit
```
**Board visibility rule:** the Kanban shows rows where `payment_status <> 'pending'` (paid or not_required). `pending`
rows are hidden until the webhook flips them, surfaced only via the "Awaiting payment" filter.

**(d) `admission_stage_events`** (audit trail):
```sql
CREATE TABLE public.admission_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.admission_applications(id) ON DELETE CASCADE,
  school_id uuid NOT NULL,                                 -- denormalized for RLS
  from_stage public.admission_stage,                       -- NULL on creation
  to_stage public.admission_stage NOT NULL,
  actor_id uuid REFERENCES auth.users(id),                 -- NULL for public/system
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_adm_event_app ON public.admission_stage_events(application_id, created_at);
```

**Reference number** = `'A-' || next_ref_seq`, produced by an atomic
`UPDATE admission_settings SET next_ref_seq = next_ref_seq + 1 WHERE school_id=$1 RETURNING next_ref_seq` inside the same
transaction as the application INSERT (walk-in RPC + submit edge fn). No sequence, no race.

## 2. Public edge function `admission-submit` (the only unauthenticated write)

Clone the `create-razorpay-order` shape (`supabase/functions/create-razorpay-order/index.ts`) **minus the auth gate**
(lines 19-55) and the anon client — construct only the service-role client. Deno `serve` + `esm.sh` supabase-js.

**Made public** via `config.toml`:
```toml
[functions.admission-submit]
verify_jwt = false
```
(precedent: `send-welcome-sms` runs unauthenticated behind a custom secret). CORS = the existing OPTIONS early-return with
`Access-Control-Allow-Origin: *`.

**Request** `{ school_id, form_ts, honeypot, applicant_name, date_of_birth, gender, class_applied_id, parent_name,
parent_phone, parent_email, previous_school, area, applicant_note }`.

**Flow:**
1. **Bot traps → silent fake-success** (return `200 {ok:true}` WITHOUT inserting): if `honeypot` non-empty, or
   `now - form_ts < 2000ms`. (Don't reveal the trap.)
2. **Resolve + validate school:** load `schools` by `school_id`; require `feature_enabled(school_id,'admissions')` AND
   `admission_settings.is_open` → else `200 {ok:false, reason:'closed'}` (form shows "not accepting applications").
3. **Rate-limit** (soft): `COUNT` `admission_applications` in the last hour by `parent_phone` (≥3 ⇒ reject) and by
   `submit_ip` (≥10 ⇒ reject) → `429`-style soft message ("please contact the school directly").
4. **Validate required fields** (`applicant_name`, `class_applied_id`, `parent_name`, `parent_phone`); normalize phone
   `+91 + digits.slice(-10)` (same regex as `resolve-parent:33-36`).
5. **Resolve target year:** `admission_settings.admission_academic_year_id` ?? `get_active_academic_year(school_id)`.
6. **Compute fee:** `feature_enabled(school_id,'online_payments') ? admission_settings.application_fee : 0`.
7. **Insert application** in one tx (increment `next_ref_seq` → `reference_no`; `submit_ip` from `x-forwarded-for`;
   `source='online'`, `created_by=NULL`):
   - **fee = 0:** `payment_status='not_required'`, `stage='enquiry'`; insert `stage_events(NULL→enquiry)`; call
     `notify_admins_of_application` **(no-op in v1 — see §8)**; return `{ok:true, reference_no}`.
   - **fee > 0:** `payment_status='pending'`, `stage='enquiry'` (hidden while pending). Create Razorpay order (§3) with
     per-school creds; store `razorpay_order_id`; return `{ok:true, reference_no, order_id, key_id, amount}` so the form
     opens checkout.
8. All error/edge responses are `200` with an `ok:false` reason (the public form maps them to friendly copy) except hard
   `500`s.

## 3. Payment: order-in-call + webhook extension (fee path only ⇒ depends on ERP-63)

**Order creation** happens inside `admission-submit` (step 7, fee>0). It uses the **per-school** gateway from ERP-63:
`school_payment_gateways.key_id` + `get_payment_secret(school_id,'razorpay')` (Vault). Order `notes: { application_id }`
(the reconciliation key — distinct from the student-fee path's `notes.student_id`). Returns `key_id` to the form (parent
opens Razorpay checkout in-page). If the gateway is `unconfigured`, submit returns `{ok:false, reason:'payments_unavailable'}`.

**Webhook** = **extend** `supabase/functions/razorpay-webhook/index.ts` (do NOT add a second function — Razorpay posts all
events for an account to one URL). After parsing `payment.notes` (webhook:66-76), branch:
```
if (notes.application_id) {
  // keep idempotency check (webhook:81-92, keyed on razorpay_payment_id)
  // resolve school_id from the admission_applications row (NOT from a student)
  // UPDATE admission_applications SET payment_status='paid', razorpay_payment_id=... WHERE id=notes.application_id AND payment_status='pending'
  // INSERT stage_events(from=NULL/pending, to='enquiry')   -- app becomes a LIVE enquiry (appears on board)
  // return 200
}  // else: existing student-fee reconciliation (steps 2-6) unchanged
```
Rides on ERP-63's per-school webhook-secret verification (F1 §6.3). Webhook is **NOT** gated on any feature flag (record
money that actually moved). Unpaid rows just remain `pending` — no cron cleanup in v1.

## 4. Write RPCs (SECURITY DEFINER, `SET search_path=''`, self-authorizing — mirror homework/leave)

All GRANT EXECUTE to `authenticated`; each re-derives `get_my_school_id()`/`get_my_role()` and checks
`feature_enabled(school,'admissions')`.
- **`create_walkin_application(...)`** — authenticated twin of the public submit. `source='walk_in'`,
  `payment_status='not_required'` (walk-ins skip online fee, D10-impl), `created_by=auth.uid()`, `stage='enquiry'`;
  increments the ref counter; inserts `stage_events(NULL→enquiry)`. Authz: `school_admin`/`principal` (+super).
- **`advance_application(p_id, p_to_stage, p_note)`** — stage move **+** `stage_events` insert, atomically. Reject =
  `p_to_stage='rejected'` with `p_note` → `rejection_reason`. **Rejects a direct move to `enrolled`** (enrolment only via
  the convert path). Authz: `school_admin`/`principal` (+super) of the row's school.
- **`save_application_review(p_id, p_score, p_docs_reviewed, p_docs_note, p_internal_notes, p_assigned_to)`** — non-stage
  card edits (also allows correcting applicant/parent typos in an extended variant). No stage_event.
- **`save_admission_settings(p_is_open, p_fee, p_year_id)`** — `school_admin` (+super). **Enforces
  `online_payments` ON when `p_fee>0`** (else raises) — server-side truth so a stale fee can't charge.
- **`finalize_conversion(...)`** — see §5.
- **`get_public_admission_config(p_school_domain text)`** — `SECURITY DEFINER`, **GRANT to `anon`** (mirrors
  `get_active_academic_year`). Returns public-safe JSON: school name/logo/primary_color, `is_open`, effective
  `application_fee` (already 0 if online_payments off), and the target-year class list. The only anon read path.

## 5. Convert (two-phase — server action + finalize RPC)

Route `POST /api/admissions/[id]/convert` (Next.js, mirrors `resolve-parent`; needs `auth.admin`).
**Phase 1 (server action, service-role):** `getUser` → authz (`school_admin`/`principal`/`super_admin` at school, exactly
`resolve-parent:21-31`) → guard `stage='offered'` AND `converted_student_id IS NULL` → `findOrCreateUserByPhone(admin,
parent_phone, parent_name)` + `attachRole(admin, uid, school, 'parent')`.
**Phase 2 (`finalize_conversion(p_app_id, p_parent_profile_id, p_section_id, p_roll_number, p_admission_number)` — SECURITY
DEFINER, single transaction):**
- Re-check `converted_student_id IS NULL` under row lock → else `RAISE EXCEPTION 'already_converted'` (idempotency).
- INSERT `student_profiles` (name/dob/gender/email + `admission_number` + `parent_profile_id`) — shape from
  `add-student-drawer.tsx:118-130`.
- INSERT `student_enrollments` (`class_id=class_applied_id`, `section_id`, `roll_number`, `academic_year_id`=the app's
  target year, `is_active=true`) — shape from `add-student-drawer.tsx:137-145`.
- UPDATE the application: `converted_student_id`, `converted_at=now()`, `stage='enrolled'`; INSERT `stage_events(offered→enrolled)`.
- INSERT `audit_log` (`action='admission_convert'`, `entity_type='admission_application'`, `entity_id=p_app_id`,
  `performed_by`, `acting_as_role`, `metadata`) — the first real `audit_log` writer.
- RETURN `student_id`.
**Then** server action fires `sendParentWelcomeSms(parent_phone, parent_name, applicant_name, school.domain)` and (once KYC
lands) seeds the student's KYC checklist. Atomicity: the 5-table write is one txn; a Phase-2 failure leaves no half-built
student (the parent auth-user is idempotent, reused on retry).

## 6. RLS (mirror `leave_requests` — SELECT-only, no write policies)

`ENABLE ROW LEVEL SECURITY` on all three tables; **no write policies** (writes via the SECURITY DEFINER RPCs / service-role,
which self-authorize). Each SELECT policy: `super_admin` bypass OR (`school_id=get_my_school_id()` AND
`get_my_role() IN ('school_admin','principal')` AND `feature_enabled(school_id,'admissions')`).
- `admission_applications_select`, `admission_stage_events_select` (via denormalized `school_id`) — admin/principal only.
- `admission_settings_select` — admin/principal (settings UI). The **public** page never reads the table; it calls the
  anon `get_public_admission_config` RPC (§4). `admission-submit` reads settings via service-role.

## 7. Feature-flag wiring (`admissions` key — F1 hard dep)

`admissions` is already reserved in the F1 registry (`packages/shared/src/features/registry.ts`, seeded `false`). Gate points:
1. Public `/apply` page (server component): resolve school by subdomain → `feature_enabled` off (or school missing) ⇒ 404 /
   "not accepting applications". Reads config via the anon RPC.
2. `admission-submit` edge fn: **explicit** `feature_enabled` check (service-role bypasses RLS — F1 §2.5).
3. Nav item (`nav-config.ts`): add `{ label:'Admissions', href, feature:'admissions' }` for `school_admin` + `principal`;
   filter after `(school)/layout.tsx:172` (also add `features_enabled` to the layout's `schools` select at :63).
4. Board page + write RPCs: RLS `feature_enabled` gate (RPCs re-check).
`admission_settings.is_open` = the school's seasonal accept/close, orthogonal to the platform flag.

## 8. Notifications (D17 + user correction: no web in-app UI exists)

- **Inbound (admins):** **NO in-app `notifications` rows** — the web app has no notification consumer (the `notifications`
  table is read only by mobile parent screens: `apps/mobile/app/(parent)/more.tsx`, `parent-counts.tsx`). The admin signal
  is a **count badge on the Admissions nav item + the Enquiry column** = `COUNT(*) WHERE stage='enquiry'` (the untriaged
  inbox). `notify_admins_of_application` is a **no-op placeholder** in v1 (wire real fan-out if a web notification center
  is ever built).
- **Outbound (parent) — offer SMS:** on the move to `offered`, the board invokes a new **`send-admission-offer-sms`** edge
  function — a clone of `send-welcome-sms` (Nettyfish provider, `x-<name>-secret` gate, deployed `--no-verify-jwt`) + a
  thin server wrapper `apps/web/lib/provisioning/send-admission-offer-sms.ts`, with the offer template. Reject = **no
  message** (D17). This follows the "RPC moves state, app-layer invokes notify" pattern (homework/attendance).
- **Submit confirmation:** on-page ref-number screen (`admission-apply-public.html` screen 2) — no infra.

## 9. Academic-year targeting (D9)

Applications + convert-time enrollments use `admission_settings.admission_academic_year_id ?? get_active_academic_year()`.
A `draft` (upcoming) target year is valid — students admitted for next year sit in next year's enrollment. The public
form's class list and convert's section dropdown scope to this target year.

## 10. Surfaces (mockups → build targets)

Web-only (D17). All in `stitch-designs/eduos-v2/`:
- **Public `/apply`** (`admission-apply-public.html`) — branded (school logo/primary_color), single-page form + confirmation
  with `reference_no`; honeypot + `form_ts`; fee summary shown only when `online_payments` ON. Route lives OUTSIDE the
  `(school)` auth group; resolves school by subdomain.
- **Admin board** (`admission-board-web.html`) — under `(school)/admin/admissions`; 5-column Kanban + Rejected, share-link/QR,
  "Awaiting payment" filter, cards with duplicate/payment/test-score/source/assignee badges, "Add enquiry" drawer.
  Duplicate badge = non-terminal match on (`parent_phone`, lower(`applicant_name`)).
- **Review drawer + Enrol dialog** (`admission-review-web.html`) — stage stepper, details, review fields, activity
  (`stage_events`), Reject/Enrol footer; Enrol dialog collects section/roll#/admission#.
- **Settings panel** (co-located, flag-gated) — admitting-for year, `is_open` toggle, application fee (only when
  online_payments ON), public form URL/QR. (Reuses board tokens; no separate mockup — a small panel.)

## 11. Edge cases
1. **Abandoned payment** → app stays `payment_pending`, hidden from board, in "Awaiting payment" filter. No cron. ✔
2. **Duplicate** (same phone + applicant name, non-terminal) → soft badge; resolve-by-reject; siblings (diff name) pass. ✔
3. **Double convert** → `finalize_conversion` row-lock re-check raises `already_converted`; button disabled client-side. ✔
4. **online_payments turned OFF after a fee was set** → `save_admission_settings`/submit force fee 0 server-side. ✔
5. **Gateway unconfigured but fee>0** → submit returns `payments_unavailable`; settings UI hints to gateway setup. ✔
6. **admissions flag OFF** → `/apply` 404, edge fn rejects, nav hidden, board/RPCs denied. ✔
7. **is_open false** (flag on) → form shows "admissions closed"; submit returns `closed`. ✔
8. **Walk-in** → no online fee; straight to Enquiry. ✔
9. **Reapplication next cycle** → new target year ⇒ a fresh application; not a duplicate (different `academic_year_id`). ✔
10. **Applicant with no email** → allowed (phone drives everything); confirmation is on-page + optional SMS. ✔
11. **Spoofed school_id** → at worst routes a lead to another real admissions-on school; server re-validates. ✔
12. **Rejected/declined** → single Rejected terminal + `rejection_reason` note distinguishes school-reject vs applicant-decline. ✔
13. **Data retention (GDPR)** of rejected/unpaid leads → keep in v1; purge policy deferred. ✔

## 12. ERP ticket breakdown (Epic → stories; each cites arch D10/D17 + this doc § + mockup artifact + repo html path)
- **Epic: Admissions** — public form → pipeline → enrolled student (web-only; F1 hard dep; fee path deps ERP-63).
- **Story A — Data model + write RPCs + RLS:** 3 tables + 3 enums + ref counter (§1), the RPCs `create_walkin_application`/
  `advance_application`/`save_application_review`/`save_admission_settings`/`get_public_admission_config` (§4), SELECT-only
  RLS + flag gate (§6).
- **Story B — Public form + `admission-submit` edge fn:** branded `/apply` page (subdomain, outside auth group), the
  unauthenticated edge fn (`verify_jwt=false`, CORS, honeypot/time-trap, rate-limit, school+flag+is_open resolution, fee
  compute) (§2), on-page confirmation (§8). Non-fee path only.
- **Story C — Application fee (payment):** order-in-call with per-school creds + `notes.application_id`, `razorpay-webhook`
  extension (§3). **Depends on ERP-63.**
- **Story D — Admin board + review + settings:** Kanban (drag + intercepted Enrol/Reject drops), Add-enquiry drawer,
  review drawer, settings panel, nav gating, Enquiry-count badge (§7, §8, §10).
- **Story E — Convert to student:** two-phase server action + `finalize_conversion` RPC + first `audit_log` writer +
  offer-SMS edge fn (`send-admission-offer-sms`) (§5, §8).
