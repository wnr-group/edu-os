# AC-12 Manual Verification Checklist (requires physical device or Expo simulator)

**Acceptance Criteria:** When a teacher closes and reopens the mobile app while standing at a geofence location, the geofence data is refreshed from the server (not served from a stale cache), so changes to geofence radius are immediately visible.

## Precondition
- Expo dev build running (`pnpm --filter @erp/mobile dev`)
- Logged in as a teacher for Demo School
- Standing at a location currently **INSIDE** Main Campus's 100m radius (coordinates: 18.458076, 73.865803)
- Geofence fetch on app mount is working without errors

## Test Steps

### Step 1: Verify Initial On-Campus State
- [ ] Open the mobile app and navigate to the attendance screen for section **Class 1-A**
- [ ] Observe the **GeoAdvisoryChip** component displays: **"On campus · Main Campus"** (green/VERIFIED status)
- [ ] Confirm the chip renders with the correct advisory status from line 240 of `[sectionId].tsx`
- [ ] Screenshot: capture the screen showing the green "On campus" chip

### Step 2: Modify Geofence Radius (Server-Side)
- [ ] On the web app (http://school1.lvh.me:3000/admin/settings/geo-attendance), log in as school_admin
- [ ] Navigate to the geofence management page for Demo School
- [ ] Locate **Main Campus** geofence (center: 18.458076, 73.865803, current radius: 100m)
- [ ] Edit the radius down to **5 meters** — small enough that the tester's current physical position is now **OUTSIDE** the geofence
- [ ] Save the change on the server
- [ ] Confirm the backend has persisted the change (check Supabase if accessible)

### Step 3: Force App Reload (Full Close & Reopen)
- [ ] **Fully close** the mobile app:
  - iOS: Swipe up from the app switcher (not just backgrounding)
  - Android: Swipe away from the app switcher or use "Close all" in recent apps
- [ ] Wait 2–3 seconds
- [ ] **Reopen** the mobile app
- [ ] Navigate back to the attendance screen for the same section **Class 1-A**

### Step 4: Verify Fresh Geofence Fetch
- [ ] Observe the **GeoAdvisoryChip** component now displays: **"Off campus · Main Campus"** (amber/FLAGGED status)
- [ ] This proves the geofence radius was **re-fetched fresh** on app reopen (line 66 in `[sectionId].tsx` runs in the useEffect with `[schoolId]` dependency)
- [ ] If the chip still shows "On campus", the app is serving **stale cached data** — test FAILS
- [ ] Screenshot: capture the screen showing the amber "Off campus" chip

### Step 5: Cleanup
- [ ] On the web admin page, restore **Main Campus** radius to **100 meters** (original value)
- [ ] Save the change
- [ ] Close and reopen the mobile app one more time to confirm it returns to "On campus" (optional verification)

## Result Recording

| Aspect | Expected | Actual | PASS/FAIL |
|--------|----------|--------|-----------|
| Initial chip state (on-campus) | Green "On campus · Main Campus" | | |
| Chip state after app reopen (off-campus) | Amber "Off campus · Main Campus" | | |
| Geofence freshness | Fresh from server (not cached) | | |
| **Overall AC-12 Result** | | | **PASS** / **FAIL** |

## Screenshots & Evidence
- [ ] Attach screenshot of Step 1 (green on-campus chip)
- [ ] Attach screenshot of Step 4 (amber off-campus chip after reopen)
- [ ] Attach device logs or network inspector traces if any issues occur

## Technical Notes for Tester
- The geofence fetch is triggered by the `useEffect` on line 64–92 of `apps/mobile/app/(teacher)/attendance/[sectionId].tsx`
- The dependency array `[schoolId]` means the effect runs on mount and whenever `schoolId` changes
- `getActiveGeofences(supabase, schoolId)` (line 66) performs a direct Supabase query with no AsyncStorage cache (verified in `apps/mobile/lib/location.ts` lines 71–81)
- The advisory status is computed from the fetched geofences and the device's current location (line 83 in `[sectionId].tsx`)
- If "On campus" persists after reopen despite the radius change, suspect: service worker cache, native module cache, or Supabase query cache configuration

## Failure Diagnosis
If this test fails (chip does not update after reopen):
1. Check mobile app logs for errors in `getActiveGeofences` or location permission requests
2. Verify Supabase RLS policies allow the teacher's user to read `school_geofences`
3. Confirm the geofence radius change was actually saved on the server (re-fetch on web app)
4. Check if native location module is caching the position (unlikely; `getAdvisoryPosition()` uses `getLastKnownPositionAsync()` which is fresh on each call)
5. If still failing, file a bug with: screenshots, device logs, Supabase query results, and app build info
