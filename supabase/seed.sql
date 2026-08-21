-- =============================================================
-- Seed data for local development
-- Run via: supabase db reset (applies migrations + this file)
-- =============================================================

-- ---------------------------------------------------------------
-- SCHOOL
-- ---------------------------------------------------------------
INSERT INTO public.schools (id, name, domain, is_active, contact_email, primary_color)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Demo School',
  'school1.lvh.me',
  true,
  'demo@example.com',
  '#2563EB'
);

INSERT INTO public.schools (id, name, domain, is_active, contact_email, primary_color)
VALUES (
  'aaaaaaaa-0000-0000-0000-0000000000b2',
  'Demo School Two',
  'school2.lvh.me',
  true,
  'demo2@example.com',
  '#059669'
);

-- ---------------------------------------------------------------
-- ACADEMIC YEAR
-- ---------------------------------------------------------------
INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '2026-27',
  '2026-04-01',
  '2027-03-31',
  'active'
);

-- ---------------------------------------------------------------
-- AUTH USERS  (local Supabase only — never run against prod)
-- handle_new_user trigger auto-creates profiles rows
-- Login: enter phone below + OTP 123456 (test_otp mapping in config.toml)
-- ---------------------------------------------------------------
INSERT INTO auth.users (
  id, phone, phone_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token,
  email_change_token_new, email_change
)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000010', '919000000001', now(),
   '{"full_name":"Dinesh (Super Admin)"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000011', '919000000002', now(),
   '{"full_name":"Arjun Sharma"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000012', '919000000003', now(),
   '{"full_name":"Dr. Meena Iyer"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000013', '919000000004', now(),
   '{"full_name":"Ravi Kumar"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000014', '919000000005', now(),
   '{"full_name":"Priya Nair"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000015', '919000000006', now(),
   '{"full_name":"Suresh Babu"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000016', '919000000007', now(),
   '{"full_name":"Kavitha Reddy"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', ''),

  ('aaaaaaaa-0000-0000-0000-000000000017', '919000000008', now(),
   '{"full_name":"Anand Pillai"}'::jsonb,
   now(), now(), 'authenticated', 'authenticated',
   '00000000-0000-0000-0000-000000000000', '', '', '', '');

-- Sync phone into profiles (trigger doesn't copy phone from auth.users in older envs;
-- these are no-ops if the updated trigger already set phone correctly)
UPDATE public.profiles SET phone = '+919000000001' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000010';
UPDATE public.profiles SET phone = '+919000000002' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000011';
UPDATE public.profiles SET phone = '+919000000003' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000012';
UPDATE public.profiles SET phone = '+919000000004' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000013';
UPDATE public.profiles SET phone = '+919000000005' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000014';
UPDATE public.profiles SET phone = '+919000000006' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000015';
UPDATE public.profiles SET phone = '+919000000007' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000016';
UPDATE public.profiles SET phone = '+919000000008' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000017';

-- (profiles.school_id removed — affiliation lives in user_roles)

-- ---------------------------------------------------------------
-- USER ROLES
-- ---------------------------------------------------------------
INSERT INTO public.user_roles (user_id, school_id, role, is_active)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000010', NULL,                                      'super_admin',  true),
  ('aaaaaaaa-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',    'school_admin', true),
  ('aaaaaaaa-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001',    'principal',    true),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001',    'teacher',      true),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001',    'teacher',      true),
  ('aaaaaaaa-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001',    'teacher',      true),
  ('aaaaaaaa-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001',    'teacher',      true),
  ('aaaaaaaa-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000001',    'teacher',      true);

-- ---------------------------------------------------------------
-- CLASSES (Class 1–12)
-- ---------------------------------------------------------------
INSERT INTO public.classes (id, school_id, name, "order") VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 1',  1),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 2',  2),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 3',  3),
  ('bbbbbbbb-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 4',  4),
  ('bbbbbbbb-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 5',  5),
  ('bbbbbbbb-0000-0000-0000-000000000006', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 6',  6),
  ('bbbbbbbb-0000-0000-0000-000000000007', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 7',  7),
  ('bbbbbbbb-0000-0000-0000-000000000008', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 8',  8),
  ('bbbbbbbb-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 9',  9),
  ('bbbbbbbb-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 10', 10),
  ('bbbbbbbb-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 11', 11),
  ('bbbbbbbb-0000-0000-0000-000000000012', 'aaaaaaaa-0000-0000-0000-000000000001', 'Class 12', 12);

-- ---------------------------------------------------------------
-- SECTIONS (A and B for each class = 24 sections)
-- IDs: cccccccc-0000-0000-0000-00000000XXYY  XX=class(01-12) YY=section(01=A,02=B)
-- ---------------------------------------------------------------
INSERT INTO public.sections (id, school_id, class_id, name, academic_year_id) VALUES
  ('cccccccc-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000102', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000201', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000202', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000301', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000302', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000003', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000401', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000402', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000004', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000501', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000502', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000601', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000006', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000602', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000006', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000701', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000007', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000702', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000007', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000801', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000802', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000901', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000902', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000009', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000010', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001002', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000010', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001101', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000011', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001102', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000011', 'B', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001201', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012', 'A', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000001202', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000012', 'B', 'aaaaaaaa-0000-0000-0000-000000000002');

-- ---------------------------------------------------------------
-- TEACHER PROFILES
-- ---------------------------------------------------------------
INSERT INTO public.teacher_profiles (profile_id, school_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000001');

-- SECTION ASSIGNMENTS (class teachers for the active year)
INSERT INTO public.section_assignments (section_id, academic_year_id, class_teacher_id, school_id)
VALUES
  ('cccccccc-0000-0000-0000-000000000801', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001'), -- teacher1 → 8A
  ('cccccccc-0000-0000-0000-000000000101', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000014', 'aaaaaaaa-0000-0000-0000-000000000001'), -- teacher2 → 1A
  ('cccccccc-0000-0000-0000-000000000302', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000015', 'aaaaaaaa-0000-0000-0000-000000000001'), -- teacher3 → 3B
  ('cccccccc-0000-0000-0000-000000000501', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000016', 'aaaaaaaa-0000-0000-0000-000000000001'), -- teacher4 → 5A
  ('cccccccc-0000-0000-0000-000000000702', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000017', 'aaaaaaaa-0000-0000-0000-000000000001');  -- teacher5 → 7B

-- ---------------------------------------------------------------
-- STUDENTS (~85 per class = ~1,020 total, data-only, no auth)
-- generate_series(1,43) → section A,  generate_series(1,42) → section B
-- student_profiles.profile_id is nullable (migration 16)
-- ---------------------------------------------------------------
DO $$
DECLARE
  cls RECORD;
  sec_a UUID;
  sec_b UUID;
  class_num INT;
  i INT;
  sp_id UUID;
  active_year_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
BEGIN
  FOR cls IN
    SELECT id, name, "order" FROM public.classes
    WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    ORDER BY "order"
  LOOP
    class_num := cls."order";
    sec_a := (SELECT id FROM public.sections WHERE class_id = cls.id AND name = 'A');
    sec_b := (SELECT id FROM public.sections WHERE class_id = cls.id AND name = 'B');

    -- Section A: 43 students
    FOR i IN 1..43 LOOP
      INSERT INTO public.student_profiles (
        school_id,
        full_name, admission_number
      ) VALUES (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Student ' || class_num || 'A-' || i,
        'ADM-' || LPAD(((class_num - 1) * 85 + i)::TEXT, 4, '0')
      ) RETURNING id INTO sp_id;

      INSERT INTO public.student_enrollments (
        student_profile_id, academic_year_id, school_id, class_id, section_id, is_active
      ) VALUES (
        sp_id, active_year_id, 'aaaaaaaa-0000-0000-0000-000000000001', cls.id, sec_a, true
      );
    END LOOP;

    -- Section B: 42 students
    FOR i IN 1..42 LOOP
      INSERT INTO public.student_profiles (
        school_id,
        full_name, admission_number
      ) VALUES (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'Student ' || class_num || 'B-' || i,
        'ADM-' || LPAD(((class_num - 1) * 85 + 43 + i)::TEXT, 4, '0')
      ) RETURNING id INTO sp_id;

      INSERT INTO public.student_enrollments (
        student_profile_id, academic_year_id, school_id, class_id, section_id, is_active
      ) VALUES (
        sp_id, active_year_id, 'aaaaaaaa-0000-0000-0000-000000000001', cls.id, sec_b, true
      );
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- FEE STRUCTURES and FEE PAYMENTS removed (tables dropped in migration 35)
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- ATTENDANCE RECORDS (last 7 school days Mon-Fri, ~85% present)
-- marked_by = schooladmin
-- ---------------------------------------------------------------
DO $$
DECLARE
  d DATE;
  school_days INT := 0;
  sp RECORD;
  rnd FLOAT;
BEGIN
  -- Walk backwards from yesterday, collect up to 7 Mon-Fri days
  d := CURRENT_DATE - INTERVAL '1 day';
  WHILE school_days < 7 LOOP
    IF EXTRACT(DOW FROM d) BETWEEN 1 AND 5 THEN -- Mon=1, Fri=5
      FOR sp IN
        SELECT se.student_profile_id AS id, se.section_id
        FROM public.student_enrollments se
        WHERE se.school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
          AND se.academic_year_id = 'aaaaaaaa-0000-0000-0000-000000000002'
      LOOP
        rnd := random();
        INSERT INTO public.attendance_records (
          school_id, student_id, section_id, date, status, marked_by
        ) VALUES (
          'aaaaaaaa-0000-0000-0000-000000000001',
          sp.id,
          sp.section_id,
          d,
          CASE WHEN rnd < 0.85 THEN 'present'::public.attendance_status
               ELSE 'absent'::public.attendance_status END,
          'aaaaaaaa-0000-0000-0000-000000000011'
        );
      END LOOP;
      school_days := school_days + 1;
    END IF;
    d := d - INTERVAL '1 day';
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- ANNOUNCEMENTS (5 records)
-- ---------------------------------------------------------------
INSERT INTO public.announcements (school_id, title, content, target_type, created_by, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Annual Sports Day',
   'Annual Sports Day will be held on April 18th. All students must participate.',
   'school', 'aaaaaaaa-0000-0000-0000-000000000011', '2026-04-18 09:00:00+00'),

  ('aaaaaaaa-0000-0000-0000-000000000001', 'Mid-Term Exam Schedule Released',
   'Mid-term examinations will commence from May 5th. Timetable is now available.',
   'school', 'aaaaaaaa-0000-0000-0000-000000000011', '2026-04-10 09:00:00+00'),

  ('aaaaaaaa-0000-0000-0000-000000000001', 'Summer Vacation Notice',
   'School will remain closed from May 20th to June 10th for summer vacation.',
   'school', 'aaaaaaaa-0000-0000-0000-000000000011', '2026-04-05 09:00:00+00'),

  ('aaaaaaaa-0000-0000-0000-000000000001', 'Parent-Teacher Meeting',
   'PTM scheduled for April 5th from 10am to 1pm. Attendance is mandatory.',
   'school', 'aaaaaaaa-0000-0000-0000-000000000011', '2026-03-28 09:00:00+00'),

  ('aaaaaaaa-0000-0000-0000-000000000001', 'Science Exhibition',
   'Inter-school science exhibition on March 25th. Register by March 22nd.',
   'school', 'aaaaaaaa-0000-0000-0000-000000000011', '2026-03-20 09:00:00+00');

-- ---------------------------------------------------------------
-- DISCIPLINE RECORDS (~2 per month, Nov 2025–Apr 2026 = 12 records)
-- ---------------------------------------------------------------
DO $$
DECLARE
  m DATE;
  student_ids UUID[];
  i INT;
  categories public.discipline_category[] := ARRAY['behavioral','academic','behavioral','attendance','behavioral','academic','behavioral','academic','attendance','behavioral','academic','behavioral']::public.discipline_category[];
  severities  public.discipline_severity[]  := ARRAY['verbal','written','verbal','verbal','written','verbal','written','verbal','verbal','written','verbal','written']::public.discipline_severity[];
BEGIN
  SELECT ARRAY(
    SELECT id FROM public.student_profiles
    WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    ORDER BY random() LIMIT 12
  ) INTO student_ids;

  i := 1;
  FOR m IN
    SELECT generate_series::DATE FROM generate_series(
      '2025-11-01'::DATE, '2026-04-01'::DATE, INTERVAL '1 month'
    )
  LOOP
    -- incident 1
    INSERT INTO public.discipline_records (
      school_id, student_id, category, severity, description, recorded_by, created_at
    ) VALUES (
      'aaaaaaaa-0000-0000-0000-000000000001',
      student_ids[i],
      categories[i],
      severities[i],
      'Disciplinary incident recorded for ' || to_char(m, 'Mon YYYY'),
      'aaaaaaaa-0000-0000-0000-000000000011',
      m + INTERVAL '7 days'
    );
    -- incident 2
    INSERT INTO public.discipline_records (
      school_id, student_id, category, severity, description, recorded_by, created_at
    ) VALUES (
      'aaaaaaaa-0000-0000-0000-000000000001',
      student_ids[i+1],
      categories[i+1],
      severities[i+1],
      'Second disciplinary incident for ' || to_char(m, 'Mon YYYY'),
      'aaaaaaaa-0000-0000-0000-000000000011',
      m + INTERVAL '20 days'
    );
    i := i + 2;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- SUBJECTS (5 per class = 60 total)
-- ---------------------------------------------------------------
INSERT INTO public.subjects (school_id, class_id, name, code)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  c.id,
  sub.name,
  sub.code
FROM public.classes c
CROSS JOIN (VALUES
  ('Mathematics', 'MATH'),
  ('English', 'ENG'),
  ('Science', 'SCI'),
  ('Social Studies', 'SST'),
  ('Hindi', 'HIN')
) AS sub(name, code)
WHERE c.school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------
-- TIMETABLE (~120 entries: 5 teachers × ~25 slots each)
-- Each teacher teaches their subject across 3 sections, Mon-Fri
-- Section 1 gets P1+P2, Section 2 gets P3+P4, Section 3 gets P5
-- ---------------------------------------------------------------
DO $$
DECLARE
  teacher_ids UUID[] := ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000013',
    'aaaaaaaa-0000-0000-0000-000000000014',
    'aaaaaaaa-0000-0000-0000-000000000015',
    'aaaaaaaa-0000-0000-0000-000000000016',
    'aaaaaaaa-0000-0000-0000-000000000017'
  ];
  subject_names TEXT[] := ARRAY['Mathematics', 'English', 'Science', 'Social Studies', 'Hindi'];
  -- Flat array: 3 sections per teacher, 15 total (index = (t_idx-1)*3 + s_idx)
  sec_ids UUID[] := ARRAY[
    'cccccccc-0000-0000-0000-000000000801', 'cccccccc-0000-0000-0000-000000000802', 'cccccccc-0000-0000-0000-000000000701',
    'cccccccc-0000-0000-0000-000000000101', 'cccccccc-0000-0000-0000-000000000102', 'cccccccc-0000-0000-0000-000000000201',
    'cccccccc-0000-0000-0000-000000000301', 'cccccccc-0000-0000-0000-000000000302', 'cccccccc-0000-0000-0000-000000000401',
    'cccccccc-0000-0000-0000-000000000501', 'cccccccc-0000-0000-0000-000000000502', 'cccccccc-0000-0000-0000-000000000601',
    'cccccccc-0000-0000-0000-000000000701', 'cccccccc-0000-0000-0000-000000000702', 'cccccccc-0000-0000-0000-000000000901'
  ];
  t_idx INT;
  s_idx INT;
  d INT;
  p INT;
  sec_id UUID;
  sub_id UUID;
  cls_id UUID;
  periods INT[];
BEGIN
  FOR t_idx IN 1..5 LOOP
    FOR s_idx IN 1..3 LOOP
      sec_id := sec_ids[(t_idx - 1) * 3 + s_idx];
      SELECT class_id INTO cls_id FROM public.sections WHERE id = sec_id;
      SELECT id INTO sub_id FROM public.subjects
        WHERE school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
          AND class_id = cls_id
          AND name = subject_names[t_idx]
        LIMIT 1;
      -- Section 1: P1,P2 | Section 2: P3,P4 | Section 3: P5
      IF s_idx = 1 THEN periods := ARRAY[1, 2];
      ELSIF s_idx = 2 THEN periods := ARRAY[3, 4];
      ELSE periods := ARRAY[5];
      END IF;
      FOR d IN 1..5 LOOP
        FOREACH p IN ARRAY periods LOOP
          INSERT INTO public.timetable (school_id, teacher_id, section_id, subject_id, day_of_week, period, academic_year_id)
          VALUES (
            'aaaaaaaa-0000-0000-0000-000000000001',
            teacher_ids[t_idx],
            sec_id,
            sub_id,
            d,
            p,
            'aaaaaaaa-0000-0000-0000-000000000002'
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- PARENT TEST USER + STUDENT (for mobile app testing)
-- Login: +919000000009 + OTP 123456
-- Student: Aryan Sharma, Class 8A
-- ---------------------------------------------------------------
INSERT INTO auth.users (
  id, phone, phone_confirmed_at,
  raw_user_meta_data, created_at, updated_at,
  aud, role, instance_id, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  'aaaaaaaa-0000-0000-0000-000000000030', '919000000009', now(),
  '{"full_name":"Sunita Sharma"}'::jsonb,
  now(), now(), 'authenticated', 'authenticated',
  '00000000-0000-0000-0000-000000000000', '', '', '', ''
);

-- (profiles.school_id removed — affiliation lives in user_roles)

-- Sync phone into profiles for parent user
UPDATE public.profiles SET phone = '+919000000009' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000030';

INSERT INTO public.user_roles (user_id, school_id, role, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000030', 'aaaaaaaa-0000-0000-0000-000000000001', 'parent', true);

-- Student record linked to parent
INSERT INTO public.student_profiles (id, school_id, full_name, admission_number, parent_profile_id)
VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Aryan Sharma',
  'ADM-TEST-001',
  'aaaaaaaa-0000-0000-0000-000000000030'
);

-- Enrollment for Aryan Sharma in active year (Class 8A)
INSERT INTO public.student_enrollments (
  student_profile_id, academic_year_id, school_id, class_id, section_id, is_active
) VALUES (
  'dddddddd-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000008',
  'cccccccc-0000-0000-0000-000000000801',
  true
);

-- ---------------------------------------------------------------
-- DEMO: teacher-also-parent + multi-child + multi-school
-- Ravi Kumar (919000000004) is a teacher at School 1, AND a parent of two
-- children at School 1, AND a teacher at a second school (School 2).
-- Exercises role switching, student switching, and multi-school login.
-- ---------------------------------------------------------------

-- Parent role at School 1 (in addition to his existing teacher role).
INSERT INTO public.user_roles (user_id, school_id, role, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-000000000001', 'parent', true);

-- Teacher role at School 2 (same human, second school).
INSERT INTO public.user_roles (user_id, school_id, role, is_active) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000013', 'aaaaaaaa-0000-0000-0000-0000000000b2', 'teacher', true);

-- Two children for Ravi at School 1.
INSERT INTO public.student_profiles (id, school_id, full_name, admission_number, parent_profile_id) VALUES
  ('dddddddd-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001', 'Aarav Kumar', 'ADM-DEMO-010', 'aaaaaaaa-0000-0000-0000-000000000013'),
  ('dddddddd-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001', 'Diya Kumar',  'ADM-DEMO-011', 'aaaaaaaa-0000-0000-0000-000000000013');

-- Enrollments for the two children (Aarav → Class 5A, Diya → Class 8A) in the active year.
INSERT INTO public.student_enrollments (student_profile_id, academic_year_id, school_id, class_id, section_id, is_active) VALUES
  ('dddddddd-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000501', true),
  ('dddddddd-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000008', 'cccccccc-0000-0000-0000-000000000801', true);

-- Fee payments block removed (fee_payments table dropped in migration 35)

-- Attendance (last 30 school days, ~85% present)
DO $$
DECLARE
  d         DATE;
  days_done INT := 0;
  rnd       FLOAT;
BEGIN
  d := CURRENT_DATE - INTERVAL '1 day';
  WHILE days_done < 30 LOOP
    IF EXTRACT(DOW FROM d) BETWEEN 1 AND 5 THEN
      rnd := random();
      INSERT INTO public.attendance_records
        (school_id, student_id, section_id, date, status, marked_by)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'dddddddd-0000-0000-0000-000000000001',
        'cccccccc-0000-0000-0000-000000000801',
        d,
        CASE
          WHEN rnd < 0.82 THEN 'present'::public.attendance_status
          WHEN rnd < 0.95 THEN 'absent'::public.attendance_status
          ELSE                  'late'::public.attendance_status
        END,
        'aaaaaaaa-0000-0000-0000-000000000013'
      )
      ON CONFLICT (student_id, date, session) DO NOTHING;
      days_done := days_done + 1;
    END IF;
    d := d - INTERVAL '1 day';
  END LOOP;
END $$;

-- Exam + results
INSERT INTO public.exams (id, school_id, academic_year_id, name, start_date, end_date)
VALUES (
  'eeeeeeee-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'Mid-Term 2026', '2026-02-10', '2026-02-20'
);

INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, marks_obtained, max_marks, grade, teacher_id)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  sub.id, m.marks, 100, m.grade,
  'aaaaaaaa-0000-0000-0000-000000000013'
FROM (VALUES
  ('Mathematics',   88::NUMERIC, 'A'),
  ('English',       76::NUMERIC, 'B'),
  ('Science',       91::NUMERIC, 'A+'),
  ('Social Studies',82::NUMERIC, 'A'),
  ('Hindi',         79::NUMERIC, 'B+')
) AS m(subj_name, marks, grade)
JOIN public.subjects sub
  ON  sub.name      = m.subj_name
  AND sub.class_id  = 'bbbbbbbb-0000-0000-0000-000000000008'
  AND sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Homework for Class 8A
INSERT INTO public.homework (school_id, class_id, section_id, subject_id, teacher_id, title, description, due_date)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000008',
  'cccccccc-0000-0000-0000-000000000801',
  sub.id,
  'aaaaaaaa-0000-0000-0000-000000000013',
  hw.title, hw.body, hw.due
FROM (VALUES
  ('Mathematics', 'Chapter 7 Exercises',        'Complete all exercises from Chapter 7.',             CURRENT_DATE + 2),
  ('Science',     'Lab Report – Acids & Bases',  'Write the lab report for the experiment done today.', CURRENT_DATE + 5),
  ('English',     'Essay: My Favourite Season',  'Write a 300-word essay.',                           CURRENT_DATE - 3)
) AS hw(subj, title, body, due)
JOIN public.subjects sub
  ON  sub.name      = hw.subj
  AND sub.class_id  = 'bbbbbbbb-0000-0000-0000-000000000008'
  AND sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- Discipline record
INSERT INTO public.discipline_records
  (school_id, student_id, category, severity, description, recorded_by, created_at)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'behavioral', 'verbal',
  'Disrupting class during mathematics period.',
  'aaaaaaaa-0000-0000-0000-000000000013',
  now() - INTERVAL '10 days'
);

-- ---------------------------------------------------------------
-- ADDITIONAL EXAM RESULTS FOR CLASS 8A STUDENTS (ranking peers)
-- 10 students from section 8A get results for Mid-Term 2026
-- ---------------------------------------------------------------
DO $$
DECLARE
  student_ids UUID[];
  s_idx INT;
  sub RECORD;
  base_marks INT;
BEGIN
  SELECT ARRAY(
    SELECT se.student_profile_id FROM public.student_enrollments se
    WHERE se.section_id = 'cccccccc-0000-0000-0000-000000000801'
      AND se.student_profile_id != 'dddddddd-0000-0000-0000-000000000001'
    ORDER BY se.student_profile_id
    LIMIT 10
  ) INTO student_ids;

  FOR s_idx IN 1..10 LOOP
    FOR sub IN
      SELECT id, name FROM public.subjects
      WHERE class_id = 'bbbbbbbb-0000-0000-0000-000000000008'
        AND school_id = 'aaaaaaaa-0000-0000-0000-000000000001'
    LOOP
      base_marks := 50 + (random() * 45)::INT;
      INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, marks_obtained, max_marks, grade, teacher_id)
      VALUES (
        'aaaaaaaa-0000-0000-0000-000000000001',
        'eeeeeeee-0000-0000-0000-000000000001',
        student_ids[s_idx],
        sub.id,
        base_marks,
        100,
        CASE
          WHEN base_marks >= 90 THEN 'A+'
          WHEN base_marks >= 80 THEN 'A'
          WHEN base_marks >= 70 THEN 'B+'
          WHEN base_marks >= 60 THEN 'B'
          WHEN base_marks >= 50 THEN 'C'
          ELSE 'F'
        END,
        'aaaaaaaa-0000-0000-0000-000000000013'
      );
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------
-- SECOND ACADEMIC YEAR + EXAM (for grouping test)
-- ---------------------------------------------------------------
INSERT INTO public.academic_years (id, school_id, name, start_date, end_date, status)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '2025-26',
  '2025-04-01',
  '2026-03-31',
  'archived'
);

INSERT INTO public.exams (id, school_id, academic_year_id, name, start_date, end_date)
VALUES (
  'eeeeeeee-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'Final Exam 2025', '2025-12-10', '2025-12-20'
);

-- Aryan's results in Final Exam 2025 (previous academic year)
INSERT INTO public.exam_results (school_id, exam_id, student_id, subject_id, marks_obtained, max_marks, grade, teacher_id)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-000000000002',
  'dddddddd-0000-0000-0000-000000000001',
  sub.id, m.marks, 100, m.grade,
  'aaaaaaaa-0000-0000-0000-000000000013'
FROM (VALUES
  ('Mathematics',   72::NUMERIC, 'B+'),
  ('English',       68::NUMERIC, 'B'),
  ('Science',       85::NUMERIC, 'A'),
  ('Social Studies',74::NUMERIC, 'B+'),
  ('Hindi',         65::NUMERIC, 'B')
) AS m(subj_name, marks, grade)
JOIN public.subjects sub
  ON  sub.name      = m.subj_name
  AND sub.class_id  = 'bbbbbbbb-0000-0000-0000-000000000008'
  AND sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------
-- MORE HOMEWORK FOR CLASS 8A (spread across current month for calendar)
-- ---------------------------------------------------------------
INSERT INTO public.homework (school_id, class_id, section_id, subject_id, teacher_id, title, description, due_date)
SELECT
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000008',
  'cccccccc-0000-0000-0000-000000000801',
  sub.id,
  'aaaaaaaa-0000-0000-0000-000000000013',
  hw.title, hw.body, hw.due
FROM (VALUES
  ('Mathematics', 'Quadratic Equations Practice',     'Solve problems 1-20 from textbook page 142.',            CURRENT_DATE + 1),
  ('Mathematics', 'Geometry Worksheet',               'Complete the worksheet on triangles and circles.',        CURRENT_DATE + 4),
  ('Science',     'Periodic Table Quiz Prep',         'Study groups 1-4 for the quiz.',                         CURRENT_DATE + 3),
  ('Science',     'Physics Numericals',               'Solve force and motion problems from chapter 5.',         CURRENT_DATE + 7),
  ('English',     'Book Review Submission',           'Submit review of any novel you read this month.',         CURRENT_DATE + 6),
  ('English',     'Grammar Exercises',                'Complete tenses worksheet (pages 45-47).',               CURRENT_DATE + 10),
  ('Social Studies', 'Map Work – Rivers of India',    'Mark all major rivers on the outline map.',              CURRENT_DATE + 8),
  ('Social Studies', 'History Project Draft',         'First draft of the freedom movement project.',           CURRENT_DATE + 12),
  ('Hindi',       'Nibandh – Mera Desh',             '500 shabd ka nibandh likhiye.',                          CURRENT_DATE + 9),
  ('Hindi',       'Kavita Yaad Karna',               'Learn the poem on page 78 for recitation.',              CURRENT_DATE + 11),
  ('Mathematics', 'Statistics Assignment',            'Calculate mean, median, mode for given data sets.',       CURRENT_DATE + 14),
  ('Science',     'Biology Drawing – Cell Structure', 'Draw and label a plant and animal cell.',                CURRENT_DATE + 13),
  ('English',     'Letter Writing Practice',          'Write a formal letter to the principal.',                CURRENT_DATE - 1),
  ('Hindi',       'Vyakaran Abhyas',                  'Samas aur sandhi ke 10-10 udaharan likhiye.',           CURRENT_DATE - 2)
) AS hw(subj, title, body, due)
JOIN public.subjects sub
  ON  sub.name      = hw.subj
  AND sub.class_id  = 'bbbbbbbb-0000-0000-0000-000000000008'
  AND sub.school_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------
-- FEEDBACK SAMPLES (testing both types)
-- ---------------------------------------------------------------
-- Parent → Teacher (directed to teacher1, class teacher of 8A)
INSERT INTO public.feedback (school_id, from_user_id, to_role, to_user_id, subject, message, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'teacher', 'aaaaaaaa-0000-0000-0000-000000000013',
   'Homework load concern', 'Aryan is finding it difficult to manage the amount of homework. Can we discuss?',
   'open', now() - INTERVAL '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'teacher', 'aaaaaaaa-0000-0000-0000-000000000013',
   'Extra classes request', 'Can Aryan attend extra math sessions after school hours?',
   'open', now() - INTERVAL '1 day');

-- Parent → Principal
INSERT INTO public.feedback (school_id, from_user_id, to_role, to_user_id, subject, message, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'principal', NULL,
   'Transport safety concern', 'The school bus route 3 has been overcrowded lately. Please look into it.',
   'open', now() - INTERVAL '5 days');

-- Parent → School Admin
INSERT INTO public.feedback (school_id, from_user_id, to_role, to_user_id, subject, message, status, created_at)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000030', 'school_admin', NULL,
   'Fee receipt not received', 'I paid the March fees via UPI but haven''t received the receipt yet.',
   'open', now() - INTERVAL '2 days');
-- Opens admissions for the local demo school so the Parent Mobile Admission
-- Enquiry flow (apps/mobile/app/(parent)/admission-enquiry.tsx) is
-- end-to-end testable. admission_settings had zero rows for this school —
-- admission-submit's `if (!settings?.is_open) return { reason: "closed" }`
-- (supabase/functions/admission-submit/index.ts:41-42) therefore always
-- fired, regardless of the `admissions` feature flag being on.
--
-- This mirrors exactly the INSERT the production save_admission_settings
-- RPC performs (supabase/migrations/20260803170629_admission_rpcs.sql:91-108
-- — the same RPC apps/web/app/(school)/admin/admissions/admission-settings-panel.tsx
-- calls when a school_admin/principal toggles admissions open in the UI) —
-- same columns, same ON CONFLICT target, no new mechanism introduced.
-- No application fee is configured (application_fee = 0), so the free-path
-- branch of admission-submit is exercised; the paid/Razorpay branch remains
-- untested locally, which is out of scope here.
--
-- Scoped to exactly one school id; safe to re-run (ON CONFLICT DO UPDATE).

INSERT INTO public.admission_settings (school_id, is_open, application_fee, admission_academic_year_id)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', true, 0, 'aaaaaaaa-0000-0000-0000-000000000002')
ON CONFLICT (school_id) DO UPDATE
  SET is_open = true, admission_academic_year_id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------
-- KYC DOCUMENT TYPES
-- ---------------------------------------------------------------
-- Demo School has no document_types rows after a fresh db reset, so
-- get_student_kyc_checklist() returns zero rows and the Parent Mobile
-- KYC screen shows "No KYC documents are configured for your school yet."
-- seed_document_types() inserts the seven standard Indian-school types;
-- it is idempotent (returns immediately if rows already exist).
SELECT public.seed_document_types('aaaaaaaa-0000-0000-0000-000000000001');
