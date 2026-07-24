# Sub-project #2 — Implementation deep-dive: Geo attendance · Exam schedule · Fee status

> Grounded on the live codebase (2026-07-24) via targeted Explore passes. Companion to the architecture
> spec `2026-07-22-eduos-feature-architecture-design.md` (design decisions **D13** + **D15**) and the UX
> mockups in `stitch-designs/eduos-v2/` (`geo-attendance-*.html`, `exam-schedule-*.html`, `fee-status-web.html`).
> This doc is the source for the ERP Jira tickets: it carries the tables, RPCs, RLS, triggers, edge functions,
> file:line touch-points and edge cases needed to build each module in "100% working condition."

**Hard context that shapes everything below:**
- Attendance/exam/fee writes today are **direct client `.upsert()`/`.insert()`** — no RPCs, no API routes.
- **No geo anywhere** (no GPS, no PostGIS/earthdistance). **No exam schedule** (an `exam` = name + two dates).
  Fees have **no persisted `overdue`** and **no defaulter view**.
- **`feature_enabled()` does not exist yet** — it's built in F1 (sub-project #1), which ships *before* this.
  Every gate below is written to call `feature_enabled(school_id, '<key>')` and is a **no-op until F1 lands**.
- RLS runs off transaction-local GUCs set by `scope_pre_request()` from `x-school-id`/`x-active-role` headers;
  helpers `get_my_school_id()`, `get_my_role()`. Per-table pattern = broad `_select` by school + role-narrowed
  `_write`, always with a `get_my_role()='super_admin' OR …` bypass (NULL-scope denial otherwise).
- Notifications: **no general parent-SMS channel** (`send-sms` is the auth-OTP hook only). Parent messaging =
  **Expo push** (`profiles.push_token`) **+ an in-app `notifications` row**. Fan-out template =
  `supabase/functions/send-homework-notification/index.ts`. Cron template = `20240001000054_cron_vault_rework.sql`
  + `_vault_get(name)` + `x-cron-secret`-guarded edge fn. Next migration number after 62 = **`20240001000063`**.

---

## MODULE A — Geo attendance

### A.1 Data model (migration: geo columns + geofences)

Add to **`attendance_records`** (all nullable — harmless for pre-geo, web, and flag-off rows):

| column | type | meaning |
|---|---|---|
| `captured_lat` | `numeric` | phone-reported latitude at submit |
| `captured_lng` | `numeric` | phone-reported longitude |
| `gps_accuracy_m` | `numeric` | reported ± accuracy (metres) |
| `geo_status` | `public.geo_status` enum | verdict (below) |
| `geo_distance_m` | `numeric` | distance to **nearest geofence edge** (`captured − radius`); the "38 m past fence" vs "1.4 km" signal |
| `matched_geofence_id` | `uuid → school_geofences(id)` | which campus it fell inside (null unless `inside`) |

New enum `public.geo_status`: **`inside` | `outside` | `no_gps` | `not_captured`**.
- `inside`/`outside` — phone gave coords, server tested against geofences.
- `no_gps` — phone tried, location unavailable/denied.
- `not_captured` — no geo attempted: **web marking**, or geo flag OFF, or school has no geofences.
- `NULL` — geo feature OFF for the school (pure legacy attendance).

New table **`school_geofences`**:
```
id uuid pk default gen_random_uuid()
school_id uuid not null references schools(id) on delete cascade
name text not null                     -- "Main campus", "Sports annexe"
center_lat numeric not null
center_lng numeric not null
radius_m integer not null              -- supports large/multi-building campuses (up to several km)
is_active boolean not null default true
created_at timestamptz not null default now()
created_by uuid references auth.users(id)
-- index idx_school_geofences_school_id
```
Multi-campus: a school may have many rows; a submission is `inside` if within **any** active geofence.

### A.2 Distance function (pure SQL, no extension)

```sql
create or replace function public._haversine_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable set search_path = '' as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2-lat1)/2)),2) +
    cos(radians(lat1))*cos(radians(lat2))*power(sin(radians((lng2-lng1)/2)),2)));
$$;
```
Rationale: we only need point-to-radius, never spatial indexing over big sets (1–3 geofences/school), so
`cube`+`earthdistance` are avoided (extension surface in every env for zero benefit). See D15.

### A.3 `mark_attendance` RPC — the single write path (replaces both client upserts)

`SECURITY DEFINER SET search_path=''`, mirrors house style (`mark_homework_viewed`, migration 48).

```
mark_attendance(
  p_section_id uuid, p_session public.attendance_session, p_date date,
  p_records jsonb,            -- [{student_id, status}, ...]
  p_lat numeric default null, p_lng numeric default null, p_accuracy numeric default null
) returns void
```
Body:
1. **Authorize**: `IF NOT public.can_write_section_attendance(p_section_id) THEN RAISE EXCEPTION 'not_authorized'`.
   (Existing predicate, migration 59:14-36 — super_admin/school_admin/principal, or teacher who teaches the section.)
2. Resolve `v_school_id` from the section; **(once F1)** `IF NOT feature_enabled(v_school_id,'attendance_geo') THEN` treat as no-geo (`p_lat` ignored, `geo_status := null`).
3. **Geo verdict**: if `p_lat/p_lng` null → `no_gps` (mobile) / `not_captured` is set by caller intent — see note; else loop `school_geofences where school_id=v_school_id and is_active`, compute `_haversine_m`, pick nearest; `inside` if `nearest ≤ radius_m` (store `matched_geofence_id`, `geo_distance_m = nearest - radius`), else `outside` (`geo_distance_m = nearest - radius`, positive). No active geofences → `not_captured`.
4. **Upsert** each record with the same key as today: `insert … on conflict (student_id, date, session) do update set status=…, geo_* = …, marked_by=…`. Columns already written today: `student_id, section_id, school_id, date, session, status, marked_by` (mobile `[sectionId].tsx:108`, web `attendance-mark-form.tsx:79`).

**Web vs mobile `not_captured` distinction:** the RPC can't tell web from a phone with no fix. Resolve by a param
`p_geo_source text` (`'device'|'web'`) — `'web'` + null coords → `not_captured`; `'device'` + null coords → `no_gps`.
(Simplest honest signal; keeps the flag-review buckets clean.)

Grant: `grant execute on function public.mark_attendance(...) to authenticated;`

### A.4 Client changes

**Mobile** (`apps/mobile/app/(teacher)/attendance/[sectionId].tsx`):
- Add **`expo-location`** to `apps/mobile/package.json` (Expo SDK ~55; RN 0.83). Mirror the lazy-import + permission
  pattern from `apps/mobile/lib/notifications.ts:13,24` (`getForegroundPermissionsAsync` → `requestForegroundPermissionsAsync` → proceed regardless), guard Expo Go via `Constants.appOwnership`.
- **On screen open** (advisory chip): read active `school_geofences` for the school (client select allowed by RLS),
  call `Location.getLastKnownPositionAsync()` (cached, no active fix, ~0 battery); compute advisory inside/outside
  client-side; render header chip `On campus (approx)`/`Off campus (approx)`/neutral. **Display only, never written.**
- **At submit**: `Location.getCurrentPositionAsync()` (active fix) → `supabase.rpc('mark_attendance', {…, p_lat, p_lng, p_accuracy, p_geo_source:'device'})`. Replaces the current inline `.upsert`.
- Permission denied / no fix → call RPC with null coords (`no_gps`); never block.

**Web** (`apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx:79`): replace `.upsert` with
`supabase.rpc('mark_attendance', {…, p_geo_source:'web'})`. No GPS.

### A.5 Geofence setup + flag review (web)

- **Setup** (`stitch-designs/eduos-v2/geo-attendance-web.html` → Geofences tab): new admin page. Map = **Leaflet +
  OpenStreetMap tiles** (free, no API key). Pin-drop center, drag radius, manual lat/lng override, radius numeric+slider
  (large range). CRUD `school_geofences`. **RLS write = school_admin + super_admin only** (principal read-only) — the
  anti-spoof lock (a teacher-writable geofence = "draw a circle around myself, always inside"). Read = same-school authenticated (mobile advisory chip needs it).
- **Flag review** (Flag review tab): list `attendance_records` where `geo_status in ('outside','no_gps')` for a
  window, joined to teacher + section; columns teacher, when, `geo_distance_m`, `gps_accuracy_m`, map dot, **✓ Reviewed**.
  Add `geo_reviewed_at timestamptz`, `geo_reviewed_by uuid` (nullable) to mark handled. Nav badge = count of unreviewed
  flags (0 ⇒ no badge). Principal primary + school_admin. **Deliberately not a cockpit** (no KPIs).

### A.6 RLS

- `school_geofences`: `_select` = `super_admin OR school_id=get_my_school_id()`; `_write` = `super_admin OR (get_my_role()='school_admin' AND school_id=get_my_school_id())`.
- `attendance_records`: existing policies unchanged; geo columns ride along. `mark_attendance` is `SECURITY DEFINER` so
  it writes regardless; the review page reads under the existing school-scoped `_select`.

### A.7 Edge cases
1. Flag OFF → no permission prompt, no coords, `geo_status=NULL`. Fully opt-in.
2. Flag ON, **no geofences** → `not_captured` (never false "outside"); setup empty-state nudges to add a campus.
3. Permission denied / airplane mode → `no_gps`, saves.
4. Web marking → `not_captured` (never pollutes `no_gps`).
5. Editing an existing day's attendance re-runs the RPC → geo re-stamped from the new submit location (expected).
6. Poor accuracy near the edge → `outside` but `gps_accuracy_m` large + small `geo_distance_m` lets review see "likely drift."
7. Offline marking → **deferred** (D15); v1 requires connectivity to submit, same as every write today.
8. Cron/service-role writes (none for attendance today) would bypass the flag — not applicable here.

---

## MODULE B — Exam schedule

### B.1 Data model (migration)

`exams` **+=** `datesheet_published_at timestamptz`, `datesheet_last_notified_at timestamptz` (both null = draft/never-notified).

New **`rooms`**:
```
id uuid pk, school_id uuid not null references schools(id) on delete cascade,
name text not null, capacity integer, is_active boolean not null default true,
created_at timestamptz default now(), created_by uuid references auth.users(id)
-- unique(school_id, lower(name)) to keep clash detection reliable; idx on school_id
```
Add-on-the-fly from the slot form ("+ New room"). Capacity captured, **not enforced** (seating deferred).

New **`exam_schedule_slots`**:
```
id uuid pk default gen_random_uuid()
school_id uuid not null references schools(id) on delete cascade
exam_id uuid not null references exams(id) on delete cascade
class_id uuid not null references classes(id)         -- grade level; all sections sit together
subject_id uuid not null references subjects(id)      -- subjects belong to a class (grade)
exam_date date not null
start_time time not null
end_time time not null
room_id uuid references rooms(id)                     -- optional (admin's primary hall record)
invigilator_id uuid references auth.users(id)         -- optional; a teacher
is_dirty boolean not null default false               -- edited since last notify
created_at timestamptz default now()
updated_at timestamptz default now()
created_by uuid references auth.users(id)
unique(exam_id, class_id, subject_id)                 -- one paper per subject per class per exam
-- indexes: (school_id), (exam_id), (exam_date)
```
Granularity = **class+subject** (matches `subjects`/`exam_results` keying; all sections of a grade sit the same paper).
**Room is NOT shown to parents** (D15 grill follow-up — student→hall mapping is the deferred seating feature; multiple
rooms per paper ships with seating). `invigilator_id` = teacher dropdown, no new entity.

### B.2 Clash-detection trigger (plpgsql, no extension — gives NAMED errors)

`BEFORE INSERT OR UPDATE ON exam_schedule_slots`, function `check_exam_slot_clash()`:
- Time overlap predicate on same `school_id` + `exam_date`: `NEW.start_time < other.end_time AND NEW.end_time > other.start_time` (exclude `id = NEW.id`).
- Three checks, each building a **named** `RAISE EXCEPTION`:
  1. **Room**: same non-null `room_id` overlapping → `Room "%" is booked for % · %, %–%` (room, class, subject, times).
  2. **Invigilator**: same non-null `invigilator_id` overlapping → `% is invigilating % · %, %–%`.
  3. **Class**: same `class_id` overlapping (any subject) → `Class % already sits % at %–%`.
- Also `RAISE EXCEPTION` if `end_time <= start_time`.
- Clash is checked **across exams** too (a room can't host two different exams' papers at the same clock time).

Trigger (not an `EXCLUDE`/`btree_gist` constraint) **because** the mockup requires the specific "what it collided with"
message; exclusion constraints can only emit a generic violation. No time-range extension exists to reuse anyway.

### B.3 Slot CRUD (web builder) — direct client write, trigger enforces

`stitch-designs/eduos-v2/exam-schedule-web.html`. The add-paper drawer does a direct
`supabase.from('exam_schedule_slots').upsert(...)` (RLS `_write` = admin/principal). The trigger's `RAISE EXCEPTION`
message propagates as `error.message` — surface it inline exactly like the existing `23505` handling in
`apps/web/app/(school)/admin/timetable/timetable-grid.tsx:206`. Editing a slot when `datesheet_published_at IS NOT NULL`
sets `is_dirty = true` (via the write, or a `BEFORE UPDATE` set). Calendar-preview is a read-only projection of the same rows.

### B.4 Publish + notify — edge function `publish-exam-datesheet`

Invoked from the builder ("Publish" / "Publish changes"). Mirrors `send-homework-notification` (auth JWT →
service-role client → authorize admin → fan-out). Body `{ exam_id }`:
1. Authorize caller is school_admin/principal for the exam's school.
2. If `datesheet_published_at IS NULL` → set it now; **affected classes = all classes in the datesheet** (first publish).
   Else **affected classes = distinct `class_id` where `is_dirty`**.
3. For each affected class: resolve parents via `student_enrollments`(active year, class) → `student_profiles.parent_profile_id`
   → for each parent **insert a `notifications` row** (`user_id, student_id, school_id, title, body, type='exam_datesheet'`)
   **+ Expo push** (`sendExpoPush`, clear stale `push_token` on `DeviceNotRegistered`). Copy: `Class 6: Term-1 datesheet updated — Maths moved to 11 Dec`.
4. `update exam_schedule_slots set is_dirty=false where exam_id=…`; set `datesheet_last_notified_at=now()`.
- **v1 = push + in-app only** (no SMS channel exists). Visibility is immediate on save (RLS-gated by published_at);
  this function only controls the **notification**, per D15 semantic (a).

### B.5 Reminder cron — `send-exam-reminders` + pg_cron

- Edge fn `send-exam-reminders` (guard `x-cron-secret`, mirror `send-homework-reminders/index.ts:10`): find slots where
  `exam_date = current_date + 1` and the exam's `datesheet_published_at IS NOT NULL`; notify parents of those classes
  (`Maths exam tomorrow, 09:30`). Push + in-app.
- Migration adds the job the `cron_vault_rework` way: `cron.unschedule` if exists → `cron.schedule('exam-reminders','30 2 * * *', $$ net.http_post(url:=_vault_get('functions_url')||'/send-exam-reminders', headers:=…Bearer _vault_get('service_role_key')…, 'x-cron-secret'…) … $$)`. (Cron only fires on deployed Supabase, not local CLI.)

### B.6 Parent read (mobile) + RLS

- Mobile: seasonal **home card** on the parent dashboard when an exam has `datesheet_published_at` and a future paper;
  **nested read-only datesheet** under Academics — child's class slots, chronological, countdown, "updated" badge
  (compare slot `updated_at` to a locally-stored last-seen). **No room shown.** Parent-app-only (no student login).
  Resolve child's `class_id` via `student_enrollments` (active year) for the selected `student_profiles.id`.
- RLS on `exam_schedule_slots` + `rooms`:
  - **Staff `_select`** = `super_admin OR school_id=get_my_school_id()` (see drafts).
  - **Parent `_select`** (new policy, inline `EXISTS` idiom like `discipline_parent_read.sql`):
    ```
    get_my_role()='parent'
    AND (select datesheet_published_at from exams e where e.id = exam_schedule_slots.exam_id) is not null
    AND class_id in (
      select se.class_id from student_enrollments se
      join student_profiles sp on sp.id = se.student_profile_id
      where sp.parent_profile_id = auth.uid())
    ```
  - `_write` = `super_admin, school_admin, principal` + school match (mirrors `exams`).

### B.7 Edge cases
1. Publish with unassigned rooms/invigilators → allowed (optional); datesheet still valid.
2. Edit a published slot then never "Publish changes" → parents see the new value (immediate) but got no ping; `is_dirty` stays set (visible on admin side) — acceptable; reminder cron still fires off current values.
3. Delete a published slot → disappears from parent view; consider notifying (v1: treat as a change → `is_dirty` on the class via a tombstone or just re-publish). **v1 keep simple**: deletion is immediate, no special notify.
4. Clash on bulk import → trigger rejects the one row; client shows the named message.
5. Flag `exam_schedule` OFF → Exams builder nav hidden, parent card/datesheet hidden (once F1).
6. Two sections of a class needing different times → **not supported** (class+subject granularity); would be the seating/section-level extension.
7. Timezone: `exam_date`+`time` are wall-clock (school-local); reminder cron `current_date+1` uses the DB TZ — confirm DB TZ = IST or offset the compare.

---

## MODULE C — Fee status

### C.1 `student_fee_status` VIEW (no new storage)

Rollup over `fee_line_items` (`total_amount, due_date, status, class_id, academic_year_id, student_id`) and paid =
Σ `line_item_payments.amount_applied` per line item. Per **student × academic_year**:
```
student_id, school_id, academic_year_id, class_id,
total_billed        = sum(total_amount)
total_paid          = sum(applied)
outstanding         = total_billed - total_paid
earliest_unpaid_due = min(due_date) where line not fully paid
is_overdue          = outstanding > 0 AND earliest_unpaid_due < current_date
days_overdue        = greatest(0, current_date - earliest_unpaid_due)
```
- **Overdue derived on read** (D15) — no persisted column, no nightly flip. Existing `pending|partial|paid` unchanged.
- **RLS inherited**: a view runs with the querying user's rights against `fee_line_items` (admin school-wide,
  teacher section, parent own-child) — so no new policy needed; the admin dashboard sees the whole school, a parent
  would only see their child. (If a `security_invoker` view is needed on this PG version, set `with (security_invoker=true)`.)
- Dashboard KPIs = aggregates over the view (filter by `class_id`, `fee_type_id` via join to line items).
  Defaulter list = `where outstanding>0` (default `is_overdue` only; toggle shows all), `order by outstanding desc`.

### C.2 Send reminder — edge function `send-fee-reminder`

`{ student_ids: uuid[] }`, mirrors the parent fan-out: authorize admin → for each student resolve
`parent_profile_id` → insert `notifications` row (`type='fee_reminder'`, body `₹X due for <child> — pay in the app`) +
Expo push. **Direct-send after a confirm dialog** (transactional, not the D5 draft-review gate). **v1 = push + in-app
(no SMS).** Bulk = the selected set from the defaulter list.

### C.3 Outcome stats (light)
- "₹X collected in last 7 days" = Σ `payments.total_amount` where `payment_date ≥ now()-7d` (school-scoped).
- "N reminders sent this week / M paid since" = count `notifications` `type='fee_reminder'` in window; "paid since" =
  students who had a reminder and a subsequent payment. (Computed in the page loader; no new tables.)

### C.4 Edge cases
1. Partial payment still overdue → counts as defaulter (correct: still owes past due).
2. Student with one overdue + one not-yet-due line → `outstanding` = both unpaid; `days_overdue` from earliest **overdue** due date; appears under Overdue.
3. No parent linked / no push token → in-app `notifications` row still written; push skipped (same as homework fan-out).
4. `overdue` never persisted → always accurate, zero maintenance; the `fee_payment_status` enum's legacy `overdue` value stays unused.
5. Flag `fee_status` — the view is read-only over existing fees; gating optional (dashboard nav can hide behind flag once F1).
6. Predictive "likely to default" scoring is **out of scope** here — it's the Insights §6.3 engine, built last.

---

## Cross-cutting / build order
- All three depend on **F1** for `feature_enabled()`; write the gates now as calls, no-op until F1 lands. Build order
  within #2: **A geo → B exam → C fee** (independent; can parallelize, but this is the ticket order).
- **SMS gap** is shared: exam + fee reminders are **push + in-app** in v1; a general parent-SMS sender (reusing the
  Nettyfish integration behind a non-auth-hook function) is a separate follow-up if the school wants SMS.
- Migrations start at **`20240001000063`** (geo), then exam, then fee — sequential numbers.
- Every new table carries `school_id NOT NULL REFERENCES schools(id) ON DELETE CASCADE` + `idx_<tbl>_school_id` + RLS
  enabled in its own migration, per house convention.
