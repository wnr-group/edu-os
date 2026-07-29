# AC-7: Outside-Geofence Backend Verification

## Backend (RPC/Network/DB): PASS

### Evidence
- **01-rpc-response.txt**: HTTP 204 (success), no error body
- **02-db-state.txt**: Attendance record contains:
  - `status = present`
  - `geo_status = outside` ✓
  - `captured_lat = 18.463076`
  - `captured_lng = 73.865803`
  - `gps_accuracy_m = 12`
  - `geo_distance_m ≈ 455.96m` (distance past the 100m radius) ✓
  - `matched_geofence_id = NULL` (correct for outside geofence)

### Verification Details
- **JWT**: Real teacher JWT obtained via Auth API OTP + verify flow for Priya Nair
- **RPC Called**: `POST http://127.0.0.1:54321/rest/v1/rpc/mark_attendance`
- **Headers**: 
  - `Authorization: Bearer <teacher_jwt>`
  - `x-school-id: aaaaaaaa-0000-0000-0000-000000000001` (Demo School)
  - `x-active-role: teacher`
  - `Content-Type: application/json`
- **Coordinates**: (18.463076, 73.865803) — outside Main Campus (18.458076092395583, 73.86580258135531) at ~555m north
- **Date**: 2026-07-29 (today)
- **Session**: FN (Forenoon)
- **Student**: d8c1a736-fb59-4af2-a20d-55802c4bfd71 (section A, Class 1-A)

### Backend Flow Validation
1. ✓ Teacher JWT minting via Auth API works
2. ✓ Role resolution via scope_pre_request hook validates user_roles
3. ✓ RPC authorization check passes (teacher + school + section)
4. ✓ Geofence detection logic correctly identifies "outside" status
5. ✓ Distance calculation accurate (455.96m ≈ 555m - 100m radius)
6. ✓ Database insert successful with all geo fields populated

---

## Mobile UI (Amber Advisory Card, FLAGGED Chip, Warning Banner): NOT VERIFIABLE IN THIS ENVIRONMENT

**Reason**: No physical device or Expo simulator available for this QA environment.

**What Cannot Be Verified**:
- Amber advisory chip rendering on-screen
- "Off-campus — attendance submission disabled" warning banner display
- Orange "Submit (off-campus)" button color and text
- Overall visual layout matching `stitch-designs/eduos-v2/geo-attendance-mobile.html` lines 174-211

**Pre-requisite Completed**:
- Task 1 already aligned banner/button copy to approved mockup
- Type-checking passes

**Next Step for Full AC-7 Completion**:
- A human tester with a physical device or Expo simulator must:
  1. Open the app as Priya Nair
  2. Navigate to mark attendance
  3. Attempt to submit attendance with GPS coordinates outside campus (18.463076, 73.865803)
  4. Verify visual elements match the approved design

---

## Summary
**AC-7 Backend: PASS** — RPC, network, and database layers are fully functional and correctly detect outside-geofence status. Geo-distance calculations are accurate. This half of AC-7 is complete and verified.

**AC-7 Mobile UI: BLOCKED** — Requires device/simulator. Defer to manual testing phase.

