-- Unit test for public._haversine_m. Pure function, no fixtures needed —
-- wrapped in a transaction only for consistency with the rest of the suite.
-- Run: npx supabase db query --local -f supabase/tests/haversine.test.sql

BEGIN;

DO $$
BEGIN
  IF public._haversine_m(12.9716, 77.5946, 12.9716, 77.5946) <> 0 THEN
    RAISE EXCEPTION 'FAIL: distance between identical points is not 0';
  END IF;
  RAISE NOTICE 'PASS: distance between identical points is 0';
END $$;

DO $$
DECLARE v_dist numeric;
BEGIN
  -- 1 degree of latitude is ~110.6-111.7 km on a sphere; a generous band
  -- catches the right constant without hardcoding the exact sphere radius math.
  v_dist := public._haversine_m(0, 0, 1, 0);
  IF v_dist < 110000 OR v_dist > 112000 THEN
    RAISE EXCEPTION 'FAIL: 1 degree latitude distance out of expected range: %', v_dist;
  END IF;
  RAISE NOTICE 'PASS: 1 degree latitude distance in expected range (% m)', v_dist;
END $$;

DO $$
BEGIN
  IF public._haversine_m(12.9716, 77.5946, 13.0716, 77.5946)
     <> public._haversine_m(13.0716, 77.5946, 12.9716, 77.5946) THEN
    RAISE EXCEPTION 'FAIL: haversine distance is not symmetric';
  END IF;
  RAISE NOTICE 'PASS: haversine distance is symmetric';
END $$;

ROLLBACK;
