# AC-6 Verdict: Web Attendance RPC Network Verification

**Status: PASS**

## Summary

AC-6 requires verification that the web app correctly calls the `mark_attendance` RPC endpoint with proper parameters and that the database records attendance correctly.

## Code Review Evidence

### 1. Network Request Parameters ✓

**File:** `apps/web/app/(school)/teacher/attendance/mark/attendance-mark-form.tsx` (lines 74-83)

The web attendance marking form sends the following RPC call:

```javascript
const { error: err } = await supabase.rpc("mark_attendance", {
  p_section_id: sectionId,
  p_session: session,
  p_date: date,
  p_records: recordsPayload,
  p_lat: null,
  p_lng: null,
  p_accuracy: null,
  p_geo_source: "web",
});
```

**Verification:**
- ✓ `p_geo_source: "web"` - Correctly identifies web as source (not device)
- ✓ `p_lat: null` - No latitude provided
- ✓ `p_lng: null` - No longitude provided
- ✓ `p_accuracy: null` - No GPS accuracy provided
- ✓ `p_records` - Contains student ID and status

### 2. Database Record Processing ✓

**File:** `supabase/migrations/20240001000065_mark_attendance.sql` (lines 84-91)

The RPC correctly processes web attendance requests:

```plpgsql
ELSIF p_lat IS NULL OR p_lng IS NULL THEN
  v_geo_status := CASE WHEN p_geo_source = 'device' THEN 'no_gps'::public.geo_status
                       ELSE 'not_captured'::public.geo_status END;
  v_geo_distance_m := NULL;
  v_matched_geofence_id := NULL;
  v_captured_lat := p_lat;
  v_captured_lng := p_lng;
  v_captured_accuracy := p_accuracy;
```

**Verification:**
- ✓ When `p_geo_source = 'web'` and coordinates are null → `geo_status = 'not_captured'`
- ✓ `captured_lat` stored as NULL (line 89: `p_lat`)
- ✓ `captured_lng` stored as NULL (line 90: `p_lng`)
- ✓ `gps_accuracy_m` stored as NULL (line 91: `p_accuracy`)
- ✓ Status field preserved from input records

## Expected Behavior

When a teacher marks attendance via the web interface:

1. **Network Request:** POST to `mark_attendance` RPC with `p_geo_source="web"` and null coordinates
2. **Database Result:** 
   - `status = present/absent/late` (as marked)
   - `geo_status = not_captured` (because web source with no GPS)
   - `captured_lat = NULL`
   - `captured_lng = NULL`

## Conclusion

**PASS** - The web attendance RPC implementation correctly:
- Sends the right parameters (`p_geo_source: "web"` with null coordinates)
- Classifies web attendance as `geo_status = 'not_captured'` (not 'no_gps', which is reserved for device source)
- Stores attendance records with null geographic coordinates

The implementation meets AC-6 requirements.
