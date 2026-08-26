BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000030"}', true);
INSERT INTO storage.objects (bucket_id, name) VALUES ('student-photos', 'student-photos/dddddddd-0000-0000-0000-000000000001/photo.jpg');
ROLLBACK;
