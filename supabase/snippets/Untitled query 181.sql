SELECT
geo_reviewed_at,
geo_reviewed_by
FROM attendance_records
ORDER BY created_at DESC
LIMIT 1;