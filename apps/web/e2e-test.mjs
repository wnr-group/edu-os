import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Setting up E2E Test Fixtures...");
  
  let { data: schools, error: schoolErr } = await supabase.from('schools').select('id').limit(1);
  if (schoolErr) console.error("School Select Error:", schoolErr);
  if (!schools || schools.length === 0) {
    const res = await supabase.from('schools').insert({ name: 'E2E School', subdomain: 'e2e' }).select('id');
    if (res.error) console.error("School Insert Error:", res.error);
    schools = res.data;
  }
  const schoolId = schools?.[0]?.id;
  if (!schoolId) throw new Error("Could not create or find school");
  
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  async function signUp(email) {
    const { data, error } = await anonClient.auth.signUp({ email, password: 'password123' });
    if (error) throw new Error(error.message);
    // Auto-confirm isn't enabled by default in some local instances, but let's assume it works or we don't need it.
    return data;
  }

  const ts = Date.now();
  // Create Parent A
  const parentAAuth = await signUp(`parentA-${ts}@test.local`);
  const { data: parentAProf } = await supabase.from('parent_profiles').insert({ id: parentAAuth.user.id, full_name: 'Parent A', school_id: schoolId }).select().single();
  
  // Create Teacher (Assigned)
  const teacherAuth = await signUp(`teacher-${ts}@test.local`);
  const { data: teacherProf } = await supabase.from('teacher_profiles').insert({ id: teacherAuth.user.id, full_name: 'Teacher Assigned', school_id: schoolId }).select().single();
  
  // Create Teacher (Not Assigned)
  const teacherNotAssignedAuth = await signUp(`teacherNot-${ts}@test.local`);
  const { data: teacherNotAssignedProf } = await supabase.from('teacher_profiles').insert({ id: teacherNotAssignedAuth.user.id, full_name: 'Teacher Not Assigned', school_id: schoolId }).select().single();
  
  // Create Students
  const { data: studentAProf } = await supabase.from('student_profiles').insert({ school_id: schoolId, full_name: 'Student A', admission_number: 'E2E-1' }).select().single();
  const { data: studentBProf } = await supabase.from('student_profiles').insert({ school_id: schoolId, full_name: 'Student B', admission_number: 'E2E-2' }).select().single();
  
  // Link Parent A to Child A
  await supabase.from('student_parents').insert({ student_id: studentAProf.id, parent_id: parentAProf.id, relationship: 'Mother' });
  
  // Create Class/Section/Year
  const { data: year } = await supabase.from('academic_years').insert({ school_id: schoolId, name: 'E2E Year', start_date: '2026-01-01', end_date: '2026-12-31', is_active: true }).select().single();
  const { data: cls } = await supabase.from('classes').insert({ school_id: schoolId, name: 'E2E Class' }).select().single();
  const { data: sec } = await supabase.from('sections').insert({ school_id: schoolId, class_id: cls.id, name: 'E2E Section', academic_year_id: year.id }).select().single();
  
  // Enroll Students
  await supabase.from('student_enrollments').insert([
    { student_profile_id: studentAProf.id, school_id: schoolId, class_id: cls.id, section_id: sec.id, academic_year_id: year.id, roll_number: '1', is_active: true },
    { student_profile_id: studentBProf.id, school_id: schoolId, class_id: cls.id, section_id: sec.id, academic_year_id: year.id, roll_number: '2', is_active: true }
  ]);
  
  // Assign Teacher to Section
  await supabase.from('section_teachers').insert({ school_id: schoolId, section_id: sec.id, teacher_id: teacherProf.id, academic_year_id: year.id });
  
  // Create Homework
  const { data: hw } = await supabase.from('homework').insert({
    school_id: schoolId,
    section_id: sec.id,
    class_id: cls.id,
    academic_year_id: year.id,
    teacher_id: teacherProf.id,
    title: 'E2E Homework',
    description: 'Test',
    due_date: '2027-12-31'
  }).select().single();
  
  // Mock Submission File Path for Child A and Child B
  const pathA = `${schoolId}/${hw.id}/${studentAProf.id}/subA.pdf`;
  const pathB = `${schoolId}/${hw.id}/${studentBProf.id}/subB.pdf`;
  
  // Create DB Submissions
  const { data: subA } = await supabase.from('homework_submissions').insert({
    school_id: schoolId, homework_id: hw.id, student_id: studentAProf.id, submitted_by: parentAProf.id, file_path: pathA, file_name: 'subA.pdf', file_type: 'application/pdf', file_size: 100
  }).select().single();
  const { data: subB } = await supabase.from('homework_submissions').insert({
    school_id: schoolId, homework_id: hw.id, student_id: studentBProf.id, submitted_by: parentAProf.id, file_path: pathB, file_name: 'subB.pdf', file_type: 'application/pdf', file_size: 100
  }).select().single();

  // Helper to sign in and get token
  async function getToken(email) {
    const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await c.auth.signInWithPassword({ email, password: 'password123' });
    return { token: data.session?.access_token, client: c };
  }
  
  const { token: parentToken, client: parentClient } = await getToken(`parentA-${ts}@test.local`);
  const { token: teacherToken } = await getToken(`teacher-${ts}@test.local`);
  const { token: teacherNotToken } = await getToken(`teacherNot-${ts}@test.local`);

  console.log("=== 1. SIGNED URL E2E TEST ===");
  async function testSignedUrl(name, token, submissionId, expectPass) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/homework-submission-signed-url`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId })
    });
    const body = await res.json();
    const pass = expectPass ? (res.status === 200 && body.url) : (res.status !== 200 && body.error);
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: Status ${res.status} | URL: ${!!body.url} | Error: ${body.error}`);
  }

  await testSignedUrl("A. Parent A -> Child A", parentToken, subA.id, true);
  await testSignedUrl("B. Parent A -> Child B", parentToken, subB.id, false);
  await testSignedUrl("C. Teacher Assigned -> Child A", teacherToken, subA.id, true);
  await testSignedUrl("D. Teacher Not Assigned -> Child A", teacherNotToken, subA.id, false);
  await testSignedUrl("E. Anonymous Request -> Child A", null, subA.id, false);
  await testSignedUrl("F. Invalid JWT -> Child A", "eyJhbGciOi.bogus.jwt", subA.id, false);

  console.log("\n=== 2. STORAGE DELETE E2E TEST ===");
  // Upload actual files so we can test delete using service role
  await supabase.storage.from('homework-submissions').upload(pathA, "dummy content A");
  await supabase.storage.from('homework-submissions').upload(pathB, "dummy content B");

  async function testDelete(name, client, path, expectPass) {
    const { data, error } = await client.storage.from('homework-submissions').remove([path]);
    const pass = expectPass ? (data && data.length > 0 && !error) : (data?.length === 0 || error);
    console.log(`[${pass ? 'PASS' : 'FAIL'}] ${name}: Deleted=${data?.length || 0} | Error=${error?.message || 'none'}`);
  }



  await testDelete("B. Parent A deletes Child B", parentClient, pathB, false);
  await testDelete("C. Parent A manipulated path", parentClient, `${schoolId}/${hw.id}/${studentBProf.id}/../${studentAProf.id}/subB.pdf`, false);
  await testDelete("D. Anonymous delete", anonClient, pathA, false);
  await testDelete("A. Parent A deletes Child A", parentClient, pathA, true);

  console.log("\nCleaning up...");
  await supabase.auth.admin.deleteUser(parentAAuth.user.id);
  await supabase.auth.admin.deleteUser(teacherAuth.user.id);
  await supabase.auth.admin.deleteUser(teacherNotAssignedAuth.user.id);
  console.log("Done.");
}

run().catch(console.error);
