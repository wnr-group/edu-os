# F1 — Module Toggle: Implementation Design & Edge Cases

> Companion to `2026-07-22-eduos-feature-architecture-design.md` (decisions D1–D14).
> Grounded in the current codebase (file:line references are real). This is the technical basis for the F1 Jira tickets.
>
> **Why F1 is buildable now:** it gates features that already exist. `schools.features_enabled` already exists
> (`supabase/migrations/20240001000001_tenancy.sql:9`) but is read/written **nowhere** today. New modules simply
> register a key later. So F1 ships against existing modules; new modules adopt it on arrival (D3).

---

## 0. Grounding facts (verified in code)

| Area | Fact | Ref |
|---|---|---|
| Flag column | `features_enabled JSONB NOT NULL DEFAULT '{}'` on `schools` — **used nowhere** | tenancy.sql:9 |
| RLS shape | Each table: one `"<t>_select"` (FOR SELECT) + one `"<t>_write"` (FOR ALL, USING+WITH CHECK); flat booleans over `get_my_role()` + `school_id = get_my_school_id()` | rls.sql, teacher_write_scope.sql:88, attendance_write_scope.sql:43 |
| Scope helpers | `get_my_school_id()`, `get_my_role()` read tx-local GUCs set by `scope_pre_request()` from `x-school-id`/`x-active-role` headers; fail closed | scope_hook.sql:6,102,108 |
| Teacher scope | `teaches_section/student/class`, `can_write_section_attendance` (SECURITY DEFINER) | teacher_write_scope.sql:23+ |
| Next migration | `20240001000063_*.sql` (latest is `…062_files_bucket.sql`) | — |
| Vault | `_vault_get(name)` SECURITY DEFINER, REVOKED from anon/authenticated; flat global name→secret, no tenant column; consumers no-op on NULL | cron_vault_rework.sql:21 |
| Razorpay creds | ENV-only in edge fns (`RAZORPAY_KEY_ID/SECRET`, `RAZORPAY_WEBHOOK_SECRET`); **no DB storage, one global set for all schools** | create-razorpay-order:4-5; razorpay-webhook:3 |
| school_id in payments | not passed in; derived from `student_profiles.school_id` via `student_id` | razorpay-webhook:94-99 |
| Edge functions | no `_shared` module, no Vault reads, no feature checks — all greenfield; two-client (anon+service) pattern | — |
| Web flags load path | rides with `primary_color`: `app/(school)/layout.tsx:63` `.select("name, primary_color")` → add `features_enabled` | layout.tsx:59-70 |
| Web nav | `lib/nav-config.ts` `NAV_CONFIG` (per role); filter in `(school)/layout.tsx` after :172 | nav-config.ts:34 |
| Web school console | `platform-admin/schools/[id]/page.tsx:80` tabs array (add Modules); update via `api/schools/[id]/route.ts` PATCH (super_admin, allowlist :21) | page.tsx:80, route.ts:21 |
| Mobile | expo-router; parent `fees` tab `(parent)/_layout.tsx:41`; `href:null` hides a tab; schools row fetched only in `lib/theme.tsx:53` (add features there); pay UI in `(parent)/fees.tsx` uses RN Razorpay + `create-razorpay-order`; key_id from build-time `EXPO_PUBLIC_RAZORPAY_KEY_ID` | — |
| Security gap | `schools_update` lets **school_admin** write the schools row → a school could flip its own flags. Toggle writes MUST be locked to super_admin at the DB level | fix_schools_update_rls.sql:4 |

---

## 1. Feature registry (code — single source of truth)

`packages/shared/src/features/registry.ts` — typed const consumed by web, mobile, edge, and the console.

```ts
export type FeatureKey =
  | 'attendance' | 'attendance_geo' | 'homework' | 'exams' | 'exam_schedule'
  | 'report_cards' | 'syllabus' | 'timetable'
  | 'admissions' | 'kyc_documents' | 'leave' | 'testing'
  | 'fees' | 'online_payments'
  | 'announcements' | 'gallery' | 'feedback' | 'discipline'
  | 'insights';

export interface FeatureDef {
  key: FeatureKey; label: string; category: 'Academics'|'Operations'|'Finance'|'Communication'|'Intelligence';
  defaultOn: boolean;              // seed value for new schools + backfill for existing
  status: 'existing'|'new';        // 'existing' → enforce+retrofit now; 'new' → key present, no-op until module ships
  dependsOn?: FeatureKey[];        // console blocks enabling until deps on (e.g. insights)
  gatesTables?: string[];          // tables whose RLS gets the feature_enabled() conjunct
  gatesFunctions?: string[];       // edge/cron functions that must add an explicit check (RLS-bypass paths)
}
```

- **Core/structural modules are NOT in the registry** (students, teachers, classes, subjects, academic years, settings, dashboard) — always on, never toggleable.
- `insights.dependsOn = ['attendance','exams','fees']`; `online_payments.dependsOn = ['fees']`; `attendance_geo.dependsOn = ['attendance']`; `exam_schedule.dependsOn = ['exams']`.
- `gatesTables` examples: `fees` → `fee_structures, fee_types, fee_line_items, fee_payments, payments, line_item_payments`; `homework` → `homework, homework_attachments, homework_status`; `announcements` → `announcements`; etc.
- `gatesFunctions` examples: `homework` → `send-homework-notification, send-homework-reminders`; `exams`/`report_cards` → `generate-report-card`; `online_payments` → `create-razorpay-order`.

---

## 2. DB layer

### 2.1 `feature_enabled()` — the authoritative gate
```sql
-- migration 20240001000063_feature_flags.sql
CREATE OR REPLACE FUNCTION public.feature_enabled(p_school_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((s.features_enabled ->> p_key)::boolean, false)   -- ABSENT = OFF (fail-safe)
  FROM public.schools s WHERE s.id = p_school_id;
$$;
GRANT EXECUTE ON FUNCTION public.feature_enabled(uuid, text) TO authenticated, service_role;
```
**Absent = OFF** is the safe default, which makes **seeding mandatory and ordering critical**: seed `features_enabled`
for all schools **before** any RLS retrofit enforces the gate (else existing modules go dark).

### 2.2 Seeding & defaults
Same migration (063) backfills every existing school and installs a seed for new ones:
```sql
-- backfill: existing modules ON, new modules per registry defaultOn
UPDATE public.schools SET features_enabled = features_enabled || jsonb_build_object(
  'attendance',true,'homework',true,'exams',true,'report_cards',true,'syllabus',true,'timetable',true,
  'fees',true,'announcements',true,'gallery',true,'feedback',true,'discipline',true,
  'attendance_geo',false,'exam_schedule',false,'admissions',false,'kyc_documents',false,
  'leave',false,'testing',false,'online_payments',false,'insights',false
);
-- new-school seed: BEFORE INSERT trigger applies the same default map when features_enabled = '{}'
```
When a NEW module later ships on-by-default, its migration adds a one-line backfill for that key (D3).

### 2.3 Lock toggle writes to super_admin (fixes the security gap)
RLS is row-level, not column-level, and `schools_update` allows school_admin. Guard the column with a trigger:
```sql
CREATE OR REPLACE FUNCTION public.guard_features_enabled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.features_enabled IS DISTINCT FROM OLD.features_enabled
     AND public.get_my_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'Only platform admins can change module toggles';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_features BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.guard_features_enabled();
```
Writes flow through the existing super_admin-only endpoint (`api/schools/[id]/route.ts`) which uses the service-role
client (service_role has `get_my_role()` NULL → trigger must also allow service_role: add `OR current_user = 'service_role'`
or set a GUC; the console PATCH runs as super_admin service call — document the exact allow condition in the ticket).
Every toggle write also inserts an `audit_log` row (existing table).

### 2.4 RLS retrofit pattern (existing modules, incremental)
Add the gate to the **non-super_admin branch** so platform admins are never locked out. Example (`homework`):
```sql
-- BEFORE (teacher_write_scope.sql:88)
CREATE POLICY "homework_write" ON public.homework FOR ALL
  USING ( get_my_role()='super_admin'
    OR (get_my_role()='school_admin' AND school_id=get_my_school_id())
    OR (get_my_role()='teacher' AND school_id=get_my_school_id() AND teaches_section(section_id)) )
  WITH CHECK ( ...same... );

-- AFTER (retrofit migration)
CREATE POLICY "homework_write" ON public.homework FOR ALL
  USING ( get_my_role()='super_admin'
    OR ( public.feature_enabled(school_id,'homework') AND (
         (get_my_role()='school_admin' AND school_id=get_my_school_id())
      OR (get_my_role()='teacher' AND school_id=get_my_school_id() AND teaches_section(section_id)) )) )
  WITH CHECK ( ...same shape... );
```
Reads: add `feature_enabled(school_id,'homework')` to the non-super branch of `"homework_select"` too (so a disabled
module returns no rows for school users, super_admin still sees all). Each retrofit table = its own migration + an **RLS
isolation test** (spec §9). Order: run **after** seeding (063).

### 2.5 Service-role bypass (critical)
`generate-report-card`, cron jobs (`send-homework-reminders`, `send-birthday-wishes`), and `razorpay-webhook` use the
**service-role client → RLS does not apply**. Feature gating there is NOT covered by RLS; add an **explicit**
`feature_enabled(school_id, key)` check inside those functions (via the `feature_enabled` RPC or a direct
`schools.features_enabled` read). Cron jobs no-op the disabled school; `generate-report-card` refuses.

---

## 3. Super-admin console (web)
- New tab in `platform-admin/schools/[id]/page.tsx:80`: `{ key:'modules', label:'Modules', content:<ModulesTab school={school}/> }` (school row already `.select("*")` → `features_enabled` present).
- `ModulesTab` (client, modeled on `overview-tab.tsx`): grouped switches from the registry; dependency guard (can't enable `insights` until deps on); optimistic toggle → PATCH.
- Persist: add `"features_enabled"` to the allowlist at `api/schools/[id]/route.ts:21` **or** a dedicated `PATCH /api/schools/[id]/features` (super_admin only, `hasAnyRole(['super_admin'])` already enforced at route.ts:14-17). Writes `audit_log`.
- Matches the F1 mockup `stitch-designs/eduos-v2/f1-module-toggle-web.html`.

## 4. Web gating
- **Flags load:** add `features_enabled` to `(school)/layout.tsx:63` `.select(...)`; add `getSchoolFeatures()` to `lib/school-brand.ts` (service-role) mirroring `getSchoolBrand()`.
- **Nav:** add optional `feature?: FeatureKey` to `NavItem` (`nav-config.ts:1`); filter `navConfig.frequent`/`.sections` in `(school)/layout.tsx` after :172 → TopBar + MobileNav receive pre-filtered lists.
- **Routes:** middleware (`middleware.ts:234-252`) already gates by role prefix; add a feature→path map + `features_enabled` fetch (net-new) to redirect disabled-module routes, or a per-page `getSchoolFeatures()` guard. Belt-and-braces: RLS already denies data even if a route slips through.
- **`useFeature(key)`:** seed a small client `FeaturesProvider` from the layout's `features_enabled` (codebase currently passes server values as props — do the same, plus a provider for client components).

## 5. Mobile gating
- **Flags load:** extend `lib/theme.tsx:53` `schools` select to include `features_enabled`; expose via a `FeaturesProvider` (mirror ThemeProvider) using build-time `SCHOOL_ID`.
- **Tabs:** conditionally set `href: null` on `fees` in `(parent)/_layout.tsx:41` when `online_payments` (and/or `fees`) off — same pattern already used for hidden `homework`.
- **Pay affordances:** hide "Select All & Pay" (`fees.tsx:391`), "Pay ₹…" (`fees.tsx:454`), and the dashboard "Pay Fees" quick action (`dashboard.tsx:137`) when `online_payments` off. Read-only balance/history can remain under `fees`.
- **`more.tsx` sub-sections** (announcements/discipline/feedback) are in-screen `<ListItem>`s (`more.tsx:478`) → conditionally render by feature.

## 6. Per-school Razorpay credentials (D14)
### 6.1 Storage
- New metadata table `public.school_payment_gateways` — **no secrets here**: `school_id (PK/FK), provider ('razorpay'), key_id text (public), mode text GENERATED from key_id prefix, status ('unconfigured'|'connected'), account_name, updated_by, updated_at`. RLS: super_admin + school_admin of that school may `SELECT`/`UPDATE` (key_id is public); secrets never stored/returned here.
- **Secrets → Vault**, namespaced by school: `razorpay_key_secret::<school_id>`, `razorpay_webhook_secret::<school_id>` (Vault has no tenant column). Written only via a super_admin/service path.
- Accessor `public.get_payment_secret(p_school_id uuid, p_kind text) RETURNS text` SECURITY DEFINER, **REVOKED from anon/authenticated** (like `_vault_get`), callable by `service_role` only (edge functions). Never exposed to clients.

### 6.2 create-razorpay-order rewrite (`functions/create-razorpay-order`)
1. After auth (parent) + student-ownership check, **derive `school_id`** from `student_profiles.school_id` (the join the webhook already does).
2. **Check `feature_enabled(school_id,'online_payments')`** (explicit — service-role bypasses RLS) → 403 if off.
3. Fetch this school's `key_id` (table) + `key_secret` (`get_payment_secret`) → if unconfigured, 409 "payments not set up".
4. Call Razorpay with the per-school Basic auth; **return `key_id` in the response** so the client stops using build-time `EXPO_PUBLIC_RAZORPAY_KEY_ID` (fixes multi-tenant + mobile drift).

### 6.3 razorpay-webhook rewrite (chicken-and-egg)
One webhook URL, many schools. Resolve **before** verifying: parse the (untrusted) body → `notes.student_id` →
`student_profiles.school_id` → `get_payment_secret(school_id,'webhook')` → **then HMAC-verify** the raw body against
that secret; 401 if missing/mismatch. Forging a body can't forge a valid signature without the school's secret, so this
is safe. **Do NOT gate the webhook on `online_payments`** — if the flag was flipped off after the order, the money still
moved and the payment must be recorded (idempotent insert already exists at webhook:81-92).

### 6.4 Test connection & go-live
- `POST /api/schools/[id]/payments/test` (super_admin/school_admin) → server calls Razorpay with the saved keys (e.g. fetch a dummy order) → returns ok/mode. Never returns the secret.
- "Switch to live": school pastes `rzp_live_…` keys → test → confirm → save. Mode is derived from the key prefix (read-only badge), never a free toggle.

---

## 7. Edge cases (exhaustive)

1. **Absent key** → `feature_enabled` returns false (fail-safe). Mitigation: mandatory seed (063) BEFORE any retrofit.
2. **New module ships on-by-default later** → existing schools lack the key → off. Its migration must backfill the key.
3. **super_admin must bypass the gate** → gate ANDs only the non-super branch of each policy; super_admin unconditional.
4. **Service-role paths bypass RLS** (cron, report-card, webhook) → need explicit `feature_enabled` checks; RLS alone is insufficient.
5. **school_admin flips own flags** → blocked by the `guard_features_enabled` trigger (super_admin only).
6. **Toggle off mid-session** → web nav hides next render; in-flight writes hit RLS/edge 403 → show "module disabled" toast/redirect, not a raw error. Mobile refetches features on next session/foreground.
7. **online_payments off but webhook arrives for an in-flight order** → webhook still records (money moved); only order-creation is gated. Idempotency prevents double-record.
8. **Gateway not configured but online_payments on** → order-creation returns 409; pay UI shows "payments not set up"; treat as not-payable.
9. **key_id/secret mode mismatch** (live id + test secret) → Razorpay API/test-connection errors; surfaced in "Test connection".
10. **Forged webhook body with victim student_id** → can't produce a valid signature without that school's webhook secret → 401.
11. **Vault has no tenant column** → namespaced secret names + school-scoped `get_payment_secret` (service-role only).
12. **Mobile build-time key_id drift** → order function returns key_id; client uses returned value.
13. **Dependency violation** (enable insights with exams off) → console blocks; insights recompute/edge also no-ops if deps off (defense in depth).
14. **Reads vs writes** → gate both `_select` and `_write`; a disabled module shows no data AND rejects writes.
15. **Staleness window** → features cached per web request / per mobile session; a toggle isn't instant on already-loaded clients. Acceptable; optionally add a realtime subscription later.
16. **Retrofit ordering** → seed (063) → then per-module retrofit migrations (064+); never enforce before seed.
17. **Certificates/report-card templates** span `report_cards` + `exams` → decide which key gates shared tables; document the mapping in the registry `gatesTables`.
18. **Backfill idempotency** → use `features_enabled || jsonb_build_object(...)` (merge, don't overwrite) so re-runs and existing keys are preserved.

---

## 8. F1 Jira Epic → tickets (build order within the epic)
1. **Feature registry + `feature_enabled()` + seeding + guard trigger** (migration 063; `packages/shared` registry). *No enforcement yet — safe.*
2. **Super-admin Modules console** (web tab + PATCH endpoint + audit + dependency guard). Matches mockup.
3. **Web gating** (layout features load, nav filter, route middleware, `useFeature`).
4. **Mobile gating** (FeaturesProvider, tab `href:null`, hide pay affordances, `more` sub-sections).
5. **RLS retrofit** (per-module or batched migrations adding the gate to `_select`/`_write`; + isolation tests). Runs after (1).
6. **`online_payments` enforcement** (explicit checks in `create-razorpay-order` + hide mobile pay UI) — first real hard-gate.
7. **Per-school Razorpay credentials** (`school_payment_gateways` table + Vault namespacing + `get_payment_secret` RPC + order/webhook rewrite + console config UI + test-connection + go-live).
8. **Tests** (RLS isolation per retrofitted table, feature-gate unit tests, e2e toggle-hides-module, payment-disabled server-block).

Each ticket carries: purpose, touched files (from §0), migration/DDL, acceptance criteria, test cases, dependencies, and links to this doc + the mockup.
