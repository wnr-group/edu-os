# AC-11 Verdict — Navigation Badge (Geo Review)

**Date tested:** 2026-07-29
**Tester:** QA (Task 8, ERP-68 completion verification)
**Environment:** `http://school1.lvh.me:3000`, principal login (Dr. Meena Iyer, `9000000003`), Docker Supabase (`supabase_db_plan-2-supabase-auth`)

## Summary

**AC-11: PASS**

Both sub-cases were verified in this run:
- The **count-increases-then-decreases** sub-case (Step 4).
- The **badge-fully-disappears-at-zero** sub-case (Step 5) — the baseline was `0`, so this was directly testable, not merely inferred.

## Note on nav label

The task brief refers to the nav item as "Flag review"; the actual label rendered in the UI (`apps/web/lib/nav-config.ts:106`) is **"Geo Review"** (`href: /principal/attendance/geo-review`), under the "Administration" group inside the desktop "More" dropdown (not a top-level frequent item). This is a brief/UI naming mismatch, not a defect — all steps below were run against the real "Geo Review" item.

## Step 1 — Baseline

DB query (per brief, `attendance_records` unreviewed `outside`/`no_gps` groups, school-wide, last 60 days):
```
select count(distinct section_id::text||date::text||session) ... => 0
```
`BASELINE_COUNT = 0`.

Logged in as Dr. Meena Iyer (`9000000003` / `123456`) via the real phone → OTP login form. Opened the "More" dropdown on the principal dashboard: no amber dot on the "More" trigger, no numeric badge next to "Geo Review" (only its label span present — `01-baseline-dom.json` confirms `geoReviewBadgeSpanCount` reflects the label only, not a number). Screenshot: `01-baseline-badge.png`.

## Step 2 — Create a flagged record

Reused Task 5's RPC recipe with corrections needed for this environment:
- **Anon key**: the brief's JWT-style key was stale; the live `apps/web/.env.local` uses the new-format key `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`, used instead.
- **Scope headers**: `mark_attendance` (via `can_write_section_attendance`/`get_my_school_id`/`get_my_role`) requires `x-school-id` and `x-active-role` headers, set by `public.scope_pre_request()` (`supabase/migrations/20240001000038_scope_hook.sql`). The brief's bare curl omits these; added `x-school-id: aaaaaaaa-0000-0000-0000-000000000001` and `x-active-role: teacher`.
- **Student lookup**: the brief's `select id from students` does not match this schema (no `students` table). Used `select student_profile_id from student_enrollments where section_id = ... and is_active` instead, matching `attendance_records.student_id`'s actual FK target (`student_profiles`).

Minted a fresh teacher JWT for Priya Nair (`+919000000005`), called `mark_attendance` with `p_session=FULL_DAY`, `p_date=2026-07-29`, coordinates `(18.463076, 73.865803)`, `p_accuracy=12`, `p_geo_source=device`.

Result: `HTTP/1.1 204 No Content` (`02-rpc-response.txt`). DB confirms the new row: `geo_status='outside'`, `geo_distance_m≈455.96` (~456m past the fence), `geo_reviewed_at` NULL (`03-db-state-after-create.txt`). Confirmed no pre-existing `FULL_DAY` flagged rows existed in this section/window before creating this one, so it is uniquely identifiable on the review page.

Unreviewed count re-checked: `1` (baseline `0` + 1).

## Step 3 — Badge appears

Reloaded `http://school1.lvh.me:3000/` (same principal session, via saved storage state). Opened "More": the trigger now shows the amber dot indicator, and "Geo Review" shows a badge reading **`1`** (`BASELINE_COUNT + 1`). Confirmed both visually (`02-badge-appeared.png`) and via DOM read (`02-badge-appeared-dom.json`: `geoReviewSpanTexts: ["Geo Review", "1"]`, trigger `outerHTML` contains the `bg-[#F59E0B]` dot span).

**Verdict: PASS**

## Step 4 — Review the record, badge decreases

Navigated to `/principal/attendance/geo-review`. Exactly one row matched — Priya Nair · Class 1-A · Full day · Wed, 29 Jul · OFF-CAMPUS · "456 m past the fence" · GPS ±12m (`03a-review-page-before.png`). Clicked "Mark reviewed"; the row updated in place to a green "Reviewed · you" pill (`03b-review-page-after.png`). DB confirms the stamp: `geo_reviewed_at = 2026-07-29 11:39:36.259+00`, `geo_reviewed_by = aaaaaaaa-0000-0000-0000-000000000012` (Dr. Meena Iyer's `auth.users.id`) (`05-db-state-after-review.txt`). Unreviewed count re-checked via SQL: back to `0` (`= BASELINE_COUNT`).

Reloaded the layout (navigated to `/`, a fresh server render). Opened "More" again: no badge next to "Geo Review", no amber dot. Screenshots: `03-badge-decreased-closed.png` (trigger before opening, no dot) and `03-badge-decreased.png` (dropdown open, no badge).

**Verdict: PASS**

## Step 5 — Badge fully disappears at zero

Since `BASELINE_COUNT = 0`, this sub-case was directly testable (not inferred). Confirmed via:
- Screenshot `04-badge-gone.png` — pixel-identical layout to `01-baseline-badge.png`: "Geo Review" shows no badge element at all (not a "0"), "More" trigger has no dot.
- DOM inspection `04-badge-gone-dom.json`: `geoReviewSpanTexts: ["Geo Review"]` (only the label span — the numeric badge `<span>` from `top-bar.tsx`'s `{!!item.badge && <span>...}` is entirely absent from the DOM, not merely hidden or zero-valued), `moreTriggerHasDot: false`.

This confirms `withBadge()` (`apps/web/lib/nav-config.ts:120-127`, `if (count <= 0) return config;`) correctly omits the `badge` property at `count === 0`, and the consuming components (`top-bar.tsx` lines 55-57, 168-170) correctly render nothing (`!!item.badge` short-circuits) rather than a "0" badge.

**Verdict: PASS — badge-disappears-at-zero sub-case fully verified, not just inferred.**

## Step 6 — Cleanup

```
delete from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101'
  and date = '2026-07-29' and session = 'FULL_DAY' and geo_status = 'outside';
-- DELETE 1
select count(*) ... where section_id=... and date=... and session='FULL_DAY'; -- 0
```
Demo DB restored to its pre-test state for this section/date/session. No other records were touched.

## Evidence index

| File | Contents |
|---|---|
| `01-baseline-badge.png` | Principal dashboard, "More" open — no dot, no badge (baseline = 0) |
| `01-baseline-dom.json` | DOM read confirming baseline: no dot span, no numeric badge span |
| `02-rpc-response.txt` | `mark_attendance` RPC HTTP response (204) creating the FULL_DAY flagged row |
| `03-db-state-after-create.txt` | DB row for the new flagged record: `outside`, ~456m, unreviewed |
| `02-badge-appeared.png` | "More" open — dot visible, "Geo Review" badge = 1 |
| `02-badge-appeared-dom.json` | DOM read: `["Geo Review", "1"]`, dot span present in trigger HTML |
| `03a-review-page-before.png` | Geo Review page — single FULL_DAY row, active "Mark reviewed" button |
| `03b-review-page-after.png` | Same page after click — row shows "Reviewed · you" pill |
| `05-db-state-after-review.txt` | DB row post-review: `geo_reviewed_at`/`geo_reviewed_by` stamped |
| `03-badge-decreased-closed.png` | Reloaded layout, dropdown closed — no dot on trigger |
| `03-badge-decreased.png` | Reloaded layout, dropdown open — no badge (count back to baseline 0) |
| `04-badge-gone.png` | Same state, captured explicitly for the Step 5 zero-disappearance check |
| `04-badge-gone-dom.json` | DOM read confirming the badge `<span>` is absent from the DOM entirely, not a "0" |

## Notes / deviations from the brief (all non-defect, environment corrections)

1. Nav label is "Geo Review", not "Flag review" (brief wording only).
2. Anon key updated to the live `sb_publishable_...` key (brief's JWT-style key is stale for this environment).
3. Added required `x-school-id`/`x-active-role` headers to the `mark_attendance` curl call (needed by `scope_pre_request()`; same correction independently noted in the AC-9/AC-10 verdict).
4. Student lookup corrected to `student_enrollments.student_profile_id` (no `students` table in this schema; `attendance_records.student_id` FKs to `student_profiles`).

None of these affect the AC-11 verdict — they are recipe corrections needed to exercise the real running app, not application defects.
