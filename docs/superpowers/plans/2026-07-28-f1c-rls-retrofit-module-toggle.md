# F1-C — RLS Retrofit: Gate Existing Modules Behind `feature_enabled()` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `public.feature_enabled(school_id, key)` as an extra conjunct to the non-super_admin branch of every existing module's RLS `_select`/`_write` policies (and the handful of service-role-bypass code paths those modules own), so that turning a module OFF for a school also blocks DB reads and writes for that school — not just hides UI. `super_admin` stays unconditional throughout.

**Architecture:** Ten independent, sequential migrations (one per module, matching the ticket's own grouping), each adding a `feature_enabled(school_id,'<key>')` conjunct to the *existing* non-super_admin branch of that module's policies — no policy is redesigned, only gated. Each migration ships with a hand-written RLS isolation test (raw SQL, run via `supabase db query`) that proves: module OFF → zero rows on read, write rejected; module ON → normal access restored; `super_admin` unaffected either way. Three edge functions and four `SECURITY DEFINER` RPCs that bypass RLS (service-role / owner-bypass paths) get an explicit `feature_enabled()` check added alongside their existing authorization checks.

**Tech Stack:** PostgreSQL 17 RLS policies (Supabase migrations, `supabase/migrations/*.sql`), Deno edge functions (`supabase/functions/*/index.ts`), Supabase CLI (`npx supabase`) for local apply/test — no new test framework; this repo has zero existing test infrastructure (`no pgTAP, no vitest/jest, no supabase/tests directory`), so this plan establishes a minimal raw-SQL RLS-test convention using only tools already in the repo.

## Global Constraints

- **Hard dependency — do not skip:** this plan requires `public.feature_enabled(uuid, text)` and the `schools.features_enabled` seed/backfill (ERP-60, per `docs/superpowers/specs/2026-07-24-f1-module-toggle-implementation.md` §2.1–2.2, expected as migration `20240001000063_feature_flags.sql`) to already be applied. **Task 1, Step 1 verifies this and the plan must not proceed past it if the function is missing** — do not fabricate or duplicate `feature_enabled()` here; it belongs to ERP-59/60, a separate ticket.
- **Migration numbering:** as of this writing the latest migration in the repo is `20240001000062_files_bucket.sql`, and this plan assumes ERP-60 lands as `...000063_feature_flags.sql`, so this plan's migrations are numbered `064`–`073`. **If the actual next-free index differs when you execute this plan** (ERP-60 landed under another number, or other migrations landed first), renumber every migration filename in this plan sequentially starting at the real next-free index, preserving relative order (attendance → homework → exams → fees → announcements → gallery → discipline → feedback → syllabus → timetable) — later ones don't depend on earlier ones' content, only on `feature_enabled()` existing.
- **Feature keys used** (verbatim from the registry's `FeatureKey` union in the impl doc §1): `attendance`, `homework`, `exams`, `fees`, `announcements`, `gallery`, `discipline`, `feedback`, `syllabus`, `timetable`.
- **Scope correction vs. the ticket text:** the ticket lists `fee_structures` and `fee_payments` under the fees module. Both tables were **dropped** by migration `20240001000035_fee_types.sql` ("DROP TABLE IF EXISTS public.fee_payments/fee_structures CASCADE") and replaced by `fee_types` + `fee_line_items` + `payments` + `line_item_payments`. This plan gates the tables that actually exist today: `fee_types`, `fee_line_items`, `payments`, `line_item_payments`.
- **Scope clarification:** "attendance_records (+ sessions)" in the ticket refers to the `session` enum column (`FULL_DAY`/`FN`/`AN`) added to `attendance_records` by migration `20240001000042_attendance_sessions.sql` — there is no separate `attendance_sessions` table. Only `attendance_records` needs gating.
- **Gate pattern (every policy):** add `public.feature_enabled(school_id, '<key>')` as an `AND` conjunct inside the **non-super_admin** branch only. `super_admin`'s branch (`public.get_my_role() = 'super_admin'`) is never touched — this is edge case 3 in the impl doc and the ticket's own acceptance criterion.
- **Two pre-existing bugs get fixed as a side effect, not extra scope:** `homework_attachments_write` currently ANDs the role check with `school_id = get_my_school_id()` with **no** `super_admin OR` bypass (unlike its sibling `homework_write`, already fixed in migrations 012/040). Gating it as-is would newly lock `super_admin` out whenever they act without an `x-school-id` header, violating this ticket's own acceptance criterion ("super_admin unaffected"). Task 2 restructures it to the same `super_admin OR (...)` shape already used everywhere else in this codebase — this is required to satisfy the acceptance criterion, not scope creep.
- **Service-role / RLS-bypass paths in scope** (impl doc §2.5, ticket's "Service-role paths" list): `generate-report-card` (Task 3), `send-homework-reminders` + `send-homework-notification` (Task 2). **Additionally in scope, not named in the ticket text but functionally identical to a service-role bypass:** the four `SECURITY DEFINER` RPCs `mark_homework_viewed`/`mark_homework_done`/`unmark_homework_done`/`review_homework` (migration `20240001000048_homework_rpcs.sql`) are `homework_status`'s **only** write path (there is no `homework_status` INSERT/UPDATE RLS policy — RLS is deny-by-default there) and these functions run as their owner (bypassing RLS the same way service-role does), so without an explicit check inside them, "writes rejected when OFF" would not hold for `homework_status`. Task 2 adds the check there too.
- **`generate-report-card` is gated on the `exams` key**, not a separate `report_cards` key. The impl doc flags this exact ambiguity as edge case 17 ("decide which key gates shared tables; document the mapping") — this plan resolves it by using `exams` throughout, consistent with the ticket's own table grouping which places `report_card_templates` under the "exams" module, not a standalone "report_cards" module.
- **Explicitly out of scope** (do not touch): `create-razorpay-order` / `razorpay-webhook` (separate epic ticket per architecture doc §8 items 6–7 and decision D9); `send-birthday-wishes` / `send-attendance-notification` (no registry feature key covers either); the feature registry TS code, super-admin console, and web/mobile UI gating (ERP-59/61, separate tickets — this ticket is DB-layer only).
- **RLS isolation test convention** (established in Task 1, reused verbatim in Tasks 2–10): one file per module at `supabase/tests/rls/<module>.test.sql`. Run with `npx supabase db query --local -f supabase/tests/rls/<module>.test.sql` against a running local stack (`npx supabase start` first, once, out of scope of these steps). Each file:
  - Wraps everything in `BEGIN; ... ROLLBACK;` — fixtures and assertions never persist, so the test is safe to re-run any number of times.
  - Inserts fixture rows (school, academic year, class, section, subject, a generic staff `auth.users` row for audit FK columns, a generic student + parent for tables with a parent-read branch) **as the connecting role** (the Supabase CLI connects as the `postgres` superuser, which owns these tables and so bypasses RLS for setup — this is intentional and matches how the codebase's own prior manual RLS smoke-tests worked, see `docs/superpowers/plans/2026-06-13-user-role-login-rework/01-db-rls-scope.md` steps 4/251-258).
  - Switches into RLS-subject mode with `SET LOCAL ROLE authenticated;` then simulates the request-scope GUCs that `scope_pre_request()` (migration 038) sets in production: `SELECT set_config('app.role', '<role>', true); SELECT set_config('app.school_id', '<uuid or empty>', true);`. For assertions on a parent-read branch, additionally fakes `auth.uid()` the standard Supabase-local way: `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);`.
  - Asserts with `DO $$ BEGIN IF <bad-condition> THEN RAISE EXCEPTION 'FAIL: <what>'; END IF; RAISE NOTICE 'PASS: <what>'; END $$;` for reads, and a nested `BEGIN ... EXCEPTION WHEN insufficient_privilege THEN ... END` for writes that must be rejected (Postgres RLS `WITH CHECK` violations raise SQLSTATE `42501` = `insufficient_privilege`; the nested block's own exception handler creates a plpgsql savepoint so one caught failure doesn't abort the rest of the test).
  - Expected result for a passing run: the command exits 0, no `ERROR:` lines, and one `NOTICE: PASS: ...` line per assertion. Any `RAISE EXCEPTION 'FAIL: ...'` aborts the transaction (still safely rolled back) and the CLI exits non-zero — fix and re-run.
  - Shared fixture UUIDs (reused across every module's test — same numbers, never colliding with `seed.sql`'s `aaaaaaaa-…`/`bbbbbbbb-…` prefixes, verified by grep):
    - School: `a0000000-0000-0000-0000-000000000001`
    - Academic year (status `active`): `a0000000-0000-0000-0000-000000000002`
    - Class: `a0000000-0000-0000-0000-000000000003`
    - Section: `a0000000-0000-0000-0000-000000000004`
    - Subject: `a0000000-0000-0000-0000-000000000005`
    - Staff `auth.users` row (for audit FK columns like `marked_by`/`teacher_id`/`created_by`/`recorded_by`): `a0000000-0000-0000-0000-00000000001f`
    - Student `auth.users` row: `a0000000-0000-0000-0000-0000000000a1`; `student_profiles` row: `a0000000-0000-0000-0000-0000000000b1`
    - Parent `auth.users` row (for parent-read branches): `a0000000-0000-0000-0000-0000000000c1`

---

## File Structure

- `supabase/migrations/20240001000064_feature_gate_attendance.sql` — Task 1
- `supabase/tests/rls/attendance_records.test.sql` — Task 1
- `supabase/migrations/20240001000065_feature_gate_homework.sql` — Task 2 (also patches the 4 `homework_status` RPCs)
- `supabase/tests/rls/homework.test.sql` — Task 2
- `supabase/functions/send-homework-reminders/index.ts` — Task 2 (modify)
- `supabase/functions/send-homework-notification/index.ts` — Task 2 (modify)
- `supabase/migrations/20240001000066_feature_gate_exams.sql` — Task 3
- `supabase/tests/rls/exams.test.sql` — Task 3
- `supabase/functions/generate-report-card/index.ts` — Task 3 (modify)
- `supabase/migrations/20240001000067_feature_gate_fees.sql` — Task 4
- `supabase/tests/rls/fees.test.sql` — Task 4
- `supabase/migrations/20240001000068_feature_gate_announcements.sql` — Task 5
- `supabase/tests/rls/announcements.test.sql` — Task 5
- `supabase/migrations/20240001000069_feature_gate_gallery.sql` — Task 6
- `supabase/tests/rls/gallery.test.sql` — Task 6
- `supabase/migrations/20240001000070_feature_gate_discipline.sql` — Task 7
- `supabase/tests/rls/discipline.test.sql` — Task 7
- `supabase/migrations/20240001000071_feature_gate_feedback.sql` — Task 8
- `supabase/tests/rls/feedback.test.sql` — Task 8
- `supabase/migrations/20240001000072_feature_gate_syllabus.sql` — Task 9
- `supabase/tests/rls/syllabus.test.sql` — Task 9
- `supabase/migrations/20240001000073_feature_gate_timetable.sql` — Task 10
- `supabase/tests/rls/timetable.test.sql` — Task 10

---

### Task 1: Attendance module (`attendance_records`) — establishes the RLS-test pattern

**Files:**
- Create: `supabase/migrations/20240001000064_feature_gate_attendance.sql`
- Create: `supabase/tests/rls/attendance_records.test.sql`

**Interfaces:**
- Consumes: `public.feature_enabled(p_school_id uuid, p_key text) RETURNS boolean` (must already exist — verified in Step 1).
- Produces: the `supabase/tests/rls/<module>.test.sql` fixture/assertion pattern that Tasks 2–10 copy verbatim.

- [ ] **Step 1: Verify the prerequisite exists — do not proceed if it doesn't**

Run: `grep -rn "CREATE OR REPLACE FUNCTION public.feature_enabled" supabase/migrations`

Expected: at least one match (the ERP-60 migration). **If there is no match, stop here** — this whole plan is blocked on ERP-60 landing first. Do not write `feature_enabled()` yourself in this migration; it is owned by a different ticket and duplicating it here will conflict when ERP-60 actually merges.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20240001000064_feature_gate_attendance.sql
-- F1-C: gate attendance_records RLS behind the 'attendance' module flag.
-- super_admin stays unconditional (edge case 3); all other roles additionally
-- require public.feature_enabled(school_id, 'attendance').

DROP POLICY IF EXISTS "attendance_select" ON public.attendance_records;
CREATE POLICY "attendance_select" ON public.attendance_records FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'attendance')
    )
  );

DROP POLICY IF EXISTS "attendance_write" ON public.attendance_records;
CREATE POLICY "attendance_write" ON public.attendance_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'attendance')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.can_write_section_attendance(section_id)
        )
      )
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'attendance')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.can_write_section_attendance(section_id)
        )
      )
    )
  );
```

- [ ] **Step 3: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors; ends with `Seeding data supabase/seed.sql...` succeeding.

- [ ] **Step 4: Write the RLS isolation test**

```sql
-- supabase/tests/rls/attendance_records.test.sql
-- RLS isolation test for the 'attendance' feature gate on attendance_records.
-- Run: npx supabase db query --local -f supabase/tests/rls/attendance_records.test.sql
-- Everything rolls back at the end; safe to re-run.

BEGIN;

-- ── Fixture (runs as the connecting superuser; bypasses RLS for setup) ─────
INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"attendance": false}'::jsonb);

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', 'active');

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name, academic_year_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A', 'a0000000-0000-0000-0000-000000000002');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000002', now(),
  '{"full_name":"RLS Test Student"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.attendance_records (school_id, student_id, section_id, date, marked_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000004', '2026-07-01', 'a0000000-0000-0000-0000-00000000001f');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.attendance_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: attendance_records visible to school_admin while attendance OFF';
  END IF;
  RAISE NOTICE 'PASS: attendance_records hidden from school_admin while attendance OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.attendance_records (school_id, student_id, section_id, date, marked_by) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000004', '2026-07-02', 'a0000000-0000-0000-0000-00000000001f');
    RAISE EXCEPTION 'FAIL: insert into attendance_records succeeded while attendance OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into attendance_records rejected while attendance OFF';
  END;
END $$;

-- ── Phase 2: module ON, acting as school_admin ──────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"attendance": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: attendance_records hidden from school_admin while attendance ON';
  END IF;
  RAISE NOTICE 'PASS: attendance_records visible to school_admin while attendance ON';
END $$;

INSERT INTO public.attendance_records (school_id, student_id, section_id, date, marked_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000004', '2026-07-03', 'a0000000-0000-0000-0000-00000000001f');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into attendance_records accepted while attendance ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"attendance": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see attendance_records despite attendance OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the attendance flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 5: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/attendance_records.test.sql`
Expected: exits 0; output contains, in order, `PASS: attendance_records hidden from school_admin while attendance OFF`, `PASS: insert into attendance_records rejected while attendance OFF`, `PASS: attendance_records visible to school_admin while attendance ON`, `PASS: insert into attendance_records accepted while attendance ON`, `PASS: super_admin bypasses the attendance flag`; no `ERROR:` lines.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20240001000064_feature_gate_attendance.sql supabase/tests/rls/attendance_records.test.sql
git commit -m "feat(db): gate attendance_records RLS behind the attendance feature flag"
```

---

### Task 2: Homework module (`homework`, `homework_attachments`, `homework_status` + RPCs + 2 edge functions)

**Files:**
- Create: `supabase/migrations/20240001000065_feature_gate_homework.sql`
- Create: `supabase/tests/rls/homework.test.sql`
- Modify: `supabase/functions/send-homework-reminders/index.ts`
- Modify: `supabase/functions/send-homework-notification/index.ts`

**Interfaces:**
- Consumes: `public.feature_enabled(uuid, text)`; `public._homework_school(uuid) RETURNS uuid` (migration 048, unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000065_feature_gate_homework.sql
-- F1-C: gate homework, homework_attachments, homework_status, and the
-- homework_status write RPCs behind the 'homework' module flag.

-- ── homework ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "homework_select" ON public.homework;
CREATE POLICY "homework_select" ON public.homework FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'homework'))
  );

DROP POLICY IF EXISTS "homework_write" ON public.homework;
CREATE POLICY "homework_write" ON public.homework FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'homework')
      AND (
        (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_section(section_id)
        )
      )
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'homework')
      AND (
        (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_section(section_id)
        )
      )
    )
  );

-- ── homework_attachments ────────────────────────────────────────────────
-- Also fixes a pre-existing gap: the write policy ANDed the role check with
-- school_id with no super_admin bypass (unlike its sibling homework_write,
-- already fixed in migrations 012/040). Left as-is, gating it would newly
-- lock super_admin out — restructured to match the established pattern.
DROP POLICY IF EXISTS "homework_attachments_select" ON public.homework_attachments;
CREATE POLICY "homework_attachments_select" ON public.homework_attachments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'homework'))
  );

DROP POLICY IF EXISTS "homework_attachments_write" ON public.homework_attachments;
CREATE POLICY "homework_attachments_write" ON public.homework_attachments FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'teacher')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'homework')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'teacher')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'homework')
    )
  );

-- ── homework_status (read policy; writes only via the RPCs below) ─────────
DROP POLICY IF EXISTS "homework_status_select" ON public.homework_status;
CREATE POLICY "homework_status_select" ON public.homework_status FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'homework')
      AND (
        public.get_my_role() IN ('school_admin', 'principal', 'teacher')
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = homework_status.student_id
            AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

-- ── homework_status write RPCs: SECURITY DEFINER, bypass RLS entirely.
-- Each gets an explicit feature_enabled check alongside its existing
-- authorization check. Bodies otherwise unchanged from migration 048.
CREATE OR REPLACE FUNCTION public.mark_homework_viewed(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  INSERT INTO public.homework_status (homework_id, student_id, school_id, state, viewed_at)
  VALUES (p_homework_id, p_student_id, public._homework_school(p_homework_id), 'viewed', now())
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET viewed_at = COALESCE(public.homework_status.viewed_at, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_homework_done(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  INSERT INTO public.homework_status (homework_id, student_id, school_id, state, viewed_at, done_at)
  VALUES (p_homework_id, p_student_id, public._homework_school(p_homework_id), 'done', now(), now())
  ON CONFLICT (homework_id, student_id) DO UPDATE
    SET state = 'done',
        done_at = now(),
        viewed_at = COALESCE(public.homework_status.viewed_at, now());
END;
$$;

CREATE OR REPLACE FUNCTION public.unmark_homework_done(p_homework_id uuid, p_student_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_reviewed timestamptz;
BEGIN
  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  SELECT reviewed_at INTO v_reviewed
  FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  IF v_reviewed IS NOT NULL THEN
    RAISE EXCEPTION 'already_reviewed';
  END IF;

  UPDATE public.homework_status
  SET state = 'viewed', done_at = NULL
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_homework(
  p_homework_id uuid,
  p_student_id  uuid,
  p_rating      public.homework_rating,
  p_comment     text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state public.homework_state;
BEGIN
  IF NOT public.teaches_homework_section(p_homework_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT public.feature_enabled(public._homework_school(p_homework_id), 'homework') THEN
    RAISE EXCEPTION 'module_disabled';
  END IF;

  SELECT state INTO v_state
  FROM public.homework_status
  WHERE homework_id = p_homework_id AND student_id = p_student_id;

  IF v_state IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION 'not_done';
  END IF;

  UPDATE public.homework_status
  SET rating = p_rating,
      teacher_comment = NULLIF(btrim(p_comment), ''),
      reviewed_at = now(),
      reviewed_by = auth.uid()
  WHERE homework_id = p_homework_id AND student_id = p_student_id;
END;
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Patch the two homework edge functions**

In `supabase/functions/send-homework-notification/index.ts`, after the `if (!hw) return json({ result: "error", reason: "not_found" }, 404);` line (line 42) and before the `// Authorize:` comment (line 44), insert:

```ts
  const { data: enabled } = await admin.rpc("feature_enabled", {
    p_school_id: hw.school_id,
    p_key: "homework",
  });
  if (!enabled) return json({ result: "error", reason: "module_disabled" }, 403);

```

In `supabase/functions/send-homework-reminders/index.ts`, replace:

```ts
  let notified = 0;
  for (const hw of dueHw ?? []) {
```

with:

```ts
  const schoolIds = [...new Set((dueHw ?? []).map((hw: any) => hw.school_id))];
  const { data: schoolsData } = await admin
    .from("schools")
    .select("id, features_enabled")
    .in("id", schoolIds.length ? schoolIds : ["00000000-0000-0000-0000-000000000000"]);
  const homeworkEnabledSchools = new Set(
    (schoolsData ?? [])
      .filter((s: any) => s.features_enabled?.homework === true)
      .map((s: any) => s.id)
  );

  let notified = 0;
  for (const hw of (dueHw ?? []).filter((hw: any) => homeworkEnabledSchools.has(hw.school_id))) {
```

- [ ] **Step 4: Write the RLS isolation test**

```sql
-- supabase/tests/rls/homework.test.sql
-- RLS isolation test for the 'homework' feature gate on homework,
-- homework_attachments, homework_status, and the homework_status RPCs.
-- Run: npx supabase db query --local -f supabase/tests/rls/homework.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"homework": false}'::jsonb);

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', 'active');

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name, academic_year_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A', 'a0000000-0000-0000-0000-000000000002');

INSERT INTO public.subjects (id, school_id, class_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mathematics');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000002', now(),
  '{"full_name":"RLS Test Student"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000c1', '910000000003', now(),
  '{"full_name":"RLS Test Parent"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id, parent_profile_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000c1');

INSERT INTO public.homework (id, school_id, class_id, section_id, subject_id, teacher_id, title, due_date) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f', 'Worksheet 1', '2026-07-10');

INSERT INTO public.homework_attachments (homework_id, school_id, file_url, file_name, file_type, file_size) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'homework/worksheet1.pdf', 'worksheet1.pdf', 'application/pdf', 1024);

INSERT INTO public.homework_status (homework_id, student_id, school_id, state) VALUES
  ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000001', 'viewed');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.homework WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: homework visible while homework OFF';
  END IF;
  RAISE NOTICE 'PASS: homework hidden while homework OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.homework_attachments WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: homework_attachments visible while homework OFF';
  END IF;
  RAISE NOTICE 'PASS: homework_attachments hidden while homework OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.homework_status WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: homework_status visible to school_admin while homework OFF';
  END IF;
  RAISE NOTICE 'PASS: homework_status hidden from school_admin while homework OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.homework (school_id, class_id, section_id, subject_id, teacher_id, title, due_date) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f', 'Blocked', '2026-07-11');
    RAISE EXCEPTION 'FAIL: insert into homework succeeded while homework OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into homework rejected while homework OFF';
  END;
END $$;

-- Parent RPC write path must also be blocked while OFF.
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.mark_homework_done('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-0000000000b1');
    RAISE EXCEPTION 'FAIL: mark_homework_done succeeded while homework OFF';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'module_disabled' THEN
      RAISE NOTICE 'PASS: mark_homework_done rejected while homework OFF';
    ELSE
      RAISE EXCEPTION 'FAIL: mark_homework_done raised unexpected error: %', SQLERRM;
    END IF;
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"homework": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.homework WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: homework hidden while homework ON';
  END IF;
  RAISE NOTICE 'PASS: homework visible while homework ON';
END $$;

INSERT INTO public.homework (school_id, class_id, section_id, subject_id, teacher_id, title, due_date) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f', 'Allowed', '2026-07-12');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into homework accepted while homework ON'; END $$;

SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);
DO $$
BEGIN
  PERFORM public.mark_homework_done('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-0000000000b1');
  RAISE NOTICE 'PASS: mark_homework_done accepted while homework ON';
END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"homework": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.homework WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see homework despite homework OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the homework flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 5: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/homework.test.sql`
Expected: exits 0; `PASS:` lines for homework/homework_attachments/homework_status hidden + insert rejected + RPC rejected while OFF, homework visible + insert accepted + RPC accepted while ON, and super_admin bypass; no `ERROR:` lines.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20240001000065_feature_gate_homework.sql supabase/tests/rls/homework.test.sql supabase/functions/send-homework-reminders/index.ts supabase/functions/send-homework-notification/index.ts
git commit -m "feat(db): gate homework module RLS + RPCs + notification functions behind the homework flag"
```

---

### Task 3: Exams module (`exams`, `exam_results`, `report_card_templates` + `generate-report-card`)

**Files:**
- Create: `supabase/migrations/20240001000066_feature_gate_exams.sql`
- Create: `supabase/tests/rls/exams.test.sql`
- Modify: `supabase/functions/generate-report-card/index.ts`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000066_feature_gate_exams.sql
-- F1-C: gate exams, exam_results, report_card_templates behind 'exams'.
-- report_card_templates and generate-report-card use the 'exams' key too
-- (not a separate 'report_cards' key) — see this plan's Global Constraints
-- for the rationale (impl doc edge case 17).

DROP POLICY IF EXISTS "exams_select" ON public.exams;
CREATE POLICY "exams_select" ON public.exams FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'exams'))
  );

DROP POLICY IF EXISTS "exams_write" ON public.exams;
CREATE POLICY "exams_write" ON public.exams FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'exams')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'exams')
    )
  );

DROP POLICY IF EXISTS "exam_results_select" ON public.exam_results;
CREATE POLICY "exam_results_select" ON public.exam_results FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'exams'))
  );

DROP POLICY IF EXISTS "exam_results_write" ON public.exam_results;
CREATE POLICY "exam_results_write" ON public.exam_results FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'exams')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_student(student_id)
        )
      )
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'exams')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_student(student_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS "report_card_templates_select" ON public.report_card_templates;
CREATE POLICY "report_card_templates_select" ON public.report_card_templates FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'exams'))
  );

DROP POLICY IF EXISTS "report_card_templates_write" ON public.report_card_templates;
CREATE POLICY "report_card_templates_write" ON public.report_card_templates FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'exams')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'exams')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Patch `generate-report-card`**

In `supabase/functions/generate-report-card/index.ts`, after the `exam` fetch block (after line 33, `.single();`) and before the `// Match the enrollment...` comment (line 35), insert:

```ts

    if (!exam?.school_id) {
      return new Response(JSON.stringify({ error: "exam_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { data: examsEnabled } = await supabase.rpc("feature_enabled", {
      p_school_id: exam.school_id,
      p_key: "exams",
    });
    if (!examsEnabled) {
      return new Response(JSON.stringify({ error: "module_disabled" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }
```

- [ ] **Step 4: Write the RLS isolation test**

```sql
-- supabase/tests/rls/exams.test.sql
-- RLS isolation test for the 'exams' feature gate on exams, exam_results,
-- and report_card_templates.
-- Run: npx supabase db query --local -f supabase/tests/rls/exams.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"exams": false}'::jsonb);

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', 'active');

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name, academic_year_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A', 'a0000000-0000-0000-0000-000000000002');

INSERT INTO public.subjects (id, school_id, class_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mathematics');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000002', now(),
  '{"full_name":"RLS Test Student"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.exams (id, school_id, academic_year_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Midterm');

INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, teacher_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f');

INSERT INTO public.report_card_templates (school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Default Template');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exams WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: exams visible while exams OFF';
  END IF;
  RAISE NOTICE 'PASS: exams hidden while exams OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.exam_results WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: exam_results visible while exams OFF';
  END IF;
  RAISE NOTICE 'PASS: exam_results hidden while exams OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.report_card_templates WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: report_card_templates visible while exams OFF';
  END IF;
  RAISE NOTICE 'PASS: report_card_templates hidden while exams OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.exams (school_id, academic_year_id, name) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Blocked Exam');
    RAISE EXCEPTION 'FAIL: insert into exams succeeded while exams OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into exams rejected while exams OFF';
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"exams": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: exams hidden while exams ON';
  END IF;
  RAISE NOTICE 'PASS: exams visible while exams ON';
END $$;

INSERT INTO public.exams (school_id, academic_year_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Allowed Exam');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into exams accepted while exams ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"exams": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exams WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see exams despite exams OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the exams flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 5: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/exams.test.sql`
Expected: exits 0; `PASS:` lines for exams/exam_results/report_card_templates hidden + insert rejected while OFF, exams visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20240001000066_feature_gate_exams.sql supabase/tests/rls/exams.test.sql supabase/functions/generate-report-card/index.ts
git commit -m "feat(db): gate exams module RLS + generate-report-card behind the exams flag"
```

---

### Task 4: Fees module (`fee_types`, `fee_line_items`, `payments`, `line_item_payments`)

**Files:**
- Create: `supabase/migrations/20240001000067_feature_gate_fees.sql`
- Create: `supabase/tests/rls/fees.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000067_feature_gate_fees.sql
-- F1-C: gate fee_types, fee_line_items, payments, line_item_payments
-- behind 'fees'. fee_structures/fee_payments no longer exist (dropped by
-- migration 20240001000035_fee_types.sql) — see this plan's Global
-- Constraints. The global predefined fee-type catalog (school_id IS NULL)
-- is left ungated: it's shared reference data, not tenant data.

DROP POLICY IF EXISTS "fee_types_read" ON public.fee_types;
CREATE POLICY "fee_types_read" ON public.fee_types FOR SELECT
  USING (
    school_id IS NULL
    OR public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'fees'))
  );

DROP POLICY IF EXISTS "fee_types_insert" ON public.fee_types;
CREATE POLICY "fee_types_insert" ON public.fee_types FOR INSERT
  WITH CHECK (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        public.get_my_role() = 'school_admin'
        AND school_id = public.get_my_school_id()
        AND public.feature_enabled(school_id, 'fees')
      )
    )
  );

DROP POLICY IF EXISTS "fee_types_update" ON public.fee_types;
CREATE POLICY "fee_types_update" ON public.fee_types FOR UPDATE
  USING (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        public.get_my_role() = 'school_admin'
        AND school_id = public.get_my_school_id()
        AND public.feature_enabled(school_id, 'fees')
      )
    )
  )
  WITH CHECK (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        public.get_my_role() = 'school_admin'
        AND school_id = public.get_my_school_id()
        AND public.feature_enabled(school_id, 'fees')
      )
    )
  );

DROP POLICY IF EXISTS "fee_types_delete" ON public.fee_types;
CREATE POLICY "fee_types_delete" ON public.fee_types FOR DELETE
  USING (
    is_predefined = false
    AND (
      public.get_my_role() = 'super_admin'
      OR (
        public.get_my_role() = 'school_admin'
        AND school_id = public.get_my_school_id()
        AND public.feature_enabled(school_id, 'fees')
      )
    )
  );

DROP POLICY IF EXISTS "fli_read" ON public.fee_line_items;
CREATE POLICY "fli_read" ON public.fee_line_items FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(fee_line_items.school_id, 'fees')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal', 'teacher', 'super_admin')
          AND school_id = public.get_my_school_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = fee_line_items.student_id
          AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "fli_write" ON public.fee_line_items;
CREATE POLICY "fli_write" ON public.fee_line_items FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'fees')
    )
  );

DROP POLICY IF EXISTS "fli_update" ON public.fee_line_items;
CREATE POLICY "fli_update" ON public.fee_line_items FOR UPDATE
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'fees')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'fees')
    )
  );

DROP POLICY IF EXISTS "payments_read" ON public.payments;
CREATE POLICY "payments_read" ON public.payments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(payments.school_id, 'fees')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal', 'super_admin')
          AND school_id = public.get_my_school_id()
        )
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = payments.student_id
          AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "payments_write" ON public.payments;
CREATE POLICY "payments_write" ON public.payments FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'fees')
    )
  );

DROP POLICY IF EXISTS "lip_read" ON public.line_item_payments;
CREATE POLICY "lip_read" ON public.line_item_payments FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.id = line_item_payments.payment_id
      AND public.feature_enabled(p.school_id, 'fees')
      AND (
        (public.get_my_role() IN ('school_admin', 'principal', 'super_admin') AND p.school_id = public.get_my_school_id())
        OR EXISTS (
          SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = p.student_id AND sp.parent_profile_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "lip_write" ON public.line_item_payments;
CREATE POLICY "lip_write" ON public.line_item_payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payments p
      JOIN public.fee_line_items fli ON fli.id = line_item_payments.line_item_id
      WHERE p.id = line_item_payments.payment_id
      AND p.school_id = fli.school_id
      AND (
        public.get_my_role() = 'super_admin'
        OR (
          public.get_my_role() = 'school_admin'
          AND p.school_id = public.get_my_school_id()
          AND public.feature_enabled(p.school_id, 'fees')
        )
      )
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/fees.test.sql
-- RLS isolation test for the 'fees' feature gate on fee_types,
-- fee_line_items, payments, line_item_payments. Covers both the staff
-- branch and the parent-read branch (fee_line_items/payments/line_item_payments
-- each have a separate EXISTS(...parent_profile_id = auth.uid()...) branch
-- that also needs the gate).
-- Run: npx supabase db query --local -f supabase/tests/rls/fees.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"fees": false}'::jsonb);

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000002', now(),
  '{"full_name":"RLS Test Student"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000c1', '910000000003', now(),
  '{"full_name":"RLS Test Parent"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id, parent_profile_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000c1');

INSERT INTO public.fee_types (id, name, category, is_predefined, school_id) VALUES
  ('a0000000-0000-0000-0000-000000000008', 'Custom Trip Fee', 'ancillary', false, 'a0000000-0000-0000-0000-000000000001');

INSERT INTO public.fee_line_items (id, school_id, student_id, fee_type_id, total_amount) VALUES
  ('a0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-000000000008', 500.00);

INSERT INTO public.payments (id, school_id, student_id, total_amount) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 500.00);

INSERT INTO public.line_item_payments (payment_id, line_item_id, amount_applied) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000009', 500.00);

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_types WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: custom fee_types visible to school_admin while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: custom fee_types hidden from school_admin while fees OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_line_items WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: fee_line_items visible to school_admin while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: fee_line_items hidden from school_admin while fees OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: payments visible to school_admin while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: payments hidden from school_admin while fees OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.line_item_payments) THEN
    RAISE EXCEPTION 'FAIL: line_item_payments visible to school_admin while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: line_item_payments hidden from school_admin while fees OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.payments (school_id, student_id, total_amount) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 100.00);
    RAISE EXCEPTION 'FAIL: insert into payments succeeded while fees OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into payments rejected while fees OFF';
  END;
END $$;

-- Parent-read branch must also be blocked while fees is OFF.
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL: parent can see payments for their child while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: parent cannot see payments for their child while fees OFF';
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.fee_line_items WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL: parent can see fee_line_items for their child while fees OFF';
  END IF;
  RAISE NOTICE 'PASS: parent cannot see fee_line_items for their child while fees OFF';
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"fees": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: payments hidden from school_admin while fees ON';
  END IF;
  RAISE NOTICE 'PASS: payments visible to school_admin while fees ON';
END $$;

INSERT INTO public.payments (school_id, student_id, total_amount) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 100.00);

DO $$ BEGIN RAISE NOTICE 'PASS: insert into payments accepted while fees ON'; END $$;

SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL: parent cannot see payments for their child while fees ON';
  END IF;
  RAISE NOTICE 'PASS: parent can see payments for their child while fees ON';
END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"fees": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payments WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see payments despite fees OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the fees flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/fees.test.sql`
Expected: exits 0; `PASS:` lines for fee_types/fee_line_items/payments/line_item_payments hidden from staff + parent + insert rejected while OFF, visible to both + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000067_feature_gate_fees.sql supabase/tests/rls/fees.test.sql
git commit -m "feat(db): gate fees module RLS (fee_types, fee_line_items, payments, line_item_payments) behind the fees flag"
```

---

### Task 5: Announcements module (`announcements`)

**Files:**
- Create: `supabase/migrations/20240001000068_feature_gate_announcements.sql`
- Create: `supabase/tests/rls/announcements.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000068_feature_gate_announcements.sql
-- F1-C: gate announcements RLS behind the 'announcements' module flag.

DROP POLICY IF EXISTS "announcements_select" ON public.announcements;
CREATE POLICY "announcements_select" ON public.announcements FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'announcements'))
  );

DROP POLICY IF EXISTS "announcements_write" ON public.announcements;
CREATE POLICY "announcements_write" ON public.announcements FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'announcements')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'announcements')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/announcements.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/announcements.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"announcements": false}'::jsonb);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.announcements (school_id, title, content, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Holiday Notice', 'School closed Friday.', 'a0000000-0000-0000-0000-00000000001f');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.announcements WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: announcements visible while announcements OFF';
  END IF;
  RAISE NOTICE 'PASS: announcements hidden while announcements OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.announcements (school_id, title, content, created_by) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Blocked', 'x', 'a0000000-0000-0000-0000-00000000001f');
    RAISE EXCEPTION 'FAIL: insert into announcements succeeded while announcements OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into announcements rejected while announcements OFF';
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"announcements": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.announcements WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: announcements hidden while announcements ON';
  END IF;
  RAISE NOTICE 'PASS: announcements visible while announcements ON';
END $$;

INSERT INTO public.announcements (school_id, title, content, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Allowed', 'x', 'a0000000-0000-0000-0000-00000000001f');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into announcements accepted while announcements ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"announcements": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.announcements WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see announcements despite announcements OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the announcements flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/announcements.test.sql`
Expected: exits 0; `PASS:` lines for hidden + insert rejected while OFF, visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000068_feature_gate_announcements.sql supabase/tests/rls/announcements.test.sql
git commit -m "feat(db): gate announcements RLS behind the announcements feature flag"
```

---

### Task 6: Gallery module (`school_gallery`)

**Files:**
- Create: `supabase/migrations/20240001000069_feature_gate_gallery.sql`
- Create: `supabase/tests/rls/gallery.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000069_feature_gate_gallery.sql
-- F1-C: gate school_gallery RLS behind the 'gallery' module flag.
-- gallery_admin_all (FOR ALL) already gives super_admin unconditional
-- access, so gallery_read (the only path for teacher/parent reads) just
-- needs the gate added to its own condition.

DROP POLICY IF EXISTS "gallery_read" ON public.school_gallery;
CREATE POLICY "gallery_read" ON public.school_gallery FOR SELECT
  USING (
    school_id = public.get_my_school_id()
    AND public.feature_enabled(school_id, 'gallery')
  );

DROP POLICY IF EXISTS "gallery_admin_all" ON public.school_gallery;
CREATE POLICY "gallery_admin_all" ON public.school_gallery FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('super_admin', 'school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'gallery')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('super_admin', 'school_admin', 'principal')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'gallery')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/gallery.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/gallery.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"gallery": false}'::jsonb);

INSERT INTO public.school_gallery (id, school_id, image_url) VALUES
  ('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-000000000001', 'gallery/photo1.jpg');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_gallery WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: school_gallery visible while gallery OFF';
  END IF;
  RAISE NOTICE 'PASS: school_gallery hidden while gallery OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_gallery (school_id, image_url) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'gallery/blocked.jpg');
    RAISE EXCEPTION 'FAIL: insert into school_gallery succeeded while gallery OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into school_gallery rejected while gallery OFF';
  END;
END $$;

-- Teacher-only read path (gallery_read has no admin-role check at all).
SELECT set_config('app.role', 'teacher', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.school_gallery WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: teacher can see school_gallery while gallery OFF';
  END IF;
  RAISE NOTICE 'PASS: teacher cannot see school_gallery while gallery OFF';
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"gallery": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_gallery WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: teacher cannot see school_gallery while gallery ON';
  END IF;
  RAISE NOTICE 'PASS: teacher can see school_gallery while gallery ON';
END $$;

SELECT set_config('app.role', 'school_admin', true);
INSERT INTO public.school_gallery (school_id, image_url) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'gallery/allowed.jpg');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into school_gallery accepted while gallery ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"gallery": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_gallery WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see school_gallery despite gallery OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the gallery flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/gallery.test.sql`
Expected: exits 0; `PASS:` lines for school_admin + teacher hidden + insert rejected while OFF, teacher visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000069_feature_gate_gallery.sql supabase/tests/rls/gallery.test.sql
git commit -m "feat(db): gate school_gallery RLS behind the gallery feature flag"
```

---

### Task 7: Discipline module (`discipline_records`)

**Files:**
- Create: `supabase/migrations/20240001000070_feature_gate_discipline.sql`
- Create: `supabase/tests/rls/discipline.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000070_feature_gate_discipline.sql
-- F1-C: gate discipline_records RLS (staff + parent branches) behind
-- the 'discipline' module flag.

DROP POLICY IF EXISTS "discipline_select" ON public.discipline_records;
CREATE POLICY "discipline_select" ON public.discipline_records FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('super_admin', 'school_admin', 'principal', 'teacher')
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'discipline')
    )
  );

DROP POLICY IF EXISTS "discipline_parent_select" ON public.discipline_records;
CREATE POLICY "discipline_parent_select" ON public.discipline_records FOR SELECT
  USING (
    public.get_my_role() = 'parent'
    AND public.feature_enabled(school_id, 'discipline')
    AND student_id IN (
      SELECT id FROM public.student_profiles
      WHERE parent_profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "discipline_write" ON public.discipline_records;
CREATE POLICY "discipline_write" ON public.discipline_records FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'discipline')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_student(student_id)
        )
      )
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'discipline')
      AND (
        (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_student(student_id)
        )
      )
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/discipline.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/discipline.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"discipline": false}'::jsonb);

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000002', now(),
  '{"full_name":"RLS Test Student"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000c1', '910000000003', now(),
  '{"full_name":"RLS Test Parent"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id, parent_profile_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-0000000000c1');

INSERT INTO public.discipline_records (school_id, student_id, category, severity, description, recorded_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'behavioral', 'verbal', 'Talking in class', 'a0000000-0000-0000-0000-00000000001f');

-- ── Phase 1: module OFF ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.discipline_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: discipline_records visible to school_admin while discipline OFF';
  END IF;
  RAISE NOTICE 'PASS: discipline_records hidden from school_admin while discipline OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.discipline_records (school_id, student_id, category, severity, description, recorded_by) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'behavioral', 'verbal', 'Blocked', 'a0000000-0000-0000-0000-00000000001f');
    RAISE EXCEPTION 'FAIL: insert into discipline_records succeeded while discipline OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into discipline_records rejected while discipline OFF';
  END;
END $$;

SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.discipline_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL: parent can see discipline_records for their child while discipline OFF';
  END IF;
  RAISE NOTICE 'PASS: parent cannot see discipline_records for their child while discipline OFF';
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"discipline": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.discipline_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: discipline_records hidden from school_admin while discipline ON';
  END IF;
  RAISE NOTICE 'PASS: discipline_records visible to school_admin while discipline ON';
END $$;

INSERT INTO public.discipline_records (school_id, student_id, category, severity, description, recorded_by) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000b1', 'behavioral', 'verbal', 'Allowed', 'a0000000-0000-0000-0000-00000000001f');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into discipline_records accepted while discipline ON'; END $$;

SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.discipline_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1') THEN
    RAISE EXCEPTION 'FAIL: parent cannot see discipline_records for their child while discipline ON';
  END IF;
  RAISE NOTICE 'PASS: parent can see discipline_records for their child while discipline ON';
END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"discipline": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.discipline_records WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see discipline_records despite discipline OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the discipline flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/discipline.test.sql`
Expected: exits 0; `PASS:` lines for school_admin + parent hidden + insert rejected while OFF, both visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000070_feature_gate_discipline.sql supabase/tests/rls/discipline.test.sql
git commit -m "feat(db): gate discipline_records RLS behind the discipline feature flag"
```

---

### Task 8: Feedback module (`feedback`)

**Files:**
- Create: `supabase/migrations/20240001000071_feature_gate_feedback.sql`
- Create: `supabase/tests/rls/feedback.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000071_feature_gate_feedback.sql
-- F1-C: gate feedback RLS behind the 'feedback' module flag.

DROP POLICY IF EXISTS "feedback_select" ON public.feedback;
CREATE POLICY "feedback_select" ON public.feedback FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'feedback')
      AND (
        from_user_id = auth.uid()
        OR (
          public.get_my_role() IN ('school_admin', 'principal')
          AND school_id = public.get_my_school_id()
        )
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND to_user_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "feedback_insert" ON public.feedback;
CREATE POLICY "feedback_insert" ON public.feedback FOR INSERT
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'feedback'))
  );

DROP POLICY IF EXISTS "feedback_update" ON public.feedback;
CREATE POLICY "feedback_update" ON public.feedback FOR UPDATE
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal', 'teacher')
      AND public.feature_enabled(school_id, 'feedback')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/feedback.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/feedback.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"feedback": false}'::jsonb);

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000c1', '910000000003', now(),
  '{"full_name":"RLS Test Parent"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'teacher', 'Question', 'When is the next PTM?');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feedback WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: feedback visible to school_admin while feedback OFF';
  END IF;
  RAISE NOTICE 'PASS: feedback hidden from school_admin while feedback OFF';
END $$;

-- The submitter's own from_user_id=auth.uid() branch must also be gated.
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.feedback WHERE from_user_id = 'a0000000-0000-0000-0000-0000000000c1') THEN
    RAISE EXCEPTION 'FAIL: submitter can see their own feedback while feedback OFF';
  END IF;
  RAISE NOTICE 'PASS: submitter cannot see their own feedback while feedback OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'teacher', 'Blocked', 'x');
    RAISE EXCEPTION 'FAIL: insert into feedback succeeded while feedback OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into feedback rejected while feedback OFF';
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"feedback": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'parent', true);
SELECT set_config('app.school_id', '', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000c1"}', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.feedback WHERE from_user_id = 'a0000000-0000-0000-0000-0000000000c1') THEN
    RAISE EXCEPTION 'FAIL: submitter cannot see their own feedback while feedback ON';
  END IF;
  RAISE NOTICE 'PASS: submitter can see their own feedback while feedback ON';
END $$;

INSERT INTO public.feedback (school_id, from_user_id, to_role, subject, message) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000c1', 'teacher', 'Allowed', 'x');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into feedback accepted while feedback ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"feedback": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.feedback WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see feedback despite feedback OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the feedback flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/feedback.test.sql`
Expected: exits 0; `PASS:` lines for school_admin + submitter-own-row hidden + insert rejected while OFF, submitter visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000071_feature_gate_feedback.sql supabase/tests/rls/feedback.test.sql
git commit -m "feat(db): gate feedback RLS behind the feedback feature flag"
```

---

### Task 9: Syllabus module (`syllabus`)

**Files:**
- Create: `supabase/migrations/20240001000072_feature_gate_syllabus.sql`
- Create: `supabase/tests/rls/syllabus.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000072_feature_gate_syllabus.sql
-- F1-C: gate syllabus RLS behind the 'syllabus' module flag.

DROP POLICY IF EXISTS "syllabus_select" ON public.syllabus;
CREATE POLICY "syllabus_select" ON public.syllabus FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'syllabus'))
  );

DROP POLICY IF EXISTS "syllabus_write" ON public.syllabus;
CREATE POLICY "syllabus_write" ON public.syllabus FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'syllabus')
      AND (
        (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_class(class_id)
        )
      )
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.feature_enabled(school_id, 'syllabus')
      AND (
        (public.get_my_role() = 'school_admin' AND school_id = public.get_my_school_id())
        OR (
          public.get_my_role() = 'teacher'
          AND school_id = public.get_my_school_id()
          AND public.teaches_class(class_id)
        )
      )
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/syllabus.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/syllabus.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"syllabus": false}'::jsonb);

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', 'active');

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.subjects (id, school_id, class_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mathematics');

INSERT INTO public.syllabus (school_id, class_id, subject_id, academic_year_id, file_url) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'syllabus/math.pdf');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.syllabus WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: syllabus visible while syllabus OFF';
  END IF;
  RAISE NOTICE 'PASS: syllabus hidden while syllabus OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.syllabus (school_id, class_id, subject_id, academic_year_id, file_url) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'syllabus/blocked.pdf');
    RAISE EXCEPTION 'FAIL: insert into syllabus succeeded while syllabus OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into syllabus rejected while syllabus OFF';
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"syllabus": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.syllabus WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: syllabus hidden while syllabus ON';
  END IF;
  RAISE NOTICE 'PASS: syllabus visible while syllabus ON';
END $$;

INSERT INTO public.syllabus (school_id, class_id, subject_id, academic_year_id, file_url) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'syllabus/allowed.pdf');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into syllabus accepted while syllabus ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"syllabus": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.syllabus WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see syllabus despite syllabus OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the syllabus flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/syllabus.test.sql`
Expected: exits 0; `PASS:` lines for hidden + insert rejected while OFF, visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000072_feature_gate_syllabus.sql supabase/tests/rls/syllabus.test.sql
git commit -m "feat(db): gate syllabus RLS behind the syllabus feature flag"
```

---

### Task 10: Timetable module (`timetable`)

**Files:**
- Create: `supabase/migrations/20240001000073_feature_gate_timetable.sql`
- Create: `supabase/tests/rls/timetable.test.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000073_feature_gate_timetable.sql
-- F1-C: gate timetable RLS behind the 'timetable' module flag.

DROP POLICY IF EXISTS "timetable_select" ON public.timetable;
CREATE POLICY "timetable_select" ON public.timetable FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR (school_id = public.get_my_school_id() AND public.feature_enabled(school_id, 'timetable'))
  );

DROP POLICY IF EXISTS "timetable_write" ON public.timetable;
CREATE POLICY "timetable_write" ON public.timetable FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'timetable')
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
      AND public.feature_enabled(school_id, 'timetable')
    )
  );
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/timetable.test.sql
-- Run: npx supabase db query --local -f supabase/tests/rls/timetable.test.sql

BEGIN;

INSERT INTO public.schools (id, name, features_enabled) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School', '{"timetable": false}'::jsonb);

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A');

INSERT INTO public.subjects (id, school_id, class_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Mathematics');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.timetable (school_id, section_id, day_of_week, period, subject_id, teacher_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 1, 1, 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f');

-- ── Phase 1: module OFF, acting as school_admin ─────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.timetable WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: timetable visible while timetable OFF';
  END IF;
  RAISE NOTICE 'PASS: timetable hidden while timetable OFF';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.timetable (school_id, section_id, day_of_week, period, subject_id, teacher_id) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 2, 1, 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f');
    RAISE EXCEPTION 'FAIL: insert into timetable succeeded while timetable OFF';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: insert into timetable rejected while timetable OFF';
  END;
END $$;

-- ── Phase 2: module ON ───────────────────────────────────────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"timetable": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.timetable WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: timetable hidden while timetable ON';
  END IF;
  RAISE NOTICE 'PASS: timetable visible while timetable ON';
END $$;

INSERT INTO public.timetable (school_id, section_id, day_of_week, period, subject_id, teacher_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 2, 1, 'a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-00000000001f');

DO $$ BEGIN RAISE NOTICE 'PASS: insert into timetable accepted while timetable ON'; END $$;

-- ── Phase 3: super_admin bypasses the flag even while OFF ───────────────────
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"timetable": false}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.timetable WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see timetable despite timetable OFF';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses the timetable flag';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/timetable.test.sql`
Expected: exits 0; `PASS:` lines for hidden + insert rejected while OFF, visible + insert accepted while ON, super_admin bypass; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000073_feature_gate_timetable.sql supabase/tests/rls/timetable.test.sql
git commit -m "feat(db): gate timetable RLS behind the timetable feature flag"
```

---

## After all 10 tasks land

Run the full suite once more end to end to catch any cross-migration ordering issue:

```bash
npx supabase db reset
for f in supabase/tests/rls/*.test.sql; do
  echo "=== $f ==="
  npx supabase db query --local -f "$f" || exit 1
done
```

Expected: `supabase db reset` completes cleanly (all 10 retrofit migrations plus whatever ERP-60 shipped apply in order), and every test file prints only `PASS:` lines and exits 0.
