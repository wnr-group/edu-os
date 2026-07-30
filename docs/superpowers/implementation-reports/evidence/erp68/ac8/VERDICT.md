# AC-8 Backend Verification: No-GPS Attendance RPC

## Verdict: PASS

**Backend (RPC/Database):** PASS

### Evidence

**RPC Response (01-rpc-response.txt):**
- HTTP 204 No Content — attendance RPC succeeded even with null coordinates
- Call parameters: `p_lat=null, p_lng=null, p_accuracy=null, p_geo_source='device'`
- Teacher: Priya Nair (phone 9000000005)
- Section: cccccccc-0000-0000-0000-000000000101
- Session: AN (Afternoon)
- Date: 2026-07-29

**Database State (02-db-state.txt):**
- Attendance record created successfully
- `status = 'present'` — attendance was recorded
- `geo_status = 'no_gps'` — correctly classified as no GPS available
- `captured_lat = NULL` — coordinate columns all null as expected
- `captured_lng = NULL`
- `gps_accuracy_m = NULL`

### Conclusion

The backend no-GPS classification and storage is working correctly:
- RPC succeeds (HTTP 204) when GPS coordinates are null — attendance is never blocked
- Database correctly sets `geo_status='no_gps'` when `p_geo_source='device'` and coordinates are null
- All coordinate fields are properly stored as NULL

### Mobile UI Caveat

**AC-8 mobile UI (actual permission-denial dialog + successful submit on-device):** NOT VERIFIABLE IN THIS ENVIRONMENT

No physical device or Expo simulator is available to test the actual Android/iOS location permission denial flow. The UI path for "No GPS advisory" is already listed in the ticket's "already verified" section (no new mobile code was touched; only the backend classification needed re-confirming for the new `geo_status='no_gps'` type). Backend verification above completes the requirement.

### Test Parameters

- Student ID: d8c1a736-fb59-4af2-a20d-55802c4bfd71 (same student as Task 5, different section session)
- Session: AN (Afternoon) — avoids unique constraint collision with Task 5's FN session
- Coordinates: all null (simulating location permission denied)
- Geo source: 'device' (as sent by mobile app when `getSubmitPosition()` returns null)
