import pg from 'pg';
import http from 'http';

const { Client } = pg;

async function run() {
  const c = new Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await c.connect();

  const schoolId = 'aaaaaaaa-0000-0000-0000-000000000001';
  const studentId = 'dddddddd-0000-0000-0000-000000000001';
  const runDate = '2026-08-26';

  console.log('1. Cleaning up previous test records...');
  await c.query('DELETE FROM public.insight_run_failures');
  await c.query('DELETE FROM public.insight_runs WHERE run_date = $1', [runDate]);
  await c.query('DELETE FROM public.intervention_academic_evidence');
  await c.query('DELETE FROM public.intervention_parent_notifications');
  await c.query('DELETE FROM public.interventions WHERE student_id = $1', [studentId]);
  await c.query('DELETE FROM public.student_risk_snapshots WHERE student_id = $1', [studentId]);

  console.log('2. Fetching student section & academic year...');
  const enr = await c.query(
    'SELECT section_id, academic_year_id FROM public.student_enrollments WHERE student_profile_id = $1 AND is_active = true LIMIT 1',
    [studentId]
  );
  const sectionId = enr.rows[0].section_id;
  const academicYearId = enr.rows[0].academic_year_id;

  console.log('3. Seeding 5 consecutive absences (HIGH attendance risk)...');
  for (let i = 1; i <= 5; i++) {
    const d = `2026-08-${(26 - i).toString().padStart(2, '0')}`;
    await c.query(
      `INSERT INTO public.attendance_records (school_id, student_id, section_id, academic_year_id, date, session, status, marked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ON CONSTRAINT attendance_records_student_date_session_key
       DO UPDATE SET status = EXCLUDED.status`,
      [schoolId, studentId, sectionId, academicYearId, d, 'FULL_DAY', 'absent', 'aaaaaaaa-0000-0000-0000-000000000013']
    );
  }

  const sec = await c.query('SELECT class_id FROM public.sections WHERE id = $1', [sectionId]);
  const classId = sec.rows[0].class_id;
  const subs = await c.query('SELECT id, name FROM public.subjects WHERE school_id = $1 AND class_id = $2 ORDER BY name LIMIT 2', [schoolId, classId]);
  const mathSubId = subs.rows[0].id;
  const engSubId = subs.rows[1].id;
  console.log(`4. Seeding declining exam marks for ${subs.rows[0].name} & ${subs.rows[1].name} (HIGH academic risk)...`);

  // Clear previous exam results for this student
  await c.query('DELETE FROM public.exam_results WHERE student_id = $1', [studentId]);

  for (let i = 1; i <= 4; i++) {
    const examRes = await c.query(
      `INSERT INTO public.exams (school_id, academic_year_id, name, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [schoolId, academicYearId, `Test Exam ${i}`, `2026-08-0${i}`, `2026-08-0${i}`]
    );
    const examId = examRes.rows[0].id;

    // Mathematics: declining from 40 down to 16
    await c.query(
      `INSERT INTO public.exam_results (school_id, student_id, subject_id, exam_id, marks_obtained, max_marks, teacher_id)
       VALUES ($1, $2, $3, $4, $5, 100, $6)`,
      [schoolId, studentId, mathSubId, examId, 32 - i * 6, 'aaaaaaaa-0000-0000-0000-000000000013']
    );

    // English: failing marks 25
    await c.query(
      `INSERT INTO public.exam_results (school_id, student_id, subject_id, exam_id, marks_obtained, max_marks, teacher_id)
       VALUES ($1, $2, $3, $4, $5, 100, $6)`,
      [schoolId, studentId, engSubId, examId, 25 - i * 4, 'aaaaaaaa-0000-0000-0000-000000000013']
    );
  }

  const offsetRes = await c.query(
    `SELECT (st_offset - 1) as student_offset FROM (
       SELECT row_number() OVER (ORDER BY student_profile_id) as st_offset, student_profile_id
       FROM public.student_enrollments
       WHERE school_id = $1 AND is_active = true
     ) sub WHERE student_profile_id = $2`,
    [schoolId, studentId]
  );
  const studentOffset = parseInt(offsetRes.rows[0].student_offset, 10);
  console.log(`5. Invoking Edge Function for student chunk (offset ${studentOffset})...`);
  const data = JSON.stringify({ school_id: schoolId, run_date: runDate, offset: studentOffset, limit: 1 });
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  const resBody = await new Promise((resolve, reject) => {
    const req = http.request('http://127.0.0.1:54321/functions/v1/insights-recompute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': 'Bearer ' + token
      }
    }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });

  console.log('Edge Function Status:', resBody.status);
  console.log('Edge Function Body:', resBody.body);

  console.log('6. Verifying database state...');
  const snaps = await c.query(
    'SELECT id, kind, score, band, factors, recommended_action, subject_id FROM public.student_risk_snapshots WHERE student_id = $1 AND computed_for = $2',
    [studentId, runDate]
  );
  console.log('Snapshots created count:', snaps.rows.length);
  for (const s of snaps.rows) {
    console.log(`  - Snapshot: kind=${s.kind}, band=${s.band}, score=${s.score}, subject=${s.subject_id}`);
  }

  const interv = await c.query(
    'SELECT id, kind, status, severity_band, due_date, assignee_id, assigned_via, title FROM public.interventions WHERE student_id = $1',
    [studentId]
  );
  console.log('Interventions created count:', interv.rows.length);
  for (const i of interv.rows) {
    console.log(`  - Intervention: kind=${i.kind}, status=${i.status}, severity=${i.severity_band}, due_date=${i.due_date.toISOString().split('T')[0]}, assignee=${i.assignee_id}, via=${i.assigned_via}, title=${i.title}`);
  }

  const evidence = await c.query(
    'SELECT * FROM public.intervention_academic_evidence'
  );
  console.log('Academic evidence rows count:', evidence.rows.length);

  await c.end();
}

run().catch(console.error);
