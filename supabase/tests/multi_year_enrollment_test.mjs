/**
 * Comment 10 — Multi-year enrollment query verification (CORRECTED)
 *
 * Creates a student with TWO enrollments:
 *   STALE: academic_year status='completed', is_active=false  (inserted first → lower UUID)
 *   CURRENT: academic_year status='active', is_active=true    (inserted second → higher UUID)
 *
 * The admin/teacher interventions page uses:
 *   .eq("student_profiles.student_enrollments.is_active", true)
 *   .order("academic_year_id", { referencedTable: "student_profiles.student_enrollments", ascending: false })
 *   → then reads [0]
 *
 * This test executes the equivalent SQL and verifies:
 *   A) Fixed query (is_active=true) returns ONLY the current enrollment
 *   B) Unfiltered query returns BOTH — proves the fix is necessary
 *   C) With ORDER BY academic_year_id DESC, [0] is the current enrollment
 */
import pg from 'pg';
const { Client } = pg;
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let pass = 0; let fail = 0;
function PASS(msg) { console.log(`PASS: ${msg}`); pass++; }
function FAIL(msg) { console.error(`FAIL: ${msg}`); fail++; }

async function query(client, sql, params = []) {
  return client.query(sql, params);
}

async function run() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Find school with active academic year and insights enabled
  const schoolRow = await query(db, `
    SELECT s.id AS school_id, ay.id AS active_year_id
    FROM public.schools s
    JOIN public.academic_years ay ON ay.school_id = s.id AND ay.status = 'active'
    WHERE public.feature_enabled(s.id, 'insights')
    LIMIT 1
  `);
  if (!schoolRow.rows.length) {
    console.log('SKIP: No school with active year + insights enabled');
    await db.end(); process.exit(0);
  }
  const { school_id, active_year_id } = schoolRow.rows[0];
  console.log(`Using school=${school_id}, active_year=${active_year_id}`);

  // ─── Use the existing archived academic year as the stale year ────────────
  // academic_years.status only allows: 'draft' | 'active' | 'archived'
  // The seed data includes an archived year for the demo school.
  const staleYearRes = await query(db, `
    SELECT id FROM public.academic_years
    WHERE school_id = $1 AND status = 'archived'
    LIMIT 1
  `, [school_id]);
  if (!staleYearRes.rows.length) {
    console.log('SKIP: No archived academic year found — seed may not have one');
    await db.end(); process.exit(0);
  }
  const stale_year_id = staleYearRes.rows[0].id;
  PASS(`Using existing archived academic year id=${stale_year_id} (status=archived) as stale year`);

  // ─── Create a test student profile ────────────────────────────────────────
  const studentRes = await query(db, `
    INSERT INTO public.student_profiles (school_id, full_name)
    VALUES ($1, 'TEST_MULTIYEAR')
    RETURNING id
  `, [school_id]);
  const student_id = studentRes.rows[0].id;
  PASS(`Created test student id=${student_id}`);

  // Find an existing class in this school
  const classRow = await query(db, `
    SELECT id FROM public.classes WHERE school_id = $1 LIMIT 1
  `, [school_id]);
  if (!classRow.rows.length) {
    console.log('SKIP: No class found for school');
    await query(db, `DELETE FROM public.student_profiles WHERE id=$1`, [student_id]);
    await db.end(); process.exit(0);
  }
  const class_id = classRow.rows[0].id;

  // Find an existing section for this class
  const sectionRow = await query(db, `
    SELECT id FROM public.sections WHERE class_id = $1 LIMIT 1
  `, [class_id]).catch(() => ({ rows: [] }));
  const section_id = sectionRow.rows[0]?.id || null;

  // ─── Create STALE enrollment (old year, is_active=false) ────────────────────
  const staleEnrollRes = await query(db, `
    INSERT INTO public.student_enrollments
      (school_id, student_profile_id, academic_year_id, class_id, section_id, is_active)
    VALUES ($1, $2, $3, $4, $5, false)
    RETURNING id
  `, [school_id, student_id, stale_year_id, class_id, section_id]);
  const stale_enrollment_id = staleEnrollRes.rows[0].id;
  PASS(`Created STALE enrollment id=${stale_enrollment_id} (year=${stale_year_id}, is_active=false)`);

  // ─── Create CURRENT enrollment (active year, is_active=true) ────────────────
  const activeEnrollRes = await query(db, `
    INSERT INTO public.student_enrollments
      (school_id, student_profile_id, academic_year_id, class_id, section_id, is_active)
    VALUES ($1, $2, $3, $4, $5, true)
    RETURNING id
  `, [school_id, student_id, active_year_id, class_id, section_id]);
  const active_enrollment_id = activeEnrollRes.rows[0].id;
  PASS(`Created CURRENT enrollment id=${active_enrollment_id} (year=${active_year_id}, is_active=true)`);

  // ─── QUERY A: FIXED query (is_active=true filter — the fix from Comment 10) ─
  // Mirrors page code: .eq("student_profiles.student_enrollments.is_active", true)
  const fixedQ = await query(db, `
    SELECT se.id AS enrollment_id, se.is_active, se.academic_year_id, ay.status AS year_status
    FROM public.student_profiles sp
    JOIN public.student_enrollments se ON se.student_profile_id = sp.id
      AND se.is_active = true                          -- THE FIX
    JOIN public.academic_years ay ON ay.id = se.academic_year_id
    WHERE sp.id = $1
    ORDER BY se.academic_year_id DESC                  -- THE ORDER (current year first)
  `, [student_id]);

  if (fixedQ.rows.length === 0) {
    FAIL('QUERY A: Fixed query returned 0 rows — is_active filter too strict or fixture wrong');
  } else if (fixedQ.rows.length === 1) {
    const r = fixedQ.rows[0];
    if (r.enrollment_id === active_enrollment_id && r.is_active === true) {
      PASS(`QUERY A (fixed): Returns exactly 1 enrollment — CURRENT (id=${r.enrollment_id}, year_status=${r.year_status})`);
    } else {
      FAIL(`QUERY A: Wrong enrollment: id=${r.enrollment_id}, is_active=${r.is_active}`);
    }
    if (fixedQ.rows.some(r => r.enrollment_id === stale_enrollment_id)) {
      FAIL('QUERY A: STALE enrollment visible — filter not working!');
    } else {
      PASS('QUERY A: STALE enrollment correctly excluded');
    }
  } else {
    FAIL(`QUERY A: Returned ${fixedQ.rows.length} rows — expected exactly 1`);
  }

  // ─── QUERY B: UNFILTERED (old behavior — proves the bug) ────────────────────
  const unfilteredQ = await query(db, `
    SELECT se.id AS enrollment_id, se.is_active, se.academic_year_id
    FROM public.student_profiles sp
    JOIN public.student_enrollments se ON se.student_profile_id = sp.id
    WHERE sp.id = $1
    ORDER BY se.id ASC                                  -- natural order (insertion order)
  `, [student_id]);

  if (unfilteredQ.rows.length >= 2) {
    const ids = unfilteredQ.rows.map(r => r.enrollment_id);
    const hasStale = ids.includes(stale_enrollment_id);
    const hasActive = ids.includes(active_enrollment_id);
    if (hasStale && hasActive) {
      PASS(`QUERY B (unfiltered): Returns BOTH enrollments (${unfilteredQ.rows.length} rows) — demonstrates the bug`);
    } else {
      FAIL(`QUERY B: Missing rows: stale=${hasStale}, active=${hasActive}`);
    }
    // Show that unordered [0] would be the stale one (inserted first → lower UUID)
    const first = unfilteredQ.rows[0];
    if (first.enrollment_id === stale_enrollment_id) {
      PASS(`QUERY B: Unordered [0] IS the STALE enrollment (id=${first.enrollment_id}, is_active=${first.is_active}) — confirms why [0] access was broken`);
    } else {
      console.log(`NOTE: Unordered [0] happened to be the CURRENT enrollment (DB order non-deterministic)`);
    }
  } else {
    FAIL(`QUERY B: Only ${unfilteredQ.rows.length} rows — expected 2`);
  }

  // ─── QUERY C: COMBINED filter+order (mirrors exact page behavior) ────────────
  // Page: .eq("is_active", true) + .order("academic_year_id", DESC)
  // With is_active filter, only 1 row survives → [0] is always correct.
  // The ORDER BY is defense-in-depth for edge cases (e.g. two active enrollments).
  // NOTE: seed UUIDs are fixed in non-chronological order (archived=...003 > active=...002),
  //       so ordering alone (without filter) would not give the expected result with this seed.
  //       That is why the is_active filter is the definitive fix, not ordering alone.
  const combinedQ = await query(db, `
    SELECT se.id AS enrollment_id, se.is_active, se.academic_year_id, ay.status AS year_status
    FROM public.student_profiles sp
    JOIN public.student_enrollments se ON se.student_profile_id = sp.id
      AND se.is_active = true
    JOIN public.academic_years ay ON ay.id = se.academic_year_id
    WHERE sp.id = $1
    ORDER BY se.academic_year_id DESC
  `, [student_id]);

  if (combinedQ.rows.length === 1) {
    const r = combinedQ.rows[0];
    if (r.enrollment_id === active_enrollment_id) {
      PASS(`QUERY C (combined filter+order): [0] is CURRENT enrollment (id=${r.enrollment_id}, status=${r.year_status}) — page behavior correct`);
    } else {
      FAIL(`QUERY C: [0] is not the current enrollment: id=${r.enrollment_id}`);
    }
  } else {
    FAIL(`QUERY C: Expected 1 row with combined filter+order, got ${combinedQ.rows.length}`);
  }

  // ─── CLEANUP ─────────────────────────────────────────────────────────────────
  await query(db, `DELETE FROM public.student_enrollments WHERE student_profile_id=$1`, [student_id]);
  await query(db, `DELETE FROM public.student_profiles WHERE id=$1`, [student_id]);
  // NOTE: stale_year_id is a pre-existing seed row — do not delete it

  await db.end();
  console.log(`\n=== MULTI-YEAR ENROLLMENT: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
