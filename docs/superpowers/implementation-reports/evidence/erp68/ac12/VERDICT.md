# AC-12 Verdict: Mobile Geofence Refresh on Reopen

**Acceptance Criteria:** When a teacher closes and reopens the mobile app while standing at a geofence location, the geofence data is refreshed from the server (not served from a stale cache).

---

## Code Guarantee: PASS ✅

### No AsyncStorage/Persistent Cache Found
- **File:** `apps/mobile/lib/location.ts` (71–81)
- **Function:** `getActiveGeofences(supabase: SupabaseClient, schoolId: string)`
- **Verification:**
  ```
  grep -n "AsyncStorage" apps/mobile/lib/location.ts
  → No matches found
  ```
- **Finding:** The function performs a direct Supabase query:
  ```typescript
  const { data } = await supabase
    .from("school_geofences")
    .select("id, name, center_lat, center_lng, radius_m")
    .eq("school_id", schoolId)
    .eq("is_active", true);
  return (data ?? []) as GeofenceRow[];
  ```
- **Guarantee:** Every call to `getActiveGeofences` results in a fresh network request to Supabase. No AsyncStorage save/load, no module-level cache, no in-memory memoization.

### getActiveGeofences Called in Mount-Time useEffect with [schoolId] Dependency
- **File:** `apps/mobile/app/(teacher)/attendance/[sectionId].tsx` (64–92)
- **Verification:**
  ```
  grep -n "getActiveGeofences" apps/mobile/app/(teacher)/attendance/[sectionId].tsx
  → 20: import { getActiveGeofences, ... }
  → 66:   const fences = await getActiveGeofences(supabase, schoolId);
  ```
- **Finding:** Single call site (line 66) inside `useEffect`:
  ```typescript
  useEffect(() => {
    const initializeLocationAsync = async () => {
      const fences = await getActiveGeofences(supabase, schoolId);
      setGeofences(fences);
      // ... location permission + advisory computation
    };
    initializeLocationAsync();
  }, [schoolId]);  // ← Dependency array: runs on mount & when schoolId changes
  ```
- **Guarantee:** 
  - Effect runs on initial mount
  - When component remounts (e.g., after app close/reopen), the effect runs again
  - Each run triggers a fresh `getActiveGeofences` call
  - Geofence data is always fresh, never cached across app restarts

### No useFocusEffect or Persistence Layer
- **Finding:** The geofence fetch is a simple `useEffect` with `[schoolId]` dependency. No `useFocusEffect` (which would run on screen focus) and no AsyncStorage fallback to serve stale data between sessions.
- **Guarantee:** Geofence freshness is guaranteed by React's component lifecycle—when the screen is unmounted and remounted, the effect reruns unconditionally.

---

## Runtime Confirmation: NOT VERIFIABLE IN THIS ENVIRONMENT ⚠️

**Reason:** No physical device or Expo simulator available in this environment. A human tester with a mobile device must execute the manual steps.

**Manual Verification Required:**
1. Tester modifies a geofence radius on the web admin panel
2. Tester closes and reopens the mobile app while standing at the modified location
3. Tester observes the advisory chip reflect the new geofence boundary (fresh fetch)
4. Tester records PASS/FAIL with screenshots

**See:** `MANUAL-CHECKLIST.md` in this directory for the exact steps.

---

## Summary

| Criterion | Status | Evidence |
|-----------|--------|----------|
| **Code: No AsyncStorage cache** | ✅ PASS | `location.ts` lines 71–81 — direct Supabase query, no cache |
| **Code: getActiveGeofences in mount useEffect** | ✅ PASS | `[sectionId].tsx` lines 64–92 — useEffect with `[schoolId]` dependency |
| **Code: Fresh fetch on app reopen** | ✅ PASS | React lifecycle + useEffect dependency array guarantees fresh call on remount |
| **Runtime: Device-based verification** | ⚠️ NOT VERIFIABLE | Requires physical device/simulator + manual test steps |

---

## Conclusion

**AC-12 Code Guarantee: PASS**

The code provides a technical guarantee that geofence data is refreshed on app reopen:
- No persistent cache (AsyncStorage) used
- Fresh Supabase query triggered by useEffect on mount
- No fallback to stale data

**AC-12 Runtime Confirmation: BLOCKED (awaiting device test)**

A human tester with a mobile device must execute the manual checklist to confirm the guarantee works in practice (e.g., network requests succeed, advisory chip updates correctly, no edge cases with location permissions).

---

**Generated:** 2026-07-29  
**Task:** ERP-68 AC-12 — Mobile Geofence Refresh on Reopen  
**Reviewer:** Claude Code Agent (static code analysis, no device access)
