# ERP-68 Completion & Evidence-Based Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out ERP-68 by (a) fixing the single real code gap found during codebase analysis — the mobile off-campus submit banner/button text doesn't match the approved mockup — and (b) producing objective, runtime/database/network evidence for the twelve remaining Acceptance Criteria, all of which were found to already be implemented in code.

**Architecture:** One implementation task (a copy-only edit to the existing mobile attendance screen) followed by ten evidence-gathering QA tasks that exercise the real local stack — the already-running local Supabase Postgres/Auth/REST instance, the Next.js web app, and (where a physical device isn't available) the `mark_attendance` RPC invoked over genuine HTTP using a real teacher JWT obtained via the local Auth API's phone/OTP flow. A final task synthesizes every task's evidence into a single sign-off report and applies the ticket's DONE/IN PROGRESS rule.

**Tech Stack:** Next.js 16 / React 19 (`apps/web`), Expo/React Native (`apps/mobile`, code-only — no device/simulator is available in this environment), Supabase (local Docker: Postgres 17, GoTrue Auth, PostgREST), `docker exec` + `psql` for SQL evidence, `curl` for direct Auth/REST calls, the `webapp-testing` skill (Playwright) for browser-driven steps on the web app.

## Global Constraints

- **Codebase analysis already performed (see table below) — do not re-derive it.** Of the 12 remaining ACs, 11 are already fully implemented and match the approved mockups (`stitch-designs/eduos-v2/geo-attendance-web.html`, `stitch-designs/eduos-v2/geo-attendance-mobile.html`). Only AC-7's mobile copy is wrong. **Do not modify any other file.**
- **`mark_attendance` RPC exists and is live.** `supabase/migrations/20240001000065_mark_attendance.sql` defines `feature_enabled()` and `mark_attendance()` and is already applied to the running local Postgres (confirmed via `\df public.mark_attendance` against the live DB). **This migration file is currently untracked in git** (`git status` shows `?? supabase/migrations/20240001000065_mark_attendance.sql`) — Task 1 stages it so the already-verified security fix doesn't silently disappear from version control. Do not edit its contents; it is correct as-is and is explicitly out of scope to change.
- **The approved mockup wins when it conflicts with the ticket's prose.** Confirmed conflict: AC-10 says "Record removed from pending list," but the approved web mockup (`geo-attendance-web.html:253`) shows the exact opposite — a reviewed row stays visible at `opacity:.6` with a "Reviewed · you" pill, never removed. The current code (`flag-review-list.tsx`) already matches the mockup exactly. Task 8 verifies against the mockup, not the ticket's literal wording, and the final report calls this out explicitly rather than silently marking it FAIL.
- **Local environment facts (verified live, reused verbatim in every task below — do not re-derive):**
  - Local Supabase: `docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "..."` runs SQL directly (bare `psql`/`supabase db execute` aren't usable — not linked to a remote project). API at `http://127.0.0.1:54321`. Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0` (standard public Supabase CLI local-dev demo key, safe to hardcode in test scripts).
  - Web app: `pnpm --filter @erp/web dev` serves on port 3000. Tenant resolution is host-based (`apps/web/app/(auth)/login/page.tsx` reads the `host` header) — the Demo School's `domain` column is `school1.lvh.me`, which is a public wildcard DNS entry that resolves to `127.0.0.1`. **Every web URL in this plan is `http://school1.lvh.me:3000/...`**, not `localhost:3000`. If `school1.lvh.me` doesn't resolve in the execution environment, add `127.0.0.1 school1.lvh.me` to the hosts file before starting.
  - Login flow: phone (10 digits, no `+91` prefix, form prepends it) → OTP step → OTP is always `123456` for every seeded user (`config.toml` `test_otp` mapping, confirmed in `supabase/seed.sql:45`).
  - Demo School: `school_id = aaaaaaaa-0000-0000-0000-000000000001`, `attendance_geo` feature flag ON.
  - Existing geofence: `Main Campus`, `id = 00000000-0000-0000-0000-000000000001`, center `(18.458076092395583, 73.86580258135531)`, `radius_m = 100`, `is_active = true`. **Do not delete or edit this row** — other tasks and the existing demo state depend on it existing; QA tasks create their own throw-away geofences instead.
  - Section under test: Class 1 - A, `section_id = cccccccc-0000-0000-0000-000000000101`, `academic_year_id = aaaaaaaa-0000-0000-0000-000000000002` (status `active`).
  - Users (`user_id` / phone / role): school_admin Arjun Sharma `aaaaaaaa-0000-0000-0000-000000000011` / `9000000002`; principal Dr. Meena Iyer `aaaaaaaa-0000-0000-0000-000000000012` / `9000000003`; teacher Priya Nair `aaaaaaaa-0000-0000-0000-000000000014` / `9000000005` — **Priya Nair is the `class_teacher_id` for section `...101`**, confirmed via `section_assignments`, so she is the only teacher who passes `can_write_section_attendance('cccccccc-0000-0000-0000-000000000101')` for this section without extra setup.
  - A student in that section exists at `student_id`, resolved fresh in Task 4/5/6 via SQL (roster membership isn't hardcoded here since it's a straightforward one-line lookup each task already includes).
- **No physical mobile device or Expo simulator is available in this environment.** For AC-7 and AC-8, the *backend* half (RPC authorization, `geo_status` computation, column persistence) is fully verifiable with real HTTP requests (mint a genuine teacher JWT via the local Auth API's phone/OTP endpoints with `curl`, then call the real PostgREST `rpc/mark_attendance` endpoint — this is the exact HTTP call the mobile app's `supabase.rpc(...)` makes under the hood, just issued directly). The *mobile UI* half (chip/banner/button rendering on an actual RN screen) cannot be captured here; Tasks 5, 6, and 9 say so explicitly rather than fabricating screenshots, and the final report marks that sub-slice "NOT VERIFIABLE IN THIS ENVIRONMENT" rather than PASS or silently omitting it.
- **Evidence artifacts** (screenshots, raw SQL output, raw HTTP responses) are saved under `docs/superpowers/implementation-reports/evidence/erp68/` (created in Task 2 Step 1), one subfolder per task, and referenced by relative path from the final report (Task 11).
- **Regression-safety:** every QA task that creates data cleans it up at the end (delete the throwaway geofence/records it created) so the local demo DB returns to its pre-existing state, except the two flagged attendance records intentionally created in Tasks 5 and 6, which Task 7 consumes — those are cleaned up at the end of Task 7 instead.

---

## Codebase Analysis (Step 1)

| Requirement | Already Exists | Evidence | Files | Needs Change | Risk |
|---|---|---|---|---|---|
| AC-1 Multi-campus CRUD | Yes | `fetchAllGeofences`/`upsertGeofence`/`deleteGeofence`; `addCampus`/`selectGeofence`/`saveDraft`/`removeCampus` with toasts + `confirm()` guard | `apps/web/lib/geo-attendance.ts:49-73`, `apps/web/app/(school)/admin/settings/geo-attendance/geofence-setup-client.tsx` | No | None — do not modify |
| AC-2 Runtime CRUD verification | Not yet executed | — | — | Execute (Task 2) | Low, local demo data only |
| AC-3 Marker drag | Yes | Center marker + radius-handle marker both `draggable`, `dragend` recomputes lat/lng or radius via Haversine | `apps/web/app/(school)/admin/settings/geo-attendance/geofence-map.tsx` | No | None |
| AC-4 Manual lat/lng | Yes | Number inputs bound directly to `draft.center_lat`/`center_lng`, which are the same props the map marker consumes | `geofence-setup-client.tsx` | No | None |
| AC-5 Radius sync | Yes | `<input type="range">` and `<input type="number">` both write `draft.radius_m` | `geofence-setup-client.tsx` | No | None |
| AC-6 Web attendance RPC | Yes | `handleSave()` calls `supabase.rpc("mark_attendance", { ..., p_geo_source: "web", p_lat: null, p_lng: null, p_accuracy: null })` | `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx:64-94` | No | None |
| AC-7 Outside geofence | **Partial** | `GeoAdvisoryChip` correctly renders amber/"FLAGGED" (matches mockup). But the submit-time banner text and button label do **not** match `geo-attendance-mobile.html:202,211` ("You're outside the campus geofence… tagged \"off-campus\"…" / "Submit (off-campus)") | `apps/mobile/app/(teacher)/attendance/[sectionId].tsx:300-317` | **Yes — Task 1** | Low: copy/label-only change, no logic touched |
| AC-8 No-GPS backend | Yes | `mark_attendance` sets `geo_status='no_gps'` when `p_geo_source='device'` and lat/lng are NULL | `supabase/migrations/20240001000065_mark_attendance.sql:75-117` | No | None |
| AC-9 Flag review | Yes | `fetchFlaggedGroups` filters `.in("geo_status",["outside","no_gps"])` server-side; each row shows distance/accuracy/review button; no map element anywhere in the file | `apps/web/lib/geo-attendance.ts:140-151`, `apps/web/app/(school)/admin/settings/geo-attendance/flag-review-list.tsx` | No | None |
| AC-10 Reviewed workflow | Yes, **matches mockup** (not literal ticket text — see Global Constraints) | `markGroupReviewed` sets `geo_reviewed_at`/`geo_reviewed_by`; UI keeps the row visible at `opacity-60` with a "Reviewed" pill, exactly per `geo-attendance-web.html:253-257` | `geo-attendance.ts:153-159`, `flag-review-list.tsx:51-58,97,123-126` | No | None — flag ticket/mockup conflict in report |
| AC-11 Navigation badge | Yes | `fetchUnreviewedFlagGroupCount` runs fresh on every layout render (no cache/memoization); `withBadge()` no-ops when count is 0 | `geo-attendance.ts:161-172`, `apps/web/app/(school)/layout.tsx:174-178`, `apps/web/lib/nav-config.ts:120-127` | No | None |
| AC-12 Mobile geofence refresh | Yes in code | `getActiveGeofences` has no cache (no AsyncStorage, no module-level memo); called in a `useEffect([schoolId])` on every mount | `apps/mobile/lib/location.ts`, `apps/mobile/app/(teacher)/attendance/[sectionId].tsx:64-92` | No | None — runtime confirmation still needed since it's a plain mount effect, not `useFocusEffect` (Task 9) |

---

## File Structure

- Modify: `apps/mobile/app/(teacher)/attendance/[sectionId].tsx` (Task 1 — copy/label only)
- Stage (no content change): `supabase/migrations/20240001000065_mark_attendance.sql` (Task 1 — currently untracked)
- Create: `docs/superpowers/implementation-reports/evidence/erp68/` (Task 2 — evidence artifacts for Tasks 2-10)
- Create: `docs/superpowers/implementation-reports/2026-07-29-erp68-verification-report.md` (Task 11 — final sign-off)

---

### Task 1: Fix mobile off-campus copy to match the approved mockup, and commit the untracked RPC migration

**Files:**
- Modify: `apps/mobile/app/(teacher)/attendance/[sectionId].tsx:300-317`
- Stage: `supabase/migrations/20240001000065_mark_attendance.sql`

**Interfaces:**
- Consumes: existing `isOffCampus` boolean state (already computed at `[sectionId].tsx:85`, `:140`), existing `theme.warning` token, existing `PrimaryButton` component (`style` prop already supported, no change needed there).
- Produces: nothing consumed by later tasks — this is a leaf UI fix. Task 5's backend RPC evidence does not depend on this task (it exercises the RPC directly over HTTP, not through this screen).

- [ ] **Step 1: Stage the untracked RPC migration (housekeeping — zero content change)**

Run:
```bash
git add supabase/migrations/20240001000065_mark_attendance.sql
git status
```
Expected: the file moves from `??` (untracked) to staged (`A  supabase/migrations/20240001000065_mark_attendance.sql`). Do not open or edit this file — it is already correct and already applied to the local DB.

- [ ] **Step 2: Read the current bottom action-bar block**

The relevant block is `apps/mobile/app/(teacher)/attendance/[sectionId].tsx:300-317`:
```tsx
        {!loading && rows.length > 0 && (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border }}>
            {isOffCampus && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.warning + "1A", borderRadius: 8 }}>
                <Ionicons name="flag" size={16} color={theme.warning} />
                <Text style={{ fontSize: 12, color: theme.warning, fontFamily: "Inter_500Medium", flex: 1 }}>
                  Staff member is off-campus. Attendance will be flagged for review.
                </Text>
              </View>
            )}
            <PrimaryButton
              label={marked ? "Update Attendance" : `Submit · ${markedCount}/${rows.length} marked`}
              onPress={submit}
              loading={saving}
              style={isOffCampus ? { backgroundColor: theme.warning, opacity: 0.9 } : undefined}
            />
          </View>
        )}
```
The approved mockup (`stitch-designs/eduos-v2/geo-attendance-mobile.html:202,211`) specifies:
- Banner copy: *"You're outside the campus geofence. Marking still works — this submission is tagged "off-campus" and shows up in the principal's review list. No reason needed."*
- Button label: *"Submit (off-campus)"*
- A hint line under the button: *"Saved & flagged · principal can review later"*

- [ ] **Step 3: Replace the block with mockup-matching copy**

Edit `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`, replacing lines 300-317 with:
```tsx
        {!loading && rows.length > 0 && (
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: theme.background, borderTopWidth: 1, borderTopColor: theme.border }}>
            {isOffCampus && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.warning + "1A", borderRadius: 8 }}>
                <Ionicons name="flag" size={16} color={theme.warning} />
                <Text style={{ fontSize: 12, color: theme.warning, fontFamily: "Inter_500Medium", flex: 1 }}>
                  You're outside the campus geofence. Marking still works — this submission is tagged "off-campus" and shows up in the principal's review list. No reason needed.
                </Text>
              </View>
            )}
            <PrimaryButton
              label={isOffCampus ? "Submit (off-campus)" : marked ? "Update Attendance" : `Submit · ${markedCount}/${rows.length} marked`}
              onPress={submit}
              loading={saving}
              style={isOffCampus ? { backgroundColor: theme.warning, opacity: 0.9 } : undefined}
            />
            {isOffCampus && (
              <Text style={{ textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textMuted, marginTop: 8 }}>
                Saved &amp; flagged · principal can review later
              </Text>
            )}
          </View>
        )}
```
Nothing else in the file changes — `isOffCampus`, `marked`, `markedCount`, `theme`, `PrimaryButton` all already exist exactly as used here.

- [ ] **Step 4: Run type-check**

Run: `pnpm --filter @erp/mobile type-check`
Expected: exits 0, no errors (only string literals and a conditional expression changed — no new types introduced).

- [ ] **Step 5: Diff against the mockup text verbatim**

Run:
```bash
grep -n "You're outside the campus geofence" apps/mobile/app/\(teacher\)/attendance/\[sectionId\].tsx
grep -n "Submit (off-campus)" apps/mobile/app/\(teacher\)/attendance/\[sectionId\].tsx
grep -n "Saved &amp; flagged" apps/mobile/app/\(teacher\)/attendance/\[sectionId\].tsx
```
Expected: all three greps return exactly one match each, confirming the new copy is present and matches the mockup's wording.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/(teacher)/attendance/[sectionId].tsx" supabase/migrations/20240001000065_mark_attendance.sql
git commit -m "fix(mobile): match off-campus submit copy to approved mockup, track mark_attendance migration"
```

---

### Task 2: QA — AC-1 & AC-2: multi-campus CRUD runtime verification

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/`.

**Interfaces:**
- Consumes: `school_admin` login (Arjun Sharma, phone `9000000002`, OTP `123456`), the geofence setup page at `http://school1.lvh.me:3000/admin/settings/geo-attendance`.
- Produces: two rows temporarily inserted into `school_geofences`, both deleted by Step 8 of this task; screenshots + SQL transcripts consumed by Task 11.

- [ ] **Step 1: Create the evidence folder and start the web app**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2
pnpm --filter @erp/web dev
```
Expected: `Ready in ...` on `http://localhost:3000` (bound to all interfaces, reachable via `school1.lvh.me:3000` too). Leave running in the background for this and all subsequent web-based tasks.

- [ ] **Step 2: Baseline SQL — confirm starting state**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select id, name, center_lat, center_lng, radius_m, is_active from school_geofences where school_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by created_at;" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/00-baseline.txt
cat docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/00-baseline.txt
```
Expected: exactly one row — `Main Campus`, `18.458076092395583`, `73.86580258135531`, `100`, `t`.

- [ ] **Step 3: Log in as school_admin and open the geofence setup page**

Using the `webapp-testing` skill, launch a browser at `http://school1.lvh.me:3000/login`, enter phone `9000000002`, submit, enter OTP `123456`, submit. Navigate to `http://school1.lvh.me:3000/admin/settings/geo-attendance`.
Expected: page renders with "Main Campus" as the only entry in the campus list (left column), matching Step 2's baseline. Save a screenshot to `.../ac1-ac2/01-initial-page.png`.

- [ ] **Step 4: Scenario 1 — create Campus A**

Click "Add campus". In the form, set:
- Campus name: `QA Campus A`
- Centre latitude: `18.4650`
- Centre longitude: `73.8700`
- Radius: `150` (type into the numeric radius box)

Click "Save geofence".
Expected UI: a success toast ("Geofence saved. Edits apply to teacher marking on next open."); "QA Campus A" now appears in the campus list with `r = 150 m`, `18.4650, 73.8700`. Screenshot to `.../02-campus-a-created.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select id, name, center_lat, center_lng, radius_m, is_active from school_geofences where school_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'QA Campus A';" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/02-campus-a.txt
```
Expected: one row, `center_lat=18.465`, `center_lng=73.87`, `radius_m=150`, `is_active=t`. Record the generated `id` (call it `$CAMPUS_A_ID`) for Step 7.

- [ ] **Step 5: Scenario 2 — create Campus B**

Click "Add another campus". Set:
- Campus name: `QA Campus B`
- Centre latitude: `18.4500`
- Centre longitude: `73.8600`
- Radius: `250`

Click "Save geofence".
Expected UI: success toast; both "QA Campus A" and "QA Campus B" now listed. Screenshot to `.../03-campus-b-created.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select id, name, center_lat, center_lng, radius_m from school_geofences where school_id = 'aaaaaaaa-0000-0000-0000-000000000001' and name = 'QA Campus B';" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/03-campus-b.txt
```
Expected: one row, `center_lat=18.45`, `center_lng=73.86`, `radius_m=250`. Record the generated `id` as `$CAMPUS_B_ID`.

- [ ] **Step 6: Scenario 3 — switch active campus**

Click "QA Campus A" in the list. Expected: the form/map area now shows name `QA Campus A`, latitude `18.465`, longitude `73.87`, radius `150` (both slider and textbox). Screenshot `.../04-switched-to-a.png`.
Click "QA Campus B" in the list. Expected: form/map area now shows name `QA Campus B`, latitude `18.45`, longitude `73.86`, radius `250`. Screenshot `.../05-switched-to-b.png`.
This confirms switching loads the correct campus's coordinates and radius each time (no stale state carried over from the previous selection).

- [ ] **Step 7: Scenario 4 — update Campus B**

With Campus B still selected, change:
- Campus name: `QA Campus B (Updated)`
- Radius: `300`

Click "Save geofence".
Expected UI: success toast; list entry now reads "QA Campus B (Updated)", `r = 300 m`. Screenshot `.../06-campus-b-updated.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select name, radius_m from school_geofences where id = '$CAMPUS_B_ID';" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/07-campus-b-after-update.txt
```
Expected: `name = QA Campus B (Updated)`, `radius_m = 300` — same row `id`, values changed (proves update, not a duplicate insert).

- [ ] **Step 8: Scenario 5 — delete Campus A**

Click "QA Campus A" in the list to select it, click the trash icon, confirm the browser `confirm()` dialog.
Expected UI: toast "Geofence deleted."; "QA Campus A" no longer in the list; the selection falls back to another existing campus. Screenshot `.../08-campus-a-deleted.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from school_geofences where id = '$CAMPUS_A_ID';" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/09-campus-a-gone.txt
```
Expected: `count = 0`.

- [ ] **Step 9: Scenario 6 — reload and confirm persistence**

Full page reload (`http://school1.lvh.me:3000/admin/settings/geo-attendance`, hard refresh).
Expected UI: list shows exactly "Main Campus" and "QA Campus B (Updated)" — Campus A does not reappear. Screenshot `.../10-after-reload.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select name, radius_m from school_geofences where school_id = 'aaaaaaaa-0000-0000-0000-000000000001' order by created_at;" > docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/11-final-state.txt
```
Expected: exactly two rows — `Main Campus` (100) and `QA Campus B (Updated)` (300).

- [ ] **Step 10: Cleanup — delete the throwaway Campus B**

In the UI, select "QA Campus B (Updated)", click the trash icon, confirm.
Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from school_geofences where school_id = 'aaaaaaaa-0000-0000-0000-000000000001';" 
```
Expected: `count = 1` (only `Main Campus` remains — DB back to its pre-task state).

- [ ] **Step 11: Record the verdict**

Write a one-line PASS/FAIL note to `docs/superpowers/implementation-reports/evidence/erp68/ac1-ac2/VERDICT.md`: `AC-1: PASS. AC-2: PASS — all 6 scenarios matched expected UI + SQL, see 00-11 above.` (or FAIL with the specific mismatch) — this file is read directly by Task 11.

---

### Task 3: QA — AC-3, AC-4, AC-5: map interaction runtime verification

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5/`.

**Interfaces:**
- Consumes: same `school_admin` login and geofence setup page as Task 2 (independent — run standalone if Task 2 already logged out).
- Produces: one throwaway geofence, deleted at the end of this task.

- [ ] **Step 1: Setup**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5
```
Using the `webapp-testing` skill, log in as school_admin (`9000000002` / OTP `123456`) if not already, navigate to `http://school1.lvh.me:3000/admin/settings/geo-attendance`.

- [ ] **Step 2: Create a throwaway test geofence**

Click "Add campus". Set name `QA Map Test`, latitude `18.4600`, longitude `73.8650`, radius `200`. Click "Save geofence".
Expected: toast success; SQL confirms one row:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select id, center_lat, center_lng, radius_m from school_geofences where name = 'QA Map Test';" > docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5/01-created.txt
```
Record the returned `id` as `$MAP_TEST_ID` and note the starting `center_lat=18.46`, `center_lng=73.865`, `radius_m=200`.

- [ ] **Step 3 (AC-3): Drag the center marker**

Screenshot the map before dragging: `.../02-before-center-drag.png`. Note the current values shown in the Latitude/Longitude number inputs (`18.46`, `73.865`).
Using the `webapp-testing` skill's mouse controls, press down on the center marker icon (the indigo pin at the map's center), drag it roughly 40px to the right and 20px up within the map container, release.
Expected: the Latitude and Longitude number inputs both update to new values different from `18.46`/`73.865` (exact values depend on the pixel-to-geo projection at the current zoom level — the pass condition is "changed, and the circle overlay visibly re-centers on the new marker position," not a specific number). Screenshot after: `.../03-after-center-drag.png`. Note the new displayed lat/lng as `$DRAGGED_LAT` / `$DRAGGED_LNG`.

- [ ] **Step 4 (AC-3 continued): Drag the radius handle**

Screenshot before: `.../04-before-radius-drag.png`. Note the current radius shown in both the slider and the numeric radius box.
Drag the small circular handle marker (positioned due east of the center marker) outward (further from center) by roughly 30px, release.
Expected: the radius slider and the numeric radius textbox both update to a larger value than before the drag; the dashed circle overlay visibly grows to match. Screenshot after: `.../05-after-radius-drag.png`. Note the new radius as `$DRAGGED_RADIUS`.

- [ ] **Step 5 (AC-3 continued): Save and verify in the database**

Click "Save geofence".
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select center_lat, center_lng, radius_m from school_geofences where id = '$MAP_TEST_ID';" > docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5/06-after-drag-save.txt
```
Expected: the row's `center_lat`/`center_lng`/`radius_m` equal (within normal floating-point display rounding) `$DRAGGED_LAT`/`$DRAGGED_LNG`/`$DRAGGED_RADIUS` from Steps 3-4 — i.e. exactly what the UI displayed persisted, and none of the three equal the Step 2 starting values.

- [ ] **Step 6 (AC-4): Manual latitude/longitude edit**

In the Latitude input, clear and type `18.4700`. In the Longitude input, clear and type `73.8500`.
Expected: after each edit, the marker visibly moves on the map to the new position (screenshot `.../07-after-manual-latlng.png`), and the dashed circle recenters with it — confirmed visually, since this is a live-bound React state update (`draft.center_lat`/`center_lng` feed directly into the `Marker`/`Circle` `position`/`center` props).

- [ ] **Step 7 (AC-5): Radius slider ↔ textbox sync**

Drag the radius slider to a new position. Expected: the adjacent numeric textbox updates to match the slider's value immediately (screenshot `.../08-slider-to-textbox.png`).
Then clear the numeric textbox and type `750`. Expected: the slider thumb moves to reflect `750` (capped visually at the slider's `max=5000`, but the textbox itself holds `750` exactly) (screenshot `.../09-textbox-to-slider.png`). Expected: the dashed circle overlay visibly grows/shrinks in both directions live, with no page reload.

- [ ] **Step 8: Save, reload, and verify final persistence**

Click "Save geofence". Full page reload.
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select center_lat, center_lng, radius_m from school_geofences where id = '$MAP_TEST_ID';" > docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5/10-final-persisted.txt
```
Expected: `center_lat=18.47`, `center_lng=73.85`, `radius_m=750` — matching Steps 6-7's final on-screen values exactly, and still present after the hard reload (screenshot `.../11-after-reload.png` showing "QA Map Test" selected with these exact values in the form).

- [ ] **Step 9: Cleanup**

Delete "QA Map Test" via the trash icon + confirm.
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from school_geofences where id = '$MAP_TEST_ID';"
```
Expected: `count = 0`.

- [ ] **Step 10: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac3-ac4-ac5/VERDICT.md` summarizing PASS/FAIL for AC-3, AC-4, AC-5 individually, referencing the screenshot/SQL filenames above.

---

### Task 4: QA — AC-6: web attendance RPC network verification

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac6/`.

**Interfaces:**
- Consumes: teacher login not required if using network capture on the existing marking page — but the marking page requires a teacher session, so log in as Priya Nair.
- Produces: one attendance row for section `cccccccc-0000-0000-0000-000000000101`, session `FULL_DAY`, today's date — left in place (it's a legitimate, non-flagged attendance record, not test pollution requiring cleanup; the section already regularly receives real attendance in this demo data).

- [ ] **Step 1: Setup**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac6
```
Get today's date in `YYYY-MM-DD`: `date +%F` (bash) — record the result as `$TODAY`.

- [ ] **Step 2: Log in as the teacher and open the marking form**

Using the `webapp-testing` skill, log in at `http://school1.lvh.me:3000/login` with phone `9000000005` (Priya Nair), OTP `123456`. Navigate to:
`http://school1.lvh.me:3000/teacher/attendance/mark?sectionId=cccccccc-0000-0000-0000-000000000101&date=$TODAY&session=FULL_DAY`

- [ ] **Step 3: Capture the network request while marking attendance**

Before clicking Save, arm network capture (the `webapp-testing` skill's request-logging capability) to record all outgoing requests. Mark at least one student "Present", click "Save".
Expected network evidence: a `POST` request to `http://127.0.0.1:54321/rest/v1/rpc/mark_attendance` (or the app's configured `NEXT_PUBLIC_SUPABASE_URL` equivalent), with a JSON body containing:
```json
{"p_section_id":"cccccccc-0000-0000-0000-000000000101","p_session":"FULL_DAY","p_date":"<$TODAY>","p_records":[{"student_id":"...","status":"present"}],"p_geo_source":"web","p_lat":null,"p_lng":null,"p_accuracy":null}
```
Save the captured request/response pair to `docs/superpowers/implementation-reports/evidence/erp68/ac6/01-network-capture.json`.
Expected UI: toast "Attendance saved successfully.", redirect to `/teacher/attendance`.

- [ ] **Step 4: Verify the database row**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select student_id, status, geo_status, captured_lat, captured_lng from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'FULL_DAY';" > docs/superpowers/implementation-reports/evidence/erp68/ac6/02-db-state.txt
```
(There is no persisted `geo_source` column — `supabase/migrations/20240001000063_geo_attendance_schema.sql:51-59` defines only `geo_status`, `geo_distance_m`, `gps_accuracy_m`, `captured_lat`, `captured_lng`, `matched_geofence_id`, `geo_reviewed_at`, `geo_reviewed_by`; the RPC's `p_geo_source` input is consumed only to pick the `geo_status` branch, not stored — confirmed above by omitting it from the SELECT.)
Expected: `status = present`, `geo_status = not_captured` (per the RPC's branch: `p_geo_source='web'` with null lat/lng is classified `not_captured`, not `no_gps`, since `no_gps` is reserved for `p_geo_source='device'`), `captured_lat`/`captured_lng` both NULL.

- [ ] **Step 5: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac6/VERDICT.md`: PASS if the captured request shows `p_geo_source: "web"` and the DB row shows `geo_status = not_captured` with null coordinates; FAIL with specifics otherwise.

---

### Task 5: QA — AC-7: outside-geofence flow (backend evidence via real HTTP RPC call)

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac7/`.

**Interfaces:**
- Consumes: local Auth API (`http://127.0.0.1:54321/auth/v1/otp` and `/verify`) to mint a real teacher JWT, then the real PostgREST RPC endpoint — this is the same HTTP call the mobile app's `supabase.rpc("mark_attendance", ...)` makes, issued directly since no device/simulator is available.
- Produces: one attendance row with `geo_status = 'outside'` for section `...101`, session `FN`, today — intentionally left flagged for Task 7 to review, cleaned up at the end of Task 7.

- [ ] **Step 1: Setup**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac7
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL="http://127.0.0.1:54321"
TODAY=$(date +%F)
```

- [ ] **Step 2: Mint a real teacher JWT for Priya Nair**

```bash
curl -s -X POST "$API_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005"}'
TEACHER_JWT=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005","token":"123456","type":"sms"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "$TEACHER_JWT" > docs/superpowers/implementation-reports/evidence/erp68/ac7/00-teacher-jwt.txt
```
Expected: `00-teacher-jwt.txt` contains a non-empty JWT string (three base64 segments separated by `.`).

- [ ] **Step 3: Look up a student in the section**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -t -c "select id from students where section_id = 'cccccccc-0000-0000-0000-000000000101' limit 1;"
```
Record the returned id as `$STUDENT_ID`.

- [ ] **Step 4: Call `mark_attendance` with coordinates ~600m outside Main Campus, `p_geo_source=device`**

Main Campus center is `(18.458076092395583, 73.86580258135531)`, radius 100m. A point at `(18.463076, 73.865803)` (≈0.005° north, ~555m) is outside it.

```bash
curl -s -X POST "$API_URL/rest/v1/rpc/mark_attendance" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TEACHER_JWT" -H "Content-Type: application/json" \
  -d "{\"p_section_id\":\"cccccccc-0000-0000-0000-000000000101\",\"p_session\":\"FN\",\"p_date\":\"$TODAY\",\"p_records\":[{\"student_id\":\"$STUDENT_ID\",\"status\":\"present\"}],\"p_lat\":18.463076,\"p_lng\":73.865803,\"p_accuracy\":12,\"p_geo_source\":\"device\"}" \
  -i > docs/superpowers/implementation-reports/evidence/erp68/ac7/01-rpc-response.txt
cat docs/superpowers/implementation-reports/evidence/erp68/ac7/01-rpc-response.txt
```
Expected: HTTP `200`/`204` (success — never blocked), no error body.

- [ ] **Step 5: Verify the database row**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select student_id, status, geo_status, captured_lat, captured_lng, gps_accuracy_m, geo_distance_m, matched_geofence_id from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'FN';" > docs/superpowers/implementation-reports/evidence/erp68/ac7/02-db-state.txt
cat docs/superpowers/implementation-reports/evidence/erp68/ac7/02-db-state.txt
```
Expected: `status = present`, `geo_status = outside`, `captured_lat = 18.463076`, `captured_lng = 73.865803`, `gps_accuracy_m = 12`, `geo_distance_m ≈ 455` (≈555m from center minus the 100m radius), `matched_geofence_id = '00000000-0000-0000-0000-000000000001'` (Main Campus).

- [ ] **Step 6: Record the verdict, with the mobile-UI caveat**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac7/VERDICT.md`:
```
AC-7 backend (RPC/network/DB): PASS — see 01-rpc-response.txt (HTTP 200, no error), 02-db-state.txt (geo_status=outside, geo_distance_m≈455, captured_lat/lng populated).
AC-7 mobile UI (amber advisory card, FLAGGED chip, warning banner, orange "Submit (off-campus)" button rendering on-device): NOT VERIFIABLE IN THIS ENVIRONMENT — no physical device or Expo simulator available. Task 1 already aligned the banner/button copy to the approved mockup and passed type-check; a human tester with a device/simulator must confirm the on-screen render matches `stitch-designs/eduos-v2/geo-attendance-mobile.html` lines 174-211 before this half can be marked PASS.
```

---

### Task 6: QA — AC-8: no-GPS backend verification (fresh runtime test)

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac8/`.

**Interfaces:**
- Consumes: same JWT-minting approach as Task 5 (independent — mints its own fresh token).
- Produces: one attendance row with `geo_status = 'no_gps'` for section `...101`, session `AN`, today — left flagged for Task 7, cleaned up there.

- [ ] **Step 1: Setup**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac8
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL="http://127.0.0.1:54321"
TODAY=$(date +%F)
```
This is a **fresh** test — do not reuse Task 5's JWT or session, and use session `AN` (Afternoon) so the `(student_id, date, session)` unique constraint doesn't collide with Task 5's `FN` row.

- [ ] **Step 2: Mint a fresh teacher JWT**

```bash
curl -s -X POST "$API_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005"}'
TEACHER_JWT=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005","token":"123456","type":"sms"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
echo "$TEACHER_JWT" > docs/superpowers/implementation-reports/evidence/erp68/ac8/00-teacher-jwt.txt
```

- [ ] **Step 3: Look up the same student**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -t -c "select id from students where section_id = 'cccccccc-0000-0000-0000-000000000101' limit 1;"
```
Record as `$STUDENT_ID` (same value as Task 5, since it's the same section).

- [ ] **Step 4: Call `mark_attendance` simulating a denied/unavailable GPS — `p_lat`/`p_lng`/`p_accuracy` all null, `p_geo_source=device`**

This is exactly what the mobile app's `getSubmitPosition()` produces when location permission is denied (`apps/mobile/lib/location.ts` — returns `null`, and `[sectionId].tsx`'s `submit()` passes `currentPos?.lat ?? null`, etc.):

```bash
curl -s -X POST "$API_URL/rest/v1/rpc/mark_attendance" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TEACHER_JWT" -H "Content-Type: application/json" \
  -d "{\"p_section_id\":\"cccccccc-0000-0000-0000-000000000101\",\"p_session\":\"AN\",\"p_date\":\"$TODAY\",\"p_records\":[{\"student_id\":\"$STUDENT_ID\",\"status\":\"present\"}],\"p_lat\":null,\"p_lng\":null,\"p_accuracy\":null,\"p_geo_source\":\"device\"}" \
  -i > docs/superpowers/implementation-reports/evidence/erp68/ac8/01-rpc-response.txt
cat docs/superpowers/implementation-reports/evidence/erp68/ac8/01-rpc-response.txt
```
Expected: HTTP `200`/`204` — attendance succeeds even with no GPS at all, never blocked.

- [ ] **Step 5: Verify the database row**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select student_id, status, geo_status, captured_lat, captured_lng, gps_accuracy_m from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'AN';" > docs/superpowers/implementation-reports/evidence/erp68/ac8/02-db-state.txt
cat docs/superpowers/implementation-reports/evidence/erp68/ac8/02-db-state.txt
```
Expected: `status = present`, `geo_status = no_gps`, `captured_lat = NULL`, `captured_lng = NULL`, `gps_accuracy_m = NULL`.

- [ ] **Step 6: Record the verdict, with the mobile-UI caveat**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac8/VERDICT.md`:
```
AC-8 backend (RPC/DB): PASS — see 01-rpc-response.txt (HTTP 200), 02-db-state.txt (geo_status=no_gps, captured_lat/lng/gps_accuracy_m all NULL).
AC-8 mobile UI (actual permission-denial dialog + successful submit on-device): NOT VERIFIABLE IN THIS ENVIRONMENT — no physical device or Expo simulator available. This UI path is listed in the ticket's "already verified" section ("No GPS advisory UI"), so no new mobile code was touched here; only the fresh backend classification needed re-confirming, which is done above.
```

---

### Task 7: QA — AC-9 & AC-10: flag review list + reviewed workflow verification

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10/`. **Depends on Tasks 5 and 6 having run first** (this task reviews the `outside` and `no_gps` rows they created).

**Interfaces:**
- Consumes: the two flagged records from Task 5 (`FN`, `outside`) and Task 6 (`AN`, `no_gps`), both dated today, section `...101`.
- Produces: both records marked reviewed and then deleted (final cleanup for Tasks 5-7's fixtures).

- [ ] **Step 1: Setup and pre-condition check**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10
TODAY=$(date +%F)
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select id, session, geo_status, geo_reviewed_at from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and geo_status in ('outside','no_gps');" > docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10/00-precondition.txt
```
Expected: two rows — one `session=FN, geo_status=outside, geo_reviewed_at=NULL` (from Task 5), one `session=AN, geo_status=no_gps, geo_reviewed_at=NULL` (from Task 6). If either is missing, run Task 5/6 first — do not fabricate fixtures here.

- [ ] **Step 2: Log in as principal and open the review page**

Using the `webapp-testing` skill, log in at `http://school1.lvh.me:3000/login` with phone `9000000003` (Dr. Meena Iyer), OTP `123456`. Navigate to `http://school1.lvh.me:3000/principal/attendance/geo-review`.
Expected UI: the "Flagged submissions" list shows exactly two groups for today (plus possibly older seeded flags, if any exist — filter by today's date visually): one tagged "OFF-CAMPUS" with a distance ("~455 m past the fence" per Task 5's `geo_distance_m`), one tagged "NO-GPS" with "Location unavailable at submit". Neither row has a mini-map element. Both show a "Mark reviewed" button (not yet reviewed). Screenshot `.../01-pending-list.png`.

- [ ] **Step 3 (AC-9): Confirm the filter excludes on-campus/not-captured records**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select geo_status, count(*) from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' group by geo_status;" > docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10/02-all-statuses-today.txt
```
Expected: this shows at least one `not_captured` row too (from Task 4's web submission) — confirm visually that this `not_captured` row does **not** appear anywhere in the Step 2 screenshot's flagged list, proving the `.in("geo_status", ["outside","no_gps"])` filter works correctly end-to-end, not just in the source code.

- [ ] **Step 4 (AC-10): Review the off-campus group**

Click "Mark reviewed" on the "OFF-CAMPUS" (`FN`) row.
Expected UI: the button is replaced by a "Reviewed · you" pill; the row remains visible in the list but at reduced opacity (per the approved mockup — it is **not removed**). Screenshot `.../03-after-review.png`.

Expected SQL:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select geo_reviewed_at, geo_reviewed_by from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'FN';" > docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10/04-reviewed-db-state.txt
```
Expected: `geo_reviewed_at` is a non-null recent timestamp, `geo_reviewed_by = aaaaaaaa-0000-0000-0000-000000000012` (Dr. Meena Iyer's user id).

- [ ] **Step 5: Confirm the no-GPS group is still pending**

Screenshot confirms the "NO-GPS" (`AN`) row still shows an active "Mark reviewed" button (not grayed out) — i.e. reviewing one group didn't affect the other. Reference the same `.../03-after-review.png` screenshot from Step 4, or capture a fresh `.../05-no-gps-still-pending.png` if the layout requires scrolling to see both.

- [ ] **Step 6: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac9-ac10/VERDICT.md` with PASS/FAIL for AC-9 (filter + row content) and AC-10 (reviewed columns set correctly; UI matches approved mockup's "stays visible, grayed out" behavior rather than the ticket's literal "removed" wording — call this out explicitly as a ticket/mockup conflict, not a defect).

- [ ] **Step 7: Cleanup — delete both fixture rows**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "delete from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session in ('FN','AN');"
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session in ('FN','AN');"
```
Expected: `count = 0` — both Task 5 and Task 6's fixture rows removed, demo DB restored.

---

### Task 8: QA — AC-11: navigation badge verification

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac11/`.

**Interfaces:**
- Consumes: a fresh flagged record (this task creates and cleans up its own — do not depend on Task 7's already-deleted fixtures).
- Produces: one temporary flagged record, deleted at the end.

- [ ] **Step 1: Setup and baseline**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/ac11
TODAY=$(date +%F)
```
Using the `webapp-testing` skill, log in as principal (`9000000003` / `123456`), open `http://school1.lvh.me:3000/`.
Expected: no badge on the "Flag review" nav item (or whatever count is currently pending from unrelated seed data — record the exact starting count via `docker exec ... psql -c "select count(distinct section_id||date||session) from attendance_records where school_id='aaaaaaaa-0000-0000-0000-000000000001' and geo_status in ('outside','no_gps') and geo_reviewed_at is null and date >= (current_date - 60);"` as `$BASELINE_COUNT`). Screenshot `.../01-baseline-badge.png`.

- [ ] **Step 2: Create a flagged record**

Reuse Task 5's exact `curl` recipe (mint a fresh teacher JWT for Priya Nair, call `mark_attendance` with `p_geo_source=device`, coordinates ~555m outside Main Campus) but with `p_session: "FULL_DAY"` (distinct from any leftover session) to guarantee a new flagged group:
```bash
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL="http://127.0.0.1:54321"
curl -s -X POST "$API_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005"}'
TEACHER_JWT=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000005","token":"123456","type":"sms"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
STUDENT_ID=$(docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -t -c "select id from students where section_id = 'cccccccc-0000-0000-0000-000000000101' limit 1;" | tr -d ' ')
curl -s -X POST "$API_URL/rest/v1/rpc/mark_attendance" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TEACHER_JWT" -H "Content-Type: application/json" -d "{\"p_section_id\":\"cccccccc-0000-0000-0000-000000000101\",\"p_session\":\"FULL_DAY\",\"p_date\":\"$TODAY\",\"p_records\":[{\"student_id\":\"$STUDENT_ID\",\"status\":\"present\"}],\"p_lat\":18.463076,\"p_lng\":73.865803,\"p_accuracy\":12,\"p_geo_source\":\"device\"}" -i
```
Expected: HTTP 200.

- [ ] **Step 3: Reload the web app and confirm the badge appears**

Reload `http://school1.lvh.me:3000/` (or any page under the `(school)` layout) as the still-logged-in principal.
Expected: the "Flag review" nav item now shows a badge reading `$BASELINE_COUNT + 1`. Screenshot `.../02-badge-appeared.png`.

- [ ] **Step 4: Review the record and confirm the badge decreases**

Navigate to `http://school1.lvh.me:3000/principal/attendance/geo-review`, click "Mark reviewed" on the new `FULL_DAY` group. Reload the layout.
Expected: badge now reads `$BASELINE_COUNT` again (back to the pre-Step-2 value). Screenshot `.../03-badge-decreased.png`.

- [ ] **Step 5: If `$BASELINE_COUNT` was 0, additionally confirm the badge fully disappears**

If Step 1's baseline was `0`, Step 4's reload should show **no badge at all** on the nav item (not a "0" badge) — confirm via screenshot `.../04-badge-gone.png` and by inspecting the rendered DOM for the absence of the badge element. If baseline was nonzero (pre-existing unrelated flagged data), note this explicitly in the verdict rather than claiming the "disappears at zero" case was tested.

- [ ] **Step 6: Cleanup**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "delete from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'FULL_DAY' and geo_status = 'outside';"
```

- [ ] **Step 7: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac11/VERDICT.md` with PASS/FAIL, noting explicitly whether the "badge disappears at zero" sub-case was verified (Step 5) or only the "count decreases" sub-case (Step 4).

---

### Task 9: QA — AC-12: mobile geofence refresh on reopen (code guarantee + manual device steps)

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/ac12/`.

**Interfaces:** none — this task documents a code-level guarantee and hands off a manual checklist; no automated evidence is producible without a device/simulator.

- [ ] **Step 1: Re-confirm the no-cache guarantee in code**

```bash
grep -n "AsyncStorage" apps/mobile/lib/location.ts
```
Expected: no match (already confirmed during codebase analysis — no persistent cache of geofences anywhere in this file).
```bash
grep -n "getActiveGeofences" "apps/mobile/app/(teacher)/attendance/[sectionId].tsx"
```
Expected: exactly one call site, inside the `useEffect(() => {...}, [schoolId])` at lines 64-92 — runs on every mount of this screen, with no `useFocusEffect`/persistence layer that could serve stale data across an app restart.

- [ ] **Step 2: Write the manual device checklist**

Since no physical device or Expo simulator is available in this environment, write the following checklist to `docs/superpowers/implementation-reports/evidence/erp68/ac12/MANUAL-CHECKLIST.md` for a human tester (or a later automated run once device access exists) to execute and fill in:

```markdown
# AC-12 Manual Verification Checklist (requires physical device or Expo simulator)

Precondition: Expo dev build running (`pnpm --filter @erp/mobile dev`), logged in as a teacher for Demo School, standing at a location currently INSIDE Main Campus's 100m radius (18.458076, 73.865803).

1. [ ] Open the attendance screen for section Class 1-A. Confirm the advisory chip reads "On campus · Main Campus" (green/VERIFIED).
2. [ ] As school_admin on the web app (http://school1.lvh.me:3000/admin/settings/geo-attendance), edit Main Campus's radius down to 5m (small enough that the tester's current position is now OUTSIDE it), save.
3. [ ] Fully close the mobile app (swipe away from the app switcher, not just background it).
4. [ ] Reopen the mobile app, navigate back to the same attendance screen.
5. [ ] Expected: advisory chip now reads "Off campus · Main Campus" (amber/FLAGGED) — proving the geofence radius was re-fetched fresh on reopen, not served from a stale cache.
6. [ ] Restore Main Campus's radius to 100m afterward (cleanup) via the web admin page.
7. [ ] Record PASS/FAIL and a screenshot of both before/after chip states in this file.
```

- [ ] **Step 3: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/ac12/VERDICT.md`:
```
AC-12 code guarantee: PASS — no AsyncStorage/module-level cache found for geofences; fetch happens in a plain mount effect keyed on schoolId (Step 1 above).
AC-12 runtime confirmation: NOT VERIFIABLE IN THIS ENVIRONMENT — no physical device/simulator available. See MANUAL-CHECKLIST.md for the exact steps a human tester (or future device-enabled run) must complete before this AC can be marked PASS end-to-end.
```

---

### Task 10: Regression verification (Step 4)

**Files:** none modified. Evidence written to `docs/superpowers/implementation-reports/evidence/erp68/regression/`.

- [ ] **Step 1: Setup**

```bash
mkdir -p docs/superpowers/implementation-reports/evidence/erp68/regression
```

- [ ] **Step 2: Type-check both apps**

```bash
pnpm --filter @erp/web type-check > docs/superpowers/implementation-reports/evidence/erp68/regression/01-web-typecheck.txt 2>&1
echo "exit: $?" >> docs/superpowers/implementation-reports/evidence/erp68/regression/01-web-typecheck.txt
pnpm --filter @erp/mobile type-check > docs/superpowers/implementation-reports/evidence/erp68/regression/02-mobile-typecheck.txt 2>&1
echo "exit: $?" >> docs/superpowers/implementation-reports/evidence/erp68/regression/02-mobile-typecheck.txt
```
Expected: both exit 0.

- [ ] **Step 3: Confirm existing (non-geo) attendance submission and update still work**

Using the `webapp-testing` skill, log in as Priya Nair, mark attendance for a **different** section not touched by any prior task (e.g. `cccccccc-0000-0000-0000-000000000102`, Class 1-B) for today, session `FULL_DAY`. Save. Reload the page, change one student's status, save again ("update" path).
Expected: both saves succeed with the standard success toast; no regression in the existing mark/update flow.
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000102' and date = current_date;" > docs/superpowers/implementation-reports/evidence/erp68/regression/03-attendance-write-ok.txt
```
Expected: count > 0.

- [ ] **Step 4: Confirm Main Campus (the pre-existing, real geofence) is untouched**

```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select name, center_lat, center_lng, radius_m, is_active from school_geofences where id = '00000000-0000-0000-0000-000000000001';" > docs/superpowers/implementation-reports/evidence/erp68/regression/04-main-campus-unchanged.txt
```
Expected: `name=Main Campus`, `center_lat=18.458076092395583`, `center_lng=73.86580258135531`, `radius_m=100`, `is_active=t` — identical to the very first baseline captured in Task 2 Step 2. (If Task 9's manual checklist was actually executed and left the radius at 5m, this step also verifies the cleanup in that checklist's Step 6 was completed — if not, restore it here: `docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "update school_geofences set radius_m = 100 where id = '00000000-0000-0000-0000-000000000001';"`.)

- [ ] **Step 5: Confirm RLS still blocks a non-assigned teacher**

Kavitha Reddy (`user_id = aaaaaaaa-0000-0000-0000-000000000016`, phone `9000000007`) is confirmed to have no authorization path for section `...101`: `select teacher_id from timetable where section_id='cccccccc-0000-0000-0000-000000000101'` returns only `aaaaaaaa-0000-0000-0000-000000000014` (Priya Nair) on every row, and `section_assignments` for this section also names only Priya Nair as `class_teacher_id` — so both branches of `can_write_section_attendance` fail for Kavitha.

```bash
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL="http://127.0.0.1:54321"
TODAY=$(date +%F)
curl -s -X POST "$API_URL/auth/v1/otp" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000007"}'
KAVITHA_JWT=$(curl -s -X POST "$API_URL/auth/v1/verify" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d '{"phone":"+919000000007","token":"123456","type":"sms"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
STUDENT_ID=$(docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -t -c "select id from students where section_id = 'cccccccc-0000-0000-0000-000000000101' limit 1;" | tr -d ' ')
curl -s -X POST "$API_URL/rest/v1/rpc/mark_attendance" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $KAVITHA_JWT" -H "Content-Type: application/json" \
  -d "{\"p_section_id\":\"cccccccc-0000-0000-0000-000000000101\",\"p_session\":\"FULL_DAY\",\"p_date\":\"$TODAY\",\"p_records\":[{\"student_id\":\"$STUDENT_ID\",\"status\":\"present\"}],\"p_lat\":null,\"p_lng\":null,\"p_accuracy\":null,\"p_geo_source\":\"web\"}" \
  -i > docs/superpowers/implementation-reports/evidence/erp68/regression/05-rls-still-blocks-unassigned-teacher.txt
cat docs/superpowers/implementation-reports/evidence/erp68/regression/05-rls-still-blocks-unassigned-teacher.txt
```
Expected: a non-2xx HTTP response (Postgres exception surfaced by PostgREST — e.g. `400`/`403` with a permission-denied message), and confirm no row was actually inserted:
```bash
docker exec supabase_db_plan-2-supabase-auth psql -U postgres -d postgres -c "select count(*) from attendance_records where section_id = 'cccccccc-0000-0000-0000-000000000101' and date = '$TODAY' and session = 'FULL_DAY' and marked_by = 'aaaaaaaa-0000-0000-0000-000000000016';"
```
Expected: `count = 0` — proving `can_write_section_attendance` still correctly rejects a teacher with no assignment to this section (the "mark_attendance security authorization fix," already verified and out of scope, has not regressed).

- [ ] **Step 6: Confirm existing navigation (non-geo items) still renders**

Screenshot the main nav for a school_admin and a principal session (already logged in from earlier tasks) showing all pre-existing nav items intact (Dashboard, Students, Fees, etc. — whatever existed before this branch) alongside the new geo-review/geofence-setup items. Save to `docs/superpowers/implementation-reports/evidence/erp68/regression/06-nav-intact.png`.

- [ ] **Step 7: Record the verdict**

Write `docs/superpowers/implementation-reports/evidence/erp68/regression/VERDICT.md` summarizing PASS/FAIL for: type-checks, attendance submission/update, geofence editing (Main Campus untouched), RLS/auth (unassigned teacher blocked), and navigation.

---

### Task 11: Synthesize the final QA sign-off report (Step 5) and apply the DONE/IN PROGRESS rule

**Files:**
- Create: `docs/superpowers/implementation-reports/2026-07-29-erp68-verification-report.md`

**Interfaces:**
- Consumes: every `VERDICT.md` file written in Tasks 2-10, and the codebase-analysis table from this plan's own "Codebase Analysis" section.
- Produces: the final report the user reads to decide DONE vs. IN PROGRESS.

- [ ] **Step 1: Collect every verdict**

```bash
find docs/superpowers/implementation-reports/evidence/erp68 -name "VERDICT.md" -exec echo "=== {} ===" \; -exec cat {} \;
```

- [ ] **Step 2: Write the final report**

Create `docs/superpowers/implementation-reports/2026-07-29-erp68-verification-report.md` containing, in order:
1. A one-paragraph executive summary.
2. The Task Completion table: `| Acceptance Criterion | PASS | FAIL | Evidence |` — one row per AC-1 through AC-12, with the evidence column pointing at the specific file(s) under `evidence/erp68/...` (relative paths) that back the verdict. For AC-7, AC-8, AC-12, split the row into "backend" (PASS, with evidence) and "mobile UI" (NOT VERIFIABLE IN THIS ENVIRONMENT, with the specific missing-evidence reason) rather than collapsing to a single PASS/FAIL — per the Final Rule below, a split row with any non-PASS component keeps the ticket at IN PROGRESS.
3. The regression table from Task 10's verdict.
4. Explicitly flag the AC-10 ticket-vs-mockup conflict (Global Constraints) as a resolved design decision, not an open question.

- [ ] **Step 3: Apply the Final Rule**

Per the ticket's Final Rule, the ticket may only be marked **DONE** when every AC has runtime, database, network, and regression evidence with no gaps. Since AC-7, AC-8, and AC-12 each have a mobile-UI component explicitly marked "NOT VERIFIABLE IN THIS ENVIRONMENT" (no physical device/simulator), the report's final verdict **must** read:

```
IN PROGRESS

1. Missing implementation: none — the only code gap found (AC-7 mobile copy) was fixed in Task 1.
2. Missing evidence:
   - AC-7: on-device rendering of the amber advisory card / FLAGGED chip / warning banner / "Submit (off-campus)" button (backend RPC/DB/network evidence is complete, see Task 5).
   - AC-8: on-device permission-denial flow and resulting UI state (backend RPC/DB evidence is complete, see Task 6).
   - AC-12: on-device app-close/reopen geofence refresh (code-level no-cache guarantee confirmed, see Task 9 Step 1; runtime confirmation pending).
3. Exact steps required to reach DONE: hand a physical Android/iOS device or a running Expo simulator to a tester, then execute `docs/superpowers/implementation-reports/evidence/erp68/ac12/MANUAL-CHECKLIST.md` (AC-12) and the equivalent on-device visual confirmation for AC-7/AC-8 (stand outside/inside the geofence, or toggle location permission off, and screenshot the resulting screen), attaching the screenshots/video to this report's evidence folder and flipping the three split rows in Step 2's table to PASS.
```

- [ ] **Step 4: Commit the report**

```bash
git add docs/superpowers/implementation-reports/2026-07-29-erp68-verification-report.md docs/superpowers/implementation-reports/evidence/erp68
git commit -m "test(erp68): runtime/DB/network verification evidence for remaining ACs — IN PROGRESS pending on-device mobile confirmation"
```
