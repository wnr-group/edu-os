# ERP-68 Geo-Attendance — Final QA Verification Report

**Date:** 2026-07-29
**Branch:** `feat/geo-attendance-backend`
**Ticket:** ERP-68 (Geo-aware attendance: multi-campus geofencing, mobile advisory, off-campus/no-GPS flag review)
**Verdict:** **IN PROGRESS** (see Final Verdict below)

---

## Executive Summary

ERP-68 adds geofence-aware attendance to the ERP: school admins define one or more campus geofences on the web, the mobile app shows teachers a non-blocking on-campus/off-campus advisory when marking attendance, the `mark_attendance` RPC classifies every submission's `geo_status` (`inside` / `outside` / `no_gps` / `not_captured`) and persists captured coordinates, and principals review flagged (`outside`/`no_gps`) submissions on a dedicated Geo Review page with a live navigation badge. Tasks 1–10 of this verification plan exercised all 12 acceptance criteria end-to-end against the real running application (Docker Supabase, real Auth OTP-minted JWTs, real RPC calls, real UI via Playwright), rather than relying on source review alone, and additionally ran a 6-point regression pass to confirm no pre-existing functionality broke.

Ten of twelve ACs are fully PASS with runtime, database, network, and/or UI evidence. Three ACs (AC-7, AC-8, AC-12) split into a backend component — which is fully PASS with RPC/DB evidence — and a mobile on-device UI component that could not be exercised in this environment because no physical device or Expo simulator was available. One ticket-wording/mockup conflict was found and resolved in AC-10's favor of the approved mockup (reviewed rows stay visible at reduced opacity rather than being removed), consistent with this plan's Global Constraints. The regression suite (type-checks, non-geo attendance CRUD, geofence baseline integrity, RLS enforcement, navigation rendering) passed all 6 checks with no regressions. Because the Final Rule requires every AC to have complete runtime evidence with no gaps before a DONE verdict is permitted, and three ACs still carry an explicit "NOT VERIFIABLE IN THIS ENVIRONMENT" mobile-UI gap, this ticket is marked **IN PROGRESS**, pending a device/simulator-equipped tester executing the documented manual steps.

---

## AC Completion Table

| AC | Description | Verdict | Evidence |
|----|--------------|---------|----------|
| AC-1 | Multi-campus support (create multiple geofences) | **PASS** | `evidence/erp68/ac1-ac2/VERDICT.md`, `00-baseline.txt`, `02-campus-a-created.png`, `03-campus-b-created.png` |
| AC-2 | Full CRUD on geofences (create/read/update/delete + persistence across reload) | **PASS** | `evidence/erp68/ac1-ac2/VERDICT.md`, `04-switched-to-a.png`–`11-final-state.txt` |
| AC-3 | Drag center marker / drag radius handle on map | **PASS** | `evidence/erp68/ac3-ac4-ac5/VERDICT.md`, `01-created.txt`–`06-after-drag-save.txt` |
| AC-4 | Manual latitude/longitude edit updates marker + persists | **PASS** (UX caveat noted — no auto-pan on manual edit; state/DB binding itself is correct, see Deviations in the AC-3/4/5 verdict) | `evidence/erp68/ac3-ac4-ac5/VERDICT.md`, `07-after-manual-latlng.png`, `10-final-persisted.txt` |
| AC-5 | Radius slider ↔ textbox two-way sync, persists across reload | **PASS** | `evidence/erp68/ac3-ac4-ac5/VERDICT.md`, `08-slider-to-textbox.png`, `09-textbox-to-slider.png`, `11-after-reload.png` |
| AC-6 | Web attendance submission sends `geo_source="web"` with null coordinates; RPC/DB classify as `not_captured` | **PASS** | `evidence/erp68/ac6/VERDICT.md`, `01-network-capture.json`, `02-db-state.txt` |
| AC-7 | Off-campus submission: RPC computes `geo_status='outside'` + distance; mobile shows amber advisory / FLAGGED chip / warning banner / "Submit (off-campus)" button | **Backend: PASS.** **Mobile UI: NOT VERIFIABLE IN THIS ENVIRONMENT** | Backend — `evidence/erp68/ac7/VERDICT.md`, `01-rpc-response.txt`, `02-db-state.txt`. Mobile UI — no device/simulator available; missing evidence is on-screen rendering of the amber card/chip/banner/button described in `evidence/erp68/ac7/VERDICT.md` |
| AC-8 | No-GPS submission: RPC computes `geo_status='no_gps'`, attendance never blocked; mobile shows permission-denial flow | **Backend: PASS.** **Mobile UI: NOT VERIFIABLE IN THIS ENVIRONMENT** | Backend — `evidence/erp68/ac8/VERDICT.md`, `01-rpc-response.txt`, `02-db-state.txt`. Mobile UI — no device/simulator available; missing evidence is the actual on-device location-permission-denied dialog and resulting submit flow |
| AC-9 | Geo Review list filters to only `outside`/`no_gps` groups (excludes on-campus/not-captured) | **PASS** | `evidence/erp68/ac9-ac10/VERDICT.md`, `00-precondition.txt`, `01-pending-list.png`, `02-all-statuses-today.txt` |
| AC-10 | "Mark reviewed" workflow updates review state, badge count decrements | **PASS** (ticket/mockup conflict resolved — see dedicated section below) | `evidence/erp68/ac9-ac10/VERDICT.md`, `03-after-review.png`, `04-reviewed-db-state.txt` |
| AC-11 | Navigation badge on "Geo Review" appears/increments on new flags, decrements/disappears when reviewed, fully absent at zero (not a "0") | **PASS** | `evidence/erp68/ac11/VERDICT.md`, `01-baseline-badge.png`/`01-baseline-dom.json`, `02-badge-appeared.png`/`02-badge-appeared-dom.json`, `03-badge-decreased*.png`, `04-badge-gone.png`/`04-badge-gone-dom.json` |
| AC-12 | Mobile app refetches geofences fresh on every app open/reopen (no stale cache) | **Code guarantee: PASS.** **Runtime: NOT VERIFIABLE IN THIS ENVIRONMENT** | Code — `evidence/erp68/ac12/VERDICT.md` (no `AsyncStorage` in `apps/mobile/lib/location.ts:71-81`; `getActiveGeofences` called inside mount `useEffect` with `[schoolId]` dep in `apps/mobile/app/(teacher)/attendance/[sectionId].tsx:64-92`). Runtime — `evidence/erp68/ac12/MANUAL-CHECKLIST.md` (unexecuted; requires physical device/simulator) |

**Split-row rule applied per the task brief:** for AC-7, AC-8, and AC-12 the backend/code component is reported separately from the mobile on-device component. Per the Final Rule, any row with a non-PASS component (including "NOT VERIFIABLE IN THIS ENVIRONMENT") keeps the overall ticket at **IN PROGRESS**, regardless of how many other rows are clean PASSes.

---

## Regression Verification Results

Source: `evidence/erp68/regression/VERDICT.md` (Task 10).

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Type-check `@erp/web` | **PASS** | `01-web-typecheck.txt` (`tsc --noEmit`, exit 0) |
| 2 | Type-check `@erp/mobile` | **PASS** | `02-mobile-typecheck.txt` (`tsc --noEmit`, exit 0) |
| 3 | Non-geo attendance mark (create) + update, Class 1-B | **PASS** | `03a`–`03i` screenshots, `03-console-logs.txt` (no console errors), `03-attendance-write-ok.txt` (count=42) |
| 4 | Main Campus geofence untouched (baseline integrity) | **PASS** | `04-main-campus-unchanged.txt` — byte-for-byte identical to Task 2's `ac1-ac2/00-baseline.txt` |
| 5 | RLS still blocks unassigned teacher (Kavitha Reddy) | **PASS** | `05-rls-still-blocks-unassigned-teacher.txt` (HTTP 400 `not_authorized`), `05b-rls-no-row-inserted.txt` (0 rows) |
| 6 | Navigation renders correctly (school_admin + principal, pre-existing items intact alongside new geo items) | **PASS** | `06a`–`06d` screenshots |

**Overall regression verdict: PASS — no regressions found.** All 6 checks confirm ERP-68 did not break type safety, the pre-existing non-geo attendance flow, the Main Campus geofence baseline, the RLS/authorization model, or navigation rendering for either role.

Note captured in the regression verdict: AC-12's manual checklist (`ac12/MANUAL-CHECKLIST.md`) was confirmed **not yet executed** — its result-recording table is blank — which is why check #4 (Main Campus baseline) required no restoration (the checklist's Step 2, which would have dropped the radius to 5m, never ran).

---

## Ticket/Mockup Conflict Resolution (AC-10)

The ticket's literal text states that a reviewed flag should be **"removed"** from the Geo Review list. The approved mockup, and the shipped implementation (`flag-review-list.tsx`, `g.reviewed && "opacity-60"`), instead keep the row **visible at reduced opacity** with a green "Reviewed · you" pill replacing the "Mark reviewed" button.

This was evaluated during Task 7 (AC-9/AC-10 verification) and resolved as follows: per this verification plan's Global Constraints, **the approved mockup takes precedence over the ticket's literal wording** when the two conflict. The runtime behavior was confirmed to match the mockup exactly — reviewing one flagged group does not remove it or affect sibling groups, the unreviewed-count banner and nav badge decrement correctly, and the DB (`geo_reviewed_at`/`geo_reviewed_by`) is stamped correctly. This is documented as a **resolved design decision**, not an open question or defect, and AC-10 is scored PASS on that basis.

---

## Final Verdict

```
IN PROGRESS

1. Missing implementation: none — the only code gap found (AC-7 mobile copy) was fixed in Task 1.
2. Missing evidence:
   - AC-7: on-device rendering of the amber advisory card / FLAGGED chip / warning banner / "Submit (off-campus)" button (backend RPC/DB/network evidence is complete, see evidence/erp68/ac7/VERDICT.md).
   - AC-8: on-device permission-denial flow and resulting UI state (backend RPC/DB evidence is complete, see evidence/erp68/ac8/VERDICT.md).
   - AC-12: on-device app-close/reopen geofence refresh (code-level no-cache guarantee confirmed, see evidence/erp68/ac12/VERDICT.md; runtime confirmation pending).
3. Exact steps required to reach DONE: hand a physical Android/iOS device or a running Expo simulator to a tester, then execute
   evidence/erp68/ac12/MANUAL-CHECKLIST.md (AC-12) and the equivalent on-device visual confirmation for AC-7/AC-8
   (stand outside/inside the geofence, or toggle location permission off, and screenshot the resulting screen),
   attaching the screenshots/video to this report's evidence folder and flipping the three split rows in the AC
   Completion Table above to PASS.
```

### Why IN PROGRESS and not DONE

Per the ticket's Final Rule, a ticket may only be marked DONE when every acceptance criterion has runtime, database, network, and regression evidence with no gaps. AC-1 through AC-6, AC-9, AC-10, and AC-11 meet that bar in full. AC-7, AC-8, and AC-12, however, each have a mobile-UI or on-device component explicitly marked "NOT VERIFIABLE IN THIS ENVIRONMENT" because no physical device or Expo simulator was available to this QA pass — all backend/RPC/database evidence for those three ACs is complete and PASS, but the on-screen/on-device half is an evidence gap, not a known defect. Per the split-row rule, any row with a non-PASS component keeps the ticket at IN PROGRESS regardless of how many other rows are clean.

### Next Steps to Reach DONE

1. Provision a physical Android or iOS device, or a running Expo simulator, with the mobile app (`pnpm --filter @erp/mobile dev`).
2. Execute `docs/superpowers/implementation-reports/evidence/erp68/ac12/MANUAL-CHECKLIST.md` step by step (modify geofence radius on web, force-close/reopen the app, confirm the advisory chip reflects the new boundary), filling in the checklist's Result Recording table and attaching screenshots.
3. Perform the equivalent on-device visual confirmation for AC-7 (stand or simulate a location outside the geofence, confirm the amber advisory card / FLAGGED chip / "Off-campus — attendance submission disabled" banner / orange "Submit (off-campus)" button render per `stitch-designs/eduos-v2/geo-attendance-mobile.html` lines 174-211) and AC-8 (toggle device location permission off, confirm the no-GPS advisory and that submission is not blocked).
4. Attach all resulting screenshots/video to `docs/superpowers/implementation-reports/evidence/erp68/ac7/`, `ac8/`, and `ac12/` respectively.
5. Update the three split rows in this report's AC Completion Table from "NOT VERIFIABLE IN THIS ENVIRONMENT" to PASS (or file defects if the on-device behavior does not match), and flip the Final Verdict to DONE.

---

## Evidence Index

All evidence referenced above lives under `docs/superpowers/implementation-reports/evidence/erp68/`:

- `ac1-ac2/` — AC-1, AC-2 (multi-campus CRUD)
- `ac3-ac4-ac5/` — AC-3, AC-4, AC-5 (map interactions)
- `ac6/` — AC-6 (web RPC network/DB)
- `ac7/` — AC-7 (outside-geofence backend; mobile UI gap)
- `ac8/` — AC-8 (no-GPS backend; mobile UI gap)
- `ac9-ac10/` — AC-9, AC-10 (Geo Review filter + reviewed workflow)
- `ac11/` — AC-11 (navigation badge)
- `ac12/` — AC-12 (code guarantee; runtime gap, `MANUAL-CHECKLIST.md` for the device tester)
- `regression/` — 6-point regression suite

Related prior report: `docs/superpowers/implementation-reports/2026-07-28-erp68-frontend-final-report.md` (frontend implementation status as of 2026-07-28, prior to this verification pass).
