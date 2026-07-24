# Sub-project #3 — Implementation deep-dive: Leave (student absence → excused)

> Grounded on the live codebase (2026-07-24) via targeted Explore passes. Companion to the architecture spec
> `2026-07-22-eduos-feature-architecture-design.md` (decisions **D8** + **D16**) and the UX mockups
> `stitch-designs/eduos-v2/leave-*.html`. Source for the ERP "Leave" epic + stories.

**Context that shapes this:**
- Leave is **fully greenfield** — no leave table, no `excused` enum value, no holidays/calendar.
- **Scope = student leave only** (parent applies for child). Staff leave deferred (D16).
- The **exact request→approve pattern already exists** — homework RPCs. We mirror it 1:1.
- Writes go through **`SECURITY DEFINER` RPCs**; the table is **SELECT-only for clients** (deny-by-default), exactly like
  `homework_status` (`20240001000047:46` — "NO INSERT/UPDATE/DELETE policies").
- Reuse **`is_parent_of_student(uuid)`** (`20240001000048_homework_rpcs.sql:2-11`, SECURITY DEFINER, checks
  `student_profiles.parent_profile_id = auth.uid()`) and **`teaches_section` / `teaches_student`**
  (`20240001000061_teacher_write_scope.sql:23-63`).
- **No SQL view computes attendance %** — it's all app code, so the excused-exclusion sweep is a fixed file list (§4).
- Migrations land **after sub-project #2's** (geo/exam/fee). Use the next sequential numbers at build time; the
  `ALTER TYPE … ADD VALUE 'excused'` must be **its own migration** (Postgres forbids ADD VALUE + immediate use in one txn).

---

## 1. Data model (migrations)

**(a) Enum extension — standalone migration:**
```sql
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'excused';
```
Current enum (`20240001000000_enums.sql:12-17`) = `present | absent | late | half_day`. This appends `excused`. **Must be a
separate migration from anything that USES `'excused'`** (can't add value + reference it in the same txn).

**(b) Leave enums + table:**
```sql
CREATE TYPE public.leave_type   AS ENUM ('sick','casual','other');
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE public.leave_session_scope AS ENUM ('FULL_DAY');  -- FN/AN deferred (D16); enum leaves room to extend

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  from_date date NOT NULL,
  to_date   date NOT NULL,
  session_scope public.leave_session_scope NOT NULL DEFAULT 'FULL_DAY',
  leave_type public.leave_type NOT NULL,
  note text,
  status public.leave_status NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL REFERENCES auth.users(id),   -- the parent
  decided_by uuid REFERENCES auth.users(id),              -- approver
  decided_at timestamptz,
  decision_note text,                                     -- reject reason
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);
CREATE INDEX idx_leave_requests_school   ON public.leave_requests(school_id);
CREATE INDEX idx_leave_requests_student  ON public.leave_requests(student_id);
-- the trigger's hot path: find an approved leave covering a (student, date)
CREATE INDEX idx_leave_requests_lookup   ON public.leave_requests(student_id, status, from_date, to_date);
```

## 2. RPCs (mirror homework, `LANGUAGE plpgsql SECURITY DEFINER SET search_path=''`)

- **`request_leave(p_student_id, p_from date, p_to date, p_type public.leave_type, p_note text)`** — parent side.
  - `IF NOT public.is_parent_of_student(p_student_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;`
  - **Overlap guard:** `IF EXISTS (SELECT 1 FROM leave_requests WHERE student_id=p_student_id AND status IN ('pending','approved') AND daterange(from_date,to_date,'[]') && daterange(p_from,p_to,'[]')) THEN RAISE EXCEPTION 'overlapping_leave'; END IF;`
  - Resolve `school_id` + active `academic_year_id` from the student's enrollment; `INSERT … status='pending', requested_by=auth.uid()`.
- **`approve_leave(p_request_id)`** — approver side.
  - Authorize: `IF NOT (public.teaches_student(v_student) OR public.get_my_role() IN ('principal','school_admin')) THEN RAISE EXCEPTION 'not_authorized'; END IF;`
  - State guard: only from `'pending'` (`RAISE EXCEPTION 'not_pending'` otherwise).
  - `UPDATE leave_requests SET status='approved', decided_by=auth.uid(), decided_at=now() WHERE id=p_request_id;`
  - **Retroactive backfill:** `UPDATE public.attendance_records SET status='excused' WHERE student_id=v_student AND date BETWEEN v_from AND v_to;` — corrects already-marked days (the common case). Only touches rows that exist; unmarked days are left alone.
- **`reject_leave(p_request_id, p_reason text)`** — same authz; `status='rejected', decision_note=p_reason, decided_by/at`. **No attendance footprint** (D16).
- **`cancel_leave(p_request_id)`** — parent (`is_parent_of_student`); only while `status='pending'` → `'cancelled'`.
- `GRANT EXECUTE … TO authenticated;` on all four.

## 3. The excused trigger (prospective enforcement)

```sql
CREATE OR REPLACE FUNCTION public.enforce_excused_on_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leave_requests lr
    WHERE lr.student_id = NEW.student_id
      AND lr.status = 'approved'
      AND NEW.date BETWEEN lr.from_date AND lr.to_date
  ) THEN
    NEW.status := 'excused';        -- session_scope FULL_DAY covers all sessions
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_enforce_excused BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_excused_on_leave();
```
**Division of labor:** the trigger handles days marked **after** approval (any write path — the geo `mark_attendance` RPC,
direct edits, bulk); `approve_leave` handles days marked **before** approval. Together = `excused` regardless of order,
un-bypassable. `student_id` here is `student_profiles.id` (matches `attendance_records.student_id`).

## 4. Excused-exclusion sweep (the D8 correctness change — EVERY site)

`excused` = **neutral**: excluded from BOTH numerator and denominator (option A). Since no SQL computes %, these are the
exact app-code sites (add `status <> 'excused'` to the *total/denominator*; never count excused as present or absent):

| File | Where |
|---|---|
| `apps/mobile/lib/attendance.ts:106-128` | `fetchRecentStats` — `agg.total += 1` counts every row → exclude `excused` from total |
| `apps/web/app/(school)/admin/dashboard/page.tsx:101-109` | today present/absent/total (present+absent only; ensure excused not lumped into absent) |
| `apps/web/app/(school)/principal/dashboard/page.tsx:76-131` | weekly `present/dayRecords.length` + per-class `entry.total++` → exclude excused from length/total |
| `apps/web/app/(school)/teacher/dashboard/page.tsx:85-111` | today + per-section weekly totals include all rows → exclude |
| `apps/web/app/(school)/admin/students/[id]/student-attendance-tab.tsx:29-56` | pct (`total=rows.length`) **and** calendar cell colouring — add an `excused` colour + drop from pct |
| charts (`*attendance-chart.tsx`) | presentational (props) — only add an `excused` legend colour if shown |

`admin/reports/page.tsx:30-34` is a raw row count (no %) — unaffected. **Risk/insights:** greenfield (no `packages/insights`);
the "skip excused" rule is written into the Insights engine when built — nothing to retrofit.

## 5. RLS (mirror `homework_status`)

`ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;` — one **SELECT** policy, **no write policies** (deny-by-default; all writes via the RPCs):
```sql
CREATE POLICY leave_requests_select ON public.leave_requests FOR SELECT USING (
  public.get_my_role() = 'super_admin'
  OR (school_id = public.get_my_school_id() AND (
        public.get_my_role() IN ('school_admin','principal')          -- school-wide
     OR public.teaches_student(student_id)                            -- the section's teacher
     OR EXISTS (SELECT 1 FROM public.student_profiles sp              -- the parent
                WHERE sp.id = leave_requests.student_id AND sp.parent_profile_id = auth.uid())
  )));
```

## 6. Notifications (single-recipient — mirror `send-attendance-notification`, NOT the fan-out)

Edge fn **`leave-notify`** (JWT-authed, re-validates, service-role insert): after `request_leave` the client invokes it with
`{leave_id, event:'requested'}` → resolve the section's **class teacher** (`student → student_enrollments(active year) →
section_id → section_assignments.class_teacher_id`, exactly the `send-attendance-notification:72-82` path) → insert a
`notifications` row (`type='leave_requested'`) + `sendExpoPush` if `push_token`. After approve/reject → `{event:'decided'}`
notifies the **parent** (`student_profiles.parent_profile_id`). One insert, not a loop (`send-attendance-notification:150-203`
is the template; the homework fan-out is NOT).

## 7. Surfaces (mockups → build targets)

- **Parent (mobile)** `leave-parent-mobile.html` — apply form (`from/to`, type chips, note → `request_leave`) + "My requests"
  status list (reads `leave_requests` for the child). Parent write precedent: `apps/mobile/app/(parent)/homework/[homeworkId].tsx:54` (`markDone` RPC).
- **Approver (web, role-aware)** `leave-approver-web.html` — under `apps/web/app/(school)/…/leave/`; a *teacher* route sees
  their sections (`teaches_student` via RLS), *admin/principal* routes see school-wide. Approve/reject → RPCs. Nav item added to `nav-config.ts` for teacher + admin + principal.
- **Approver (mobile, teacher)** `leave-approver-mobile.html` — teacher leave inbox tab; approve/reject cards.
- **Badge tie-in** (web + mobile attendance marking): students with an approved leave for the date render a locked
  **"On leave · Excused"** badge (query approved `leave_requests` for the section+date). Read-only reflection of the trigger.
- **Teachers use BOTH web + mobile** — the approver surface exists on both (memory: teacher-web-and-mobile).

## 8. Edge cases
1. Retroactive leave over an already-marked "absent" day → `approve_leave` flips it to `excused` (backfill). ✔
2. Day marked *after* approval → trigger flips to `excused`. ✔
3. Overlapping request → `request_leave` raises `overlapping_leave` (pending/approved only; a rejected/cancelled one doesn't block). ✔
4. Approved leave is **final** in v1 — no revoke/un-excuse (deferred; un-excusing raises "back to what status?"). ✔
5. `excused` day must never count present or absent anywhere (§4) — else % is subtly wrong.
6. Parent cancels a pending request → `cancelled`, no effect. Cannot cancel once approved.
7. Half-day (FN/AN) leave deferred — `session_scope` enum has room; trigger currently excuses all sessions on covered dates.
8. No attachment/doctor-note upload in v1.
9. Leave feature flag `leave` (F1 registry) gates the nav + RPCs once F1 lands; until then the RPCs are live and ungated.
10. Student on leave with NO attendance marked those days → no rows, nothing to excuse, not counted — correct (no calendar needed).
