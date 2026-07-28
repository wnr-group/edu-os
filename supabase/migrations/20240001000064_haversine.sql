-- Sub-project #2, Module A.2: pure-SQL Haversine distance helper.
-- Point-to-radius only (1-3 geofences/school, never spatial indexing over
-- large sets) so cube+earthdistance is avoided entirely — no extension
-- surface for zero benefit. See architecture doc D15.

CREATE OR REPLACE FUNCTION public._haversine_m(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path = ''
AS $$
  SELECT 6371000 * 2 * asin(sqrt(
    power(sin(radians((lat2 - lat1) / 2)), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
  ));
$$;
