# Geo Attendance Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side foundation for geo-tagged attendance — geo columns on `attendance_records`, a `school_geofences` table, a pure-SQL Haversine helper, and a single `mark_attendance` RPC that replaces both client `.upsert()` calls, silently stamping in/out-of-bounds status without ever blocking a submit.

**Architecture:** Three sequential migrations. (1) Schema: `geo_status` enum, nullable geo columns on `attendance_records`, `school_geofences` table + RLS. (2) `_haversine_m()` — pure-SQL point-to-radius distance, no PostGIS/earthdistance extension. (3) `mark_attendance()` SECURITY DEFINER RPC — authorizes the write, resolves the nearest active geofence server-side, stamps `geo_status`, and upserts identically to today's client-side `.upsert()`. Mobile/web client changes (Module A.4) and the geofence-setup/flag-review UI (Module A.5) are separate tickets — this plan is DB-layer only.

**Tech Stack:** PostgreSQL 17 (Supabase migrations, `supabase/migrations/*.sql`), plpgsql, Supabase CLI (`npx supabase`) for local apply/test. No pgTAP/vitest/jest in this repo — raw-SQL tests under `supabase/tests/`, run via `npx supabase db query --local -f <file>`, following the convention established the same day in `docs/superpowers/plans/2026-07-28-f1c-rls-retrofit-module-toggle.md` (wrap fixtures + assertions in `BEGIN; ... ROLLBACK;` so tests are safe to re-run).

## Global Constraints

- **Hard dependency, checked at the point it's actually needed (Task 3, not Task 1):** `public.feature_enabled(p_school_id uuid, p_key text) RETURNS boolean` must exist before `mark_attendance` is written — it's owned by a separate ticket (F1/ERP-60, spec `docs/superpowers/specs/2026-07-24-f1-module-toggle-implementation.md` §2.1, expected as a migration named `..._feature_flags.sql`). As of this writing it does **not** exist yet (`grep -rn "CREATE OR REPLACE FUNCTION public.feature_enabled" supabase/migrations` returns nothing; latest applied migration is `20240001000062_files_bucket.sql`). Tasks 1–2 (schema, Haversine helper) do not call `feature_enabled()` and are **not** blocked by this — they can be built, tested, and committed regardless of F1's landing status. Task 3 Step 1 verifies the dependency and must not proceed past it if missing.
- **Migration numbering:** this plan is written assuming the next-free index is `20240001000064` (i.e. that F1's own `feature_flags` migration has already claimed `...063` by the time Task 3 executes — both the F1 impl spec and the sibling F1-C retrofit plan reserve `063` for that). **If the actual next-free index differs when you execute this plan**, renumber all three of this plan's migration filenames sequentially starting at the real next-free index, preserving their relative order (schema → haversine → mark_attendance) and the SQL content unchanged.
- **Authorization correction vs. the ticket's one-line description — read before Task 3:** the ticket text says "authorize via `can_write_section_attendance` (migration 59)." Read literally, that would be a regression: `can_write_section_attendance()` (migration `20240001000059_attendance_write_scope.sql:14-36`) only checks `section_assignments`/`timetable` membership for a **teacher**; it has no `super_admin`/`school_admin`/`principal` branch. Those roles get attendance-write access today from the **RLS policy** wrapped around it (`"attendance_write"` in the same migration: `super_admin OR (school_admin/principal AND same school) OR (teacher AND can_write_section_attendance(...))`), not from the function itself. Because `mark_attendance` is `SECURITY DEFINER` and therefore bypasses RLS entirely, calling `can_write_section_attendance()` alone as the *sole* gate would newly lock out school_admin/principal/super_admin — breaking the acceptance criterion "RPC upserts identically to today's `.upsert`." Task 3 reproduces the **full** `attendance_write` RLS shape inside the RPC, not just the teacher branch.
- **`geo_distance_m` sign convention:** always `nearest_geofence_distance - radius_m`, for both `inside` (result ≤ 0, "how far inside the fence") and `outside` (result > 0, "how far past the fence edge") — one formula, no special-casing.
- **`matched_geofence_id`** is populated only when `geo_status = 'inside'`; `NULL` for `outside`/`no_gps`/`not_captured`/flag-off.
- **When `attendance_geo` is OFF for the school** (including "key absent" — `feature_enabled` fails safe to `false`), `mark_attendance` forces **every** geo column to `NULL`, including `captured_lat/lng`/`gps_accuracy_m` — even if a caller passes coordinates. This is deliberate: edge case 1 in the spec requires "no coords" when the flag is off, not just `geo_status = NULL`.
- **`p_geo_source`** distinguishes `no_gps` (`'device'` + null coords — phone tried, no fix) from `not_captured` (`'web'` + null coords, or no active geofences, or flag off). Defaults to `'web'` since the existing mobile/web clients don't pass this param yet (Module A.4 is a separate ticket) — defaulting to the quieter `not_captured` bucket avoids spuriously flagging every pre-A.4 call as `no_gps`.
- **Out of scope for this plan** (separate tickets per the epic): mobile `expo-location` integration + advisory chip (A.4), web geofence-setup map UI + flag-review page (A.5). This plan does not modify `apps/mobile/app/(teacher)/attendance/[sectionId].tsx` or `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx`.

---

## File Structure

- `supabase/migrations/20240001000064_geo_attendance_schema.sql` — Task 1 (enum, `attendance_records` geo columns, `school_geofences` table + RLS)
- `supabase/tests/rls/school_geofences.test.sql` — Task 1
- `supabase/migrations/20240001000065_haversine.sql` — Task 2 (`_haversine_m` helper)
- `supabase/tests/haversine.test.sql` — Task 2
- `supabase/migrations/20240001000066_mark_attendance.sql` — Task 3 (`mark_attendance` RPC)
- `supabase/tests/rpc/mark_attendance.test.sql` — Task 3

---

### Task 1: Schema — geo columns, `geo_status` enum, `school_geofences` + RLS

**Files:**
- Create: `supabase/migrations/20240001000064_geo_attendance_schema.sql`
- Create: `supabase/tests/rls/school_geofences.test.sql`

**Interfaces:**
- Consumes: `public.get_my_role()`, `public.get_my_school_id()` (migration 38), `public.schools`/`public.attendance_records` (existing).
- Produces: `public.geo_status` enum (`'inside'|'outside'|'no_gps'|'not_captured'`); `public.school_geofences(id, school_id, name, center_lat, center_lng, radius_m, is_active, created_at, created_by)`; new nullable columns on `public.attendance_records`: `captured_lat, captured_lng, gps_accuracy_m, geo_status, geo_distance_m, matched_geofence_id, geo_reviewed_at, geo_reviewed_by`. Task 3 reads/writes all of these.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000064_geo_attendance_schema.sql
-- Sub-project #2, Module A.1: geo attendance schema.
-- Adds geo_status enum + nullable geo columns to attendance_records, and a
-- new school_geofences table (write locked to school_admin/super_admin only
-- — anti-spoof: a teacher-writable geofence would let them "draw a circle
-- around themselves, always inside"). All geo columns are nullable so
-- pre-geo, web-marked, and flag-off rows are unaffected.

CREATE TYPE public.geo_status AS ENUM ('inside', 'outside', 'no_gps', 'not_captured');

CREATE TABLE public.school_geofences (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  center_lat NUMERIC NOT NULL,
  center_lng NUMERIC NOT NULL,
  radius_m   INTEGER NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_school_geofences_school_id ON public.school_geofences (school_id);

ALTER TABLE public.school_geofences ENABLE ROW LEVEL SECURITY;

-- Same-school authenticated read (mobile advisory chip + web review page).
CREATE POLICY "school_geofences_select" ON public.school_geofences FOR SELECT
  USING (
    public.get_my_role() = 'super_admin'
    OR school_id = public.get_my_school_id()
  );

-- Write locked to school_admin + super_admin. Principal is read-only.
-- Teacher is read-only (anti-spoof).
CREATE POLICY "school_geofences_write" ON public.school_geofences FOR ALL
  USING (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
    )
  )
  WITH CHECK (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() = 'school_admin'
      AND school_id = public.get_my_school_id()
    )
  );

ALTER TABLE public.attendance_records
  ADD COLUMN captured_lat        NUMERIC,
  ADD COLUMN captured_lng        NUMERIC,
  ADD COLUMN gps_accuracy_m      NUMERIC,
  ADD COLUMN geo_status          public.geo_status,
  ADD COLUMN geo_distance_m      NUMERIC,
  ADD COLUMN matched_geofence_id UUID REFERENCES public.school_geofences(id) ON DELETE SET NULL,
  ADD COLUMN geo_reviewed_at     TIMESTAMPTZ,
  ADD COLUMN geo_reviewed_by     UUID REFERENCES auth.users(id);
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors; ends with `Seeding data supabase/seed.sql...` succeeding.

- [ ] **Step 3: Write the RLS isolation test**

```sql
-- supabase/tests/rls/school_geofences.test.sql
-- RLS isolation test for school_geofences: same-school read for any role,
-- write locked to school_admin + super_admin (anti-spoof — a teacher or
-- principal must never be able to draw their own geofence).
-- Run: npx supabase db query --local -f supabase/tests/rls/school_geofences.test.sql

BEGIN;

INSERT INTO public.schools (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RLS Test School');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"RLS Test Staff"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.school_geofences (id, school_id, name, center_lat, center_lng, radius_m, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001', 'Main Campus', 0, 0, 100, 'a0000000-0000-0000-0000-00000000001f');

-- ── teacher: can read, cannot write ──────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_geofences WHERE id = 'a0000000-0000-0000-0000-000000000030') THEN
    RAISE EXCEPTION 'FAIL: teacher cannot read school_geofences in their own school';
  END IF;
  RAISE NOTICE 'PASS: teacher can read school_geofences in their own school';
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Spoofed Fence', 12.9, 77.6, 50);
    RAISE EXCEPTION 'FAIL: teacher was able to insert a school_geofences row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: teacher insert into school_geofences rejected';
  END;
END $$;

-- ── principal: can read, cannot write (read-only per Module A.5) ─────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
      ('a0000000-0000-0000-0000-000000000001', 'Principal Fence', 12.9, 77.6, 50);
    RAISE EXCEPTION 'FAIL: principal was able to insert a school_geofences row';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: principal insert into school_geofences rejected (read-only)';
  END;
END $$;

-- ── school_admin: can read and write ─────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

INSERT INTO public.school_geofences (school_id, name, center_lat, center_lng, radius_m) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Sports Annexe', 12.91, 77.61, 80);

DO $$ BEGIN RAISE NOTICE 'PASS: school_admin insert into school_geofences accepted'; END $$;

-- ── super_admin: bypasses school scoping on read ─────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.school_geofences WHERE school_id = 'a0000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'FAIL: super_admin cannot see school_geofences across schools';
  END IF;
  RAISE NOTICE 'PASS: super_admin bypasses school scoping on school_geofences';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rls/school_geofences.test.sql`
Expected: exits 0; output contains, in order, `PASS: teacher can read school_geofences in their own school`, `PASS: teacher insert into school_geofences rejected`, `PASS: principal insert into school_geofences rejected (read-only)`, `PASS: school_admin insert into school_geofences accepted`, `PASS: super_admin bypasses school scoping on school_geofences`; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000064_geo_attendance_schema.sql supabase/tests/rls/school_geofences.test.sql
git commit -m "feat(db): add geo attendance schema — geo_status enum, attendance_records geo columns, school_geofences + RLS"
```

---

### Task 2: `_haversine_m` — pure-SQL distance helper

**Files:**
- Create: `supabase/migrations/20240001000065_haversine.sql`
- Create: `supabase/tests/haversine.test.sql`

**Interfaces:**
- Consumes: nothing (pure function, no tables).
- Produces: `public._haversine_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) RETURNS numeric` — Task 3 calls this to rank geofences by distance.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20240001000065_haversine.sql
-- Sub-project #2, Module A.2: pure-SQL Haversine distance helper.
-- Point-to-radius only (1-3 geofences/school, never spatial indexing over
-- large sets) so cube+earthdistance is avoided entirely — no extension
-- surface for zero benefit. See architecture doc D15.

CREATE OR REPLACE FUNCTION public._haversine_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  ));
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 3: Write the unit test**

```sql
-- supabase/tests/haversine.test.sql
-- Unit test for public._haversine_m. Pure function, no fixtures needed —
-- wrapped in a transaction only for consistency with the rest of the suite.
-- Run: npx supabase db query --local -f supabase/tests/haversine.test.sql

BEGIN;

DO $$
BEGIN
  IF public._haversine_m(12.9716, 77.5946, 12.9716, 77.5946) <> 0 THEN
    RAISE EXCEPTION 'FAIL: distance between identical points is not 0';
  END IF;
  RAISE NOTICE 'PASS: distance between identical points is 0';
END $$;

DO $$
DECLARE v_dist numeric;
BEGIN
  -- 1 degree of latitude is ~110.6-111.7 km on a sphere; a generous band
  -- catches the right constant without hardcoding the exact sphere radius math.
  v_dist := public._haversine_m(0, 0, 1, 0);
  IF v_dist < 110000 OR v_dist > 112000 THEN
    RAISE EXCEPTION 'FAIL: 1 degree latitude distance out of expected range: %', v_dist;
  END IF;
  RAISE NOTICE 'PASS: 1 degree latitude distance in expected range (% m)', v_dist;
END $$;

DO $$
BEGIN
  IF public._haversine_m(12.9716, 77.5946, 13.0716, 77.5946)
     <> public._haversine_m(13.0716, 77.5946, 12.9716, 77.5946) THEN
    RAISE EXCEPTION 'FAIL: haversine distance is not symmetric';
  END IF;
  RAISE NOTICE 'PASS: haversine distance is symmetric';
END $$;

ROLLBACK;
```

- [ ] **Step 4: Run the test**

Run: `npx supabase db query --local -f supabase/tests/haversine.test.sql`
Expected: exits 0; `PASS: distance between identical points is 0`, `PASS: 1 degree latitude distance in expected range (... m)`, `PASS: haversine distance is symmetric`; no `ERROR:` lines.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240001000065_haversine.sql supabase/tests/haversine.test.sql
git commit -m "feat(db): add _haversine_m pure-SQL distance helper for geo attendance"
```

---

### Task 3: `mark_attendance` RPC

**Files:**
- Create: `supabase/migrations/20240001000066_mark_attendance.sql`
- Create: `supabase/tests/rpc/mark_attendance.test.sql`

**Interfaces:**
- Consumes: `public.can_write_section_attendance(uuid)` (migration 59), `public.get_my_role()`/`public.get_my_school_id()` (migration 38), `public.feature_enabled(uuid, text)` (F1/ERP-60 — verified in Step 1), `public._haversine_m(numeric, numeric, numeric, numeric)` (Task 2), `public.school_geofences`/`public.geo_status`/`attendance_records` geo columns (Task 1).
- Produces: `public.mark_attendance(p_section_id uuid, p_session public.attendance_session, p_date date, p_records jsonb, p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL, p_accuracy numeric DEFAULT NULL, p_geo_source text DEFAULT 'web') RETURNS void`, granted to `authenticated`. Nothing later in this plan consumes it; Module A.4 (separate ticket) will call it from the mobile/web clients.

- [ ] **Step 1: Verify the prerequisite exists — do not proceed if it doesn't**

Run: `grep -rn "CREATE OR REPLACE FUNCTION public.feature_enabled" supabase/migrations`

Expected: at least one match (the F1/ERP-60 migration, e.g. `..._feature_flags.sql`). **If there is no match, stop here** — this task is blocked on F1 landing first. Do not write `feature_enabled()` yourself in this migration; it belongs to a different ticket.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/20240001000066_mark_attendance.sql
-- Sub-project #2, Module A.3: mark_attendance RPC — the single write path
-- that replaces both client .upsert() calls (mobile [sectionId].tsx:108,
-- web attendance-mark-form.tsx:79). SECURITY DEFINER so it can stamp
-- geo_status regardless of caller role, mirroring mark_homework_viewed
-- (migration 48).
--
-- Authorization intentionally reproduces the FULL attendance_write RLS
-- shape (migration 59) — super_admin, or school_admin/principal in-school,
-- or a teacher who can_write_section_attendance() — not just the last
-- branch. can_write_section_attendance() alone only covers assigned
-- teachers; calling it in isolation would newly lock out
-- school_admin/principal/super_admin, who write attendance today via the
-- RLS-gated .upsert() without being assigned to the section.

CREATE OR REPLACE FUNCTION public.mark_attendance(
  p_section_id  uuid,
  p_session     public.attendance_session,
  p_date        date,
  p_records     jsonb,
  p_lat         numeric DEFAULT NULL,
  p_lng         numeric DEFAULT NULL,
  p_accuracy    numeric DEFAULT NULL,
  p_geo_source  text DEFAULT 'web'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_school_id           uuid;
  v_geo_enabled         boolean;
  v_geo_status          public.geo_status;
  v_geo_distance_m      numeric;
  v_matched_geofence_id uuid;
  v_captured_lat        numeric;
  v_captured_lng        numeric;
  v_captured_accuracy   numeric;
  v_nearest_id          uuid;
  v_nearest_radius      integer;
  v_nearest_dist        numeric;
  v_rec                 record;
BEGIN
  SELECT school_id INTO v_school_id FROM public.sections WHERE id = p_section_id;
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'section_not_found';
  END IF;

  IF NOT (
    public.get_my_role() = 'super_admin'
    OR (
      public.get_my_role() IN ('school_admin', 'principal')
      AND v_school_id = public.get_my_school_id()
    )
    OR (
      public.get_my_role() = 'teacher'
      AND v_school_id = public.get_my_school_id()
      AND public.can_write_section_attendance(p_section_id)
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_geo_enabled := public.feature_enabled(v_school_id, 'attendance_geo');

  IF NOT v_geo_enabled THEN
    v_geo_status          := NULL;
    v_geo_distance_m      := NULL;
    v_matched_geofence_id := NULL;
    v_captured_lat        := NULL;
    v_captured_lng        := NULL;
    v_captured_accuracy   := NULL;
  ELSIF p_lat IS NULL OR p_lng IS NULL THEN
    v_geo_status          := CASE WHEN p_geo_source = 'device' THEN 'no_gps'::public.geo_status
                                   ELSE 'not_captured'::public.geo_status END;
    v_geo_distance_m      := NULL;
    v_matched_geofence_id := NULL;
    v_captured_lat        := p_lat;
    v_captured_lng        := p_lng;
    v_captured_accuracy   := p_accuracy;
  ELSE
    v_captured_lat      := p_lat;
    v_captured_lng      := p_lng;
    v_captured_accuracy := p_accuracy;

    SELECT sg.id, sg.radius_m, public._haversine_m(p_lat, p_lng, sg.center_lat, sg.center_lng)
    INTO v_nearest_id, v_nearest_radius, v_nearest_dist
    FROM public.school_geofences sg
    WHERE sg.school_id = v_school_id AND sg.is_active = true
    ORDER BY public._haversine_m(p_lat, p_lng, sg.center_lat, sg.center_lng) ASC
    LIMIT 1;

    IF NOT FOUND THEN
      v_geo_status          := 'not_captured';
      v_geo_distance_m      := NULL;
      v_matched_geofence_id := NULL;
    ELSIF v_nearest_dist <= v_nearest_radius THEN
      v_geo_status          := 'inside';
      v_geo_distance_m      := v_nearest_dist - v_nearest_radius;
      v_matched_geofence_id := v_nearest_id;
    ELSE
      v_geo_status          := 'outside';
      v_geo_distance_m      := v_nearest_dist - v_nearest_radius;
      v_matched_geofence_id := NULL;
    END IF;
  END IF;

  FOR v_rec IN SELECT * FROM jsonb_to_recordset(p_records) AS x(student_id uuid, status public.attendance_status)
  LOOP
    INSERT INTO public.attendance_records (
      student_id, section_id, school_id, date, session, status, marked_by,
      captured_lat, captured_lng, gps_accuracy_m,
      geo_status, geo_distance_m, matched_geofence_id
    ) VALUES (
      v_rec.student_id, p_section_id, v_school_id, p_date, p_session, v_rec.status, auth.uid(),
      v_captured_lat, v_captured_lng, v_captured_accuracy,
      v_geo_status, v_geo_distance_m, v_matched_geofence_id
    )
    ON CONFLICT (student_id, date, session) DO UPDATE SET
      status              = EXCLUDED.status,
      marked_by            = EXCLUDED.marked_by,
      captured_lat         = EXCLUDED.captured_lat,
      captured_lng         = EXCLUDED.captured_lng,
      gps_accuracy_m       = EXCLUDED.gps_accuracy_m,
      geo_status           = EXCLUDED.geo_status,
      geo_distance_m       = EXCLUDED.geo_distance_m,
      matched_geofence_id  = EXCLUDED.matched_geofence_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_attendance(uuid, public.attendance_session, date, jsonb, numeric, numeric, numeric, text)
  TO authenticated;
```

- [ ] **Step 3: Apply the migration locally**

Run: `npx supabase db reset`
Expected: completes with no errors.

- [ ] **Step 4: Write the RPC test**

```sql
-- supabase/tests/rpc/mark_attendance.test.sql
-- Behavior test for public.mark_attendance: authorization shape, legacy
-- .upsert() equivalence, geo_status stamping under every branch, and
-- upsert/re-stamp semantics.
-- Run: npx supabase db query --local -f supabase/tests/rpc/mark_attendance.test.sql

BEGIN;

-- ── Fixture (runs as the connecting superuser; bypasses RLS for setup) ─────
INSERT INTO public.schools (id, name) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'RPC Test School');

INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '2026-27', '2026-06-01', '2027-04-30', 'active');

INSERT INTO public.classes (id, school_id, name) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Class 5');

INSERT INTO public.sections (id, class_id, school_id, name, academic_year_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'A', 'a0000000-0000-0000-0000-000000000002');

-- Teacher A: assigned class teacher of the section (authorized).
INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-00000000001f', '910000000001', now(),
  '{"full_name":"Teacher A"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

-- Teacher B: same school, NOT assigned to this section (must be rejected).
INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-000000000021', '910000000002', now(),
  '{"full_name":"Teacher B"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.section_assignments (section_id, academic_year_id, class_teacher_id, school_id) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000001f', 'a0000000-0000-0000-0000-000000000001');

INSERT INTO auth.users (
  id, phone, phone_confirmed_at, raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES (
  'a0000000-0000-0000-0000-0000000000a1', '910000000003', now(),
  '{"full_name":"Student One"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
),
(
  'a0000000-0000-0000-0000-0000000000a2', '910000000004', now(),
  '{"full_name":"Student Two"}'::jsonb, now(), now(),
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

INSERT INTO public.student_profiles (id, profile_id, school_id, class_id, section_id) VALUES
  ('a0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a1', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-0000000000b2', 'a0000000-0000-0000-0000-0000000000a2', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 1: authorization shape (attendance_geo flag is OFF for all of this —
-- features_enabled is '{}' by default, so feature_enabled() fails safe to
-- false and geo_status is NULL throughout this phase).
-- ══════════════════════════════════════════════════════════════════════════

-- 1a. Unassigned teacher (Teacher B) — rejected.
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000021"}', true);

DO $$
BEGIN
  BEGIN
    PERFORM public.mark_attendance(
      'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-01'::date,
      '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
    );
    RAISE EXCEPTION 'FAIL: unassigned teacher was able to call mark_attendance';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'not_authorized' THEN
      RAISE NOTICE 'PASS: unassigned teacher rejected by mark_attendance';
    ELSE
      RAISE EXCEPTION 'FAIL: unexpected error from unassigned teacher: %', SQLERRM;
    END IF;
  END;
END $$;

-- 1b. Assigned teacher (Teacher A) — accepted; verify legacy-upsert shape.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-01'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records
    WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-01' AND session = 'FULL_DAY';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL: assigned teacher mark_attendance did not insert a row';
  END IF;
  IF r.section_id <> 'a0000000-0000-0000-0000-000000000004'
     OR r.school_id <> 'a0000000-0000-0000-0000-000000000001'
     OR r.status <> 'present'
     OR r.marked_by <> 'a0000000-0000-0000-0000-00000000001f'
     OR r.geo_status IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: row does not match legacy .upsert shape: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: assigned teacher mark_attendance matches legacy .upsert shape, geo_status NULL (flag off)';
END $$;

-- 1c. school_admin, NOT assigned to this section — accepted (proves the
-- authorization fix: can_write_section_attendance() alone would reject this).
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'school_admin', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-02'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
  );
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-02') THEN
    RAISE EXCEPTION 'FAIL: school_admin mark_attendance did not insert a row';
  END IF;
  RAISE NOTICE 'PASS: school_admin (not section-assigned) accepted by mark_attendance';
END $$;

-- 1d. principal, NOT assigned — accepted (same shape as school_admin).
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'principal', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-03'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
  );
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-03') THEN
    RAISE EXCEPTION 'FAIL: principal mark_attendance did not insert a row';
  END IF;
  RAISE NOTICE 'PASS: principal (not section-assigned) accepted by mark_attendance';
END $$;

-- 1e. super_admin, no school header at all — accepted.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'super_admin', true);
SELECT set_config('app.school_id', '', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-04'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
  );
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-04') THEN
    RAISE EXCEPTION 'FAIL: super_admin mark_attendance did not insert a row';
  END IF;
  RAISE NOTICE 'PASS: super_admin accepted by mark_attendance';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 2: flag OFF + coordinates passed anyway — every geo column must
-- stay NULL, coords must NOT be stored (edge case 1: fully opt-in).
-- ══════════════════════════════════════════════════════════════════════════
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-05'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    12.9716, 77.5946, 8.5, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-05';
  IF r.geo_status IS NOT NULL OR r.captured_lat IS NOT NULL OR r.captured_lng IS NOT NULL OR r.gps_accuracy_m IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: geo columns populated despite attendance_geo flag being OFF: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: flag OFF forces all geo columns NULL even when coords are supplied';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 3: flag ON — geo verdict branches.
-- ══════════════════════════════════════════════════════════════════════════
RESET ROLE;
UPDATE public.schools SET features_enabled = '{"attendance_geo": true}'::jsonb WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- 3a. Flag ON, no geofences exist yet — not_captured (never a false "outside").
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-06'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    5, 5, 10, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-06';
  IF r.geo_status <> 'not_captured' OR r.geo_distance_m IS NOT NULL OR r.matched_geofence_id IS NOT NULL
     OR r.captured_lat <> 5 OR r.captured_lng <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected not_captured with no active geofences: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: flag ON + no active geofences yields not_captured, coords still recorded';
END $$;

RESET ROLE;
INSERT INTO public.school_geofences (id, school_id, name, center_lat, center_lng, radius_m, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001', 'Main Campus', 0, 0, 100, true);

-- 3b. Coords exactly at the geofence center — inside.
SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-07'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    0, 0, 10, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-07';
  IF r.geo_status <> 'inside' OR r.matched_geofence_id <> 'a0000000-0000-0000-0000-000000000030' OR r.geo_distance_m <> -100 THEN
    RAISE EXCEPTION 'FAIL: expected inside at geofence center: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: coords at geofence center yield inside, geo_distance_m = -100';
END $$;

-- 3c. Coords well outside the geofence — outside.
DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-08'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    1, 0, 10, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records; v_expected numeric;
BEGIN
  v_expected := public._haversine_m(1, 0, 0, 0) - 100;
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-08';
  IF r.geo_status <> 'outside' OR r.matched_geofence_id IS NOT NULL OR r.geo_distance_m <> v_expected THEN
    RAISE EXCEPTION 'FAIL: expected outside 1 degree away: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: coords 1 degree away yield outside, matched_geofence_id NULL, correct signed distance';
END $$;

-- 3d. No coords, p_geo_source='device' — no_gps.
DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-09'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    NULL, NULL, NULL, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-09';
  IF r.geo_status <> 'no_gps' THEN
    RAISE EXCEPTION 'FAIL: expected no_gps for device + null coords: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: device + null coords yields no_gps';
END $$;

-- 3e. No coords, p_geo_source default ('web') — not_captured.
DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-10'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-10';
  IF r.geo_status <> 'not_captured' THEN
    RAISE EXCEPTION 'FAIL: expected not_captured for default web + null coords: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: web (default) + null coords yields not_captured';
END $$;

-- 3f. Inactive geofence must be excluded even when it is the nearest one.
RESET ROLE;
INSERT INTO public.school_geofences (id, school_id, name, center_lat, center_lng, radius_m, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001', 'Disused Annexe', 2, 2, 5000, false);

SET LOCAL ROLE authenticated;
SELECT set_config('app.role', 'teacher', true);
SELECT set_config('app.school_id', 'a0000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000001f"}', true);

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-11'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    2, 2, 10, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records;
BEGIN
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-11';
  IF r.geo_status <> 'outside' OR r.matched_geofence_id IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: inactive geofence was incorrectly matched: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: inactive geofence excluded even when nearest by distance';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 4: re-mark upserts, does not duplicate, re-stamps geo from the new
-- submit location (edge case 5).
-- ══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-12'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"}]'::jsonb,
    0, 0, 10, 'device'
  );
END $$;

DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-12'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"absent"}]'::jsonb,
    1, 0, 10, 'device'
  );
END $$;

DO $$
DECLARE r public.attendance_records; v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-12' AND session = 'FULL_DAY';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: re-mark created % rows instead of upserting 1', v_count;
  END IF;
  SELECT * INTO r FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-12' AND session = 'FULL_DAY';
  IF r.status <> 'absent' OR r.geo_status <> 'outside' THEN
    RAISE EXCEPTION 'FAIL: re-mark did not reflect the second submit: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'PASS: re-marking upserts the same row and re-stamps geo from the new location';
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- Phase 5: multi-record submit shares one geo stamp across all students.
-- ══════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  PERFORM public.mark_attendance(
    'a0000000-0000-0000-0000-000000000004'::uuid, 'FULL_DAY'::public.attendance_session, '2026-07-13'::date,
    '[{"student_id":"a0000000-0000-0000-0000-0000000000b1","status":"present"},{"student_id":"a0000000-0000-0000-0000-0000000000b2","status":"late"}]'::jsonb,
    0, 0, 10, 'device'
  );
END $$;

DO $$
DECLARE r1 public.attendance_records; r2 public.attendance_records;
BEGIN
  SELECT * INTO r1 FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b1' AND date = '2026-07-13';
  SELECT * INTO r2 FROM public.attendance_records WHERE student_id = 'a0000000-0000-0000-0000-0000000000b2' AND date = '2026-07-13';
  IF r1.status <> 'present' OR r2.status <> 'late' THEN
    RAISE EXCEPTION 'FAIL: multi-record submit did not apply per-student status correctly';
  END IF;
  IF r1.geo_status <> 'inside' OR r2.geo_status <> 'inside' OR r1.matched_geofence_id <> r2.matched_geofence_id THEN
    RAISE EXCEPTION 'FAIL: multi-record submit did not share the same geo stamp across students';
  END IF;
  RAISE NOTICE 'PASS: multi-record submit applies per-student status with one shared geo stamp';
END $$;

RESET ROLE;
ROLLBACK;
```

- [ ] **Step 5: Run the test**

Run: `npx supabase db query --local -f supabase/tests/rpc/mark_attendance.test.sql`
Expected: exits 0; `PASS:` lines for every scenario in order (unauthorized rejection, legacy-upsert shape match, school_admin/principal/super_admin acceptance without section assignment, flag-off forcing all geo columns NULL, not_captured with no geofences, inside at center, outside with correct signed distance, no_gps, not_captured via default web source, inactive-geofence exclusion, re-mark upsert + re-stamp, multi-record shared stamp); no `ERROR:` lines.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20240001000066_mark_attendance.sql supabase/tests/rpc/mark_attendance.test.sql
git commit -m "feat(db): add mark_attendance RPC — server-validated geo attendance write path"
```
