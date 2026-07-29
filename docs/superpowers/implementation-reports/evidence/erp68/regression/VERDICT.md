# Regression Verification Verdict — ERP-68 Geo-Attendance (Task 10 / Step 4)

**Date tested:** 2026-07-29
**Environment:** `http://school1.lvh.me:3000`, Docker Supabase (`supabase_db_plan-2-supabase-auth`), branch `feat/geo-attendance-backend`
**Purpose:** Confirm the geo-attendance feature (ERP-68) introduced no regressions in pre-existing, non-geo functionality.

## Summary

| # | Check | Verdict |
|---|-------|---------|
| 1 | Type-check `@erp/web` | **PASS** |
| 2 | Type-check `@erp/mobile` | **PASS** |
| 3 | Non-geo attendance mark (create) + update, Class 1-B | **PASS** |
| 4 | Main Campus geofence untouched | **PASS** |
| 5 | RLS still blocks unassigned teacher (Kavitha Reddy) | **PASS** |
| 6 | Navigation renders correctly (school_admin + principal) | **PASS** |

**Overall: PASS — no regressions found.**

---

## 1–2. Type-checks

```
pnpm --filter @erp/web type-check     → tsc --noEmit → exit: 0
pnpm --filter @erp/mobile type-check  → tsc --noEmit → exit: 0
```

Both apps compile cleanly with zero type errors.

- Evidence: `01-web-typecheck.txt`, `02-mobile-typecheck.txt`

**Verdict: PASS**

---

## 3. Non-geo attendance submission and update (Class 1-B, section `...102`)

Logged in as **Priya Nair** (`9000000005`, OTP `123456`) via the real login form (phone step → OTP step → redirect), confirmed as the assigned teacher for section `cccccccc-0000-0000-0000-000000000102` per `timetable` (`teacher_id = aaaaaaaa-0000-0000-0000-000000000014`).

**Create path:**
- Navigated to `/teacher/attendance/mark?sectionId=cccccccc-0000-0000-0000-000000000102&date=<today>&session=FULL_DAY`
- Clicked "All Present", clicked "Save Attendance"
- Green toast **"Attendance saved successfully."** appeared, page redirected to `/teacher/attendance`

**Update path:**
- Reloaded the mark page for the same section/date/session
- Changed one student's status to "Absent"
- Clicked "Save Attendance" again
- Same success toast appeared again; DB confirms the `ON CONFLICT ... DO UPDATE` path fired (one row shows `status=absent`, rest `present`)

DB verification:
```sql
select count(*) from attendance_records where section_id = 'cccccccc-...-102' and date = current_date;
→ count = 42   (> 0, matches roster size for Class 1-B)
```

A follow-up save (toggling the same student back to present) was performed specifically to capture a clean viewport screenshot of the toast — `03i-toast-viewport-capture.png` shows the green "Attendance saved successfully." toast unambiguously. This is a third save cycle beyond the required create+update; it does not change the create/update verdict, only supplies clearer visual evidence. The final DB count (42) was re-queried after all three saves and still reflects `count > 0` as required.

- Evidence: `03a`–`03i` screenshots, `03-console-logs.txt` (no console errors), `03-attendance-write-ok.txt`

**Verdict: PASS** — both the create (first mark) and update (reload → change → save) flows work with no regression; the standard success toast fires on both.

---

## 4. Main Campus geofence untouched

```sql
select name, center_lat, center_lng, radius_m, is_active
from school_geofences where id = '00000000-0000-0000-0000-000000000001';

      name     |     center_lat      |     center_lng     | radius_m | is_active
 Main Campus   | 18.458076092395583  | 73.86580258135531  |   100    | t
```

This is byte-for-byte identical to the baseline captured in Task 2 Step 2 (`docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/00-baseline.txt`). No cleanup was required: Task 9's AC-12 manual checklist (`docs/superpowers/implementation-reports/evidence/erp68/ac12/MANUAL-CHECKLIST.md`) was never actually executed by a human tester (its result-recording table is entirely blank, and the "Runtime Confirmation" section is explicitly marked "NOT VERIFIABLE IN THIS ENVIRONMENT" — the AC-12 verdict was based on static code analysis only), so the radius was never dropped to 5m and no restoration was needed.

- Evidence: `04-main-campus-unchanged.txt`

**Verdict: PASS**

---

## 5. RLS still blocks a non-assigned teacher (Kavitha Reddy)

Preconditions confirmed: `timetable` for section `cccccccc-0000-0000-0000-000000000101` names only Priya Nair (`aaaaaaaa-...014`) as `teacher_id` on every row; `section_assignments` has no `class_teacher_id` row for this section either. Kavitha Reddy (`aaaaaaaa-0000-0000-0000-000000000016`, phone `9000000007`) is a `teacher` at the same school (`aaaaaaaa-0000-0000-0000-000000000001`) but has no authorization path to section `...101`.

Minted a real JWT for Kavitha via the Auth OTP endpoints (`/auth/v1/otp` → `/auth/v1/verify`, phone `+919000000007`, OTP `123456`), then called the real `mark_attendance` RPC **with the required `x-school-id`/`x-active-role` scope headers** (`x-school-id: aaaaaaaa-...001`, `x-active-role: teacher`) so the test exercises the actual `can_write_section_attendance` branch of the authorization check rather than an earlier "missing scope header" short-circuit (per the note in `mark_attendance.sql` lines 50–58, omitting these headers makes `get_my_role()`/`get_my_school_id()` return NULL, which would produce a `not_authorized` rejection for the wrong reason).

```
POST /rest/v1/rpc/mark_attendance  (as Kavitha, section ...101)
→ HTTP/1.1 400 Bad Request
→ {"code":"P0001","details":null,"hint":null,"message":"not_authorized"}
```

DB verification — no row was inserted:
```sql
select count(*) from attendance_records
where section_id='cccccccc-...-101' and date='<today>' and session='FULL_DAY'
  and marked_by='aaaaaaaa-0000-0000-0000-000000000016';
→ count = 0
```

This confirms `can_write_section_attendance` (and the surrounding hand-rolled authorization check in `mark_attendance`) continues to correctly reject a teacher with no assignment to the section — the previously-verified "mark_attendance security authorization fix" has not regressed.

- Evidence: `05-rls-still-blocks-unassigned-teacher.txt`, `05b-rls-no-row-inserted.txt`

**Verdict: PASS**

---

## 6. Navigation renders correctly (pre-existing items + new geo items)

Logged in as **Arjun Sharma** (school_admin, `9000000002`) and **Dr. Meena Iyer** (principal, `9000000003`), OTP `123456` for both.

**school_admin** — top bar: Dashboard, Students, Teachers, Classes, Timetable, More. Expanding "More" shows all pre-existing items grouped by category, with the new geo item alongside them:
- Academic: Subjects, Academics, Syllabus, Report Cards, Certificates
- Administration: Fees, Discipline, Fee Types, **Geo Attendance**, Reports
- Communication: Announcements, Gallery, Feedback
- System: Settings

**principal** — top bar: Dashboard, Announcements, More. Expanding "More":
- Academic: Certificates
- Administration: Discipline, **Geo Review**, Reports
- Communication: Feedback

All pre-existing nav items (Dashboard, Students, Teachers, Classes, Timetable, Fees, Discipline, Fee Types, Reports, Announcements, Gallery, Feedback, Settings, Certificates, Subjects, Academics, Syllabus, Report Cards) render intact, with no missing or broken items, alongside the new geo-attendance/geo-review entries. Both dashboards loaded their widgets (School Overview, Attendance Today, Weekly Attendance Trend, Discipline Incidents, Recent Announcements) without error.

- Evidence: `06a-nav-school-admin.png` (dashboard + collapsed top nav), `06b-nav-principal.png` (dashboard + collapsed top nav), `06c-nav-school-admin-more-expanded.png` (expanded "More" menu), `06d-nav-principal-more-expanded.png` (expanded "More" menu)

Note: the task brief asked for a single `06-nav-intact.png`; four screenshots were captured instead (both roles × collapsed/expanded nav state) to give complete, unambiguous coverage of "all pre-existing items intact alongside the new geo items" for both roles.

**Verdict: PASS**

---

## Evidence index

| File | Contents |
|---|---|
| `01-web-typecheck.txt` | `tsc --noEmit` for `@erp/web`, exit 0 |
| `02-mobile-typecheck.txt` | `tsc --noEmit` for `@erp/mobile`, exit 0 |
| `03a-logged-in-home.png` | Priya Nair logged in, home dashboard |
| `03b-mark-form-before-save.png` | Mark Attendance form for Class 1-B before first save |
| `03c-save-success-toast.png` | Page state right after first (create) save |
| `03d-attendance-list-after-first-save.png` | Attendance list page after redirect from first save |
| `03e-mark-form-reloaded.png` | Mark form reloaded (update path begins) |
| `03f-changed-first-student-absent.png` | First student toggled to Absent |
| `03g-update-save-success-toast.png` | Page state right after second (update) save |
| `03h-attendance-list-after-update.png` | Attendance list page after redirect from update save |
| `03i-toast-viewport-capture.png` | Clear viewport screenshot of the green "Attendance saved successfully." toast |
| `03-console-logs.txt` | Browser console/page-error log during the mark/update run (empty — no errors) |
| `03-attendance-write-ok.txt` | `select count(*) ... section ...102 ... = 42` |
| `04-main-campus-unchanged.txt` | Main Campus geofence row — radius_m=100, matches Task 2 baseline |
| `05-rls-still-blocks-unassigned-teacher.txt` | Kavitha's `mark_attendance` call → HTTP 400, `not_authorized` |
| `05b-rls-no-row-inserted.txt` | Confirms 0 rows inserted by Kavitha for section ...101 |
| `06a-nav-school-admin.png` | school_admin dashboard + top nav |
| `06b-nav-principal.png` | principal dashboard + top nav |
| `06c-nav-school-admin-more-expanded.png` | school_admin "More" dropdown expanded |
| `06d-nav-principal-more-expanded.png` | principal "More" dropdown expanded |
| `VERDICT.md` | This file |

---

## Conclusion

No regressions were found in any of the six checks. The geo-attendance feature (ERP-68) has been added without breaking:
- Type safety in either app
- The pre-existing non-geo attendance mark/update flow
- The pre-existing Main Campus geofence configuration
- The pre-existing RLS/authorization model for `mark_attendance` (unassigned teachers are still correctly blocked)
- The pre-existing navigation structure for school_admin and principal roles

**Task 10 regression verification: PASS.**
