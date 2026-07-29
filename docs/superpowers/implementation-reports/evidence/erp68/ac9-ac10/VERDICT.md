# AC-9 / AC-10 Verdict — Flag Review List & Reviewed Workflow

**Date tested:** 2026-07-29 (re-execution, after fix)
**Tester:** QA (Task 7, ERP-68 completion verification — re-run)
**Environment:** `http://school1.lvh.me:3000`, principal login (Dr. Meena Iyer, `9000000003`), Docker Supabase (`supabase_db_plan-2-supabase-auth`)

## Summary

**AC-9: PASS**
**AC-10: PASS** (UI matches the approved mockup's "stays visible, reduced opacity" behavior rather than the ticket's literal "removed" wording — call-out below, not a defect)

## Fix verified

`apps/web/lib/geo-attendance.ts`'s `fetchFlaggedGroups` previously tried to embed `profiles` via `!marked_by` / `!geo_reviewed_by` PostgREST hints, which fail with `PGRST200` because those columns FK to `auth.users`, not `public.profiles` (no direct relationship PostgREST can resolve). The fix removes the embeds, fetches the flag rows plain, then does a second `.from("profiles").select("id, full_name").in("id", [...])` query and merges `marker`/`reviewer` names client-side (lines 140–177 of the current file). Re-tested end-to-end through the real UI (not just source review this time) — the Geo Review page now renders correctly.

## Pre-condition re-establishment

The prior QA pass (before this fix) had already run this task's own Step 7 cleanup, deleting the Task 5/6 fixture rows even though AC-9/AC-10 had failed. Re-checking before this run found **zero** matching rows (`00-precondition.txt` recorded 0 rows on the first attempt). Per the brief ("do not fabricate fixtures here" — i.e. don't hand-insert rows via SQL), Task 5 and Task 6's actual documented flows were re-run to legitimately regenerate the fixtures:
- Minted a fresh teacher JWT for Priya Nair (`+919000000005`) via the real Auth OTP endpoints.
- Called the real `mark_attendance` RPC with `x-school-id`/`x-active-role` scope headers (required by `scope_pre_request`/the hand-rolled authorization check in `mark_attendance`; the task briefs' example curl commands omit these headers, which is why the first raw attempt returned `not_authorized` — corrected before re-running).
- FN/outside: coordinates `(18.463076, 73.865803)`, ~555m from Main Campus center → `geo_status='outside'`, `geo_distance_m≈455.96`. Confirmed via DB.
- AN/no_gps: `p_lat`/`p_lng`/`p_accuracy` all `null`, `p_geo_source='device'` → `geo_status='no_gps'`, captured coords all NULL. Confirmed via DB.

With fixtures regenerated, the precondition check was re-run and passed (see below). This is a one-time gap from the previous QA attempt's cleanup already having run against a broken build — it is not part of the fix or a new defect.

## Pre-condition check (Step 1) — PASS

`00-precondition.txt` (final, post-regeneration) confirms both fixtures existed before testing began:

| id | session | geo_status | geo_reviewed_at |
|---|---|---|---|
| a8c73733-f9c0-4bd9-a327-60928efbaa1b | FN | outside | NULL |
| e303c02b-30cb-426e-8754-0fdd97f1c7df | AN | no_gps | NULL |

## Step 2: Login + review page — PASS

Logged in as Dr. Meena Iyer (`9000000003`, OTP `123456`) via the real login form (phone step → OTP step → redirect). Navigated to `/principal/attendance/geo-review`.

The page rendered correctly (`01-pending-list.png`):
- Banner: "2 submissions to review this week"
- Filter chips: "All 2", "Off-campus 1", "No-GPS 1", "This week"
- Row 1: Priya Nair · Class 1-A · Afternoon · Wed, 29 Jul — **NO-GPS** badge, "Location unavailable at submit", active "Mark reviewed" button.
- Row 2: Priya Nair · Class 1-A · Forenoon · Wed, 29 Jul — **OFF-CAMPUS** badge, "456 m past the fence" (matches Task 5's `geo_distance_m≈455.96`), "GPS ±12m", active "Mark reviewed" button.
- Neither row has a mini-map element.
- Nav badge dot next to "More" visible and consistent with 2 unreviewed flags (no longer contradicts an empty list, as it did pre-fix).

## AC-9 — Filter excludes on-campus / not-captured records

**Verdict: PASS**

- The Geo Review page shows exactly 2 groups ("All 2"), matching the 2 `outside`/`no_gps` fixture rows and nothing else.
- `02-all-statuses-today.txt` (section `...101`, today): only `outside` (1) and `no_gps` (1) — no third status present in this section/date to test exclusion against directly, so I broadened the check school-wide over the last 60 days: **7171 rows have `geo_status IS NULL`** (feature-disabled/not-captured historical attendance) plus the 1 `outside` and 1 `no_gps` fixture. `fetchFlaggedGroups` covers the same 60-day window and same school (`sinceDate = today − 60 days`, no section filter) — if the `.in("geo_status", ["outside","no_gps"])` filter were not working, thousands of extra rows would appear. The page showed exactly 2, end-to-end, through the real UI and real query — not just verified in source.
- This confirms the filter works correctly in the running application, closing out the gap noted in the pre-fix attempt (where the query never executed at all due to the `PGRST200` defect).

## AC-10 — Reviewed workflow (stays visible, reduced opacity, not removed)

**Verdict: PASS**

Clicked "Mark reviewed" on the OFF-CAMPUS (`FN`) row. Screenshot `03-after-review.png` shows:
- The row **remains in the list**, now rendered at reduced opacity (grayed text/badges), confirming `g.reviewed && "opacity-60"` behavior.
- The action cell now shows a green **"Reviewed · you"** pill with a check icon, replacing the "Mark reviewed" button.
- The unreviewed-count banner updated from "2 submissions to review this week" to "1 submission to review this week".
- The NO-GPS (`AN`) row is **unaffected** — still shows its active "Mark reviewed" button, unchanged, in the same screenshot (no scrolling needed; both rows fit in view).

DB verification (`04-reviewed-db-state.txt`):
- FN row: `geo_reviewed_at = 2026-07-29 11:27:49.635+00` (non-null, recent), `geo_reviewed_by = aaaaaaaa-0000-0000-0000-000000000012` — confirmed to be Dr. Meena Iyer's `auth.users.id` (matched by phone `919000000003`).
- AN row: `geo_reviewed_at`/`geo_reviewed_by` still both NULL — reviewing one group did not touch the other, matching the UI observation.

**Ticket/mockup conflict (pre-existing, not a defect):** The ticket's literal wording says reviewed rows should be "removed" from the list; the approved mockup (and the implementation in `flag-review-list.tsx`) instead keeps the row visible at reduced opacity with a "Reviewed" pill. Per the plan's Global Constraints, the mockup takes precedence over the ticket's literal wording — this was already an intentional, resolved conflict prior to this QA pass, reconfirmed correct here, not a new finding.

## Cleanup (Step 7) — PASS

```
delete from attendance_records where section_id='cccccccc-0000-0000-0000-000000000101' and date='2026-07-29' and session in ('FN','AN');
-- DELETE 2
select count(*) ... -- count = 0
```
Demo DB restored to its pre-Task-5 state for this section/date.

## Evidence index

| File | Contents |
|---|---|
| `00-precondition.txt` | Pre-condition DB query (post fixture-regeneration) — both fixtures present, unreviewed |
| `01-pending-list.png` | Geo Review page as principal — both flagged rows render correctly, "Mark reviewed" active on both |
| `02-all-statuses-today.txt` | All `geo_status` values for section `...101` today (only outside/no_gps present) |
| `04-reviewed-db-state.txt` | DB state for FN and AN after reviewing FN — `geo_reviewed_at`/`geo_reviewed_by` set correctly on FN only |
| `03-after-review.png` | Page after clicking "Mark reviewed" on OFF-CAMPUS row — row stays visible at reduced opacity with "Reviewed · you" pill; NO-GPS row unaffected in the same screenshot |
| `BUG-fetchFlaggedGroups-postgrest-error.json` | **Historical** — raw PGRST200 error reproducing the pre-fix defect from the previous (failed) QA attempt. Retained for before/after record; no longer reproduces against the current `fetchFlaggedGroups` implementation. |
| `VERDICT.md` | This file |
