import { createClient } from "jsr:@supabase/supabase-js@2";

// Signed-URL endpoint for a homework submission file. Two authorized
// callers, unlike kyc-signed-url's parent-only case: the submission's own
// parent, OR a teacher assigned to the homework's section
// (teaches_homework_section — existing function, unmodified, reused as-is).
// Accepts only submissionId; homework_id/student_id/school_id/file_path are
// all derived server-side from the row, never trusted from the client.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // User-JWT client: used to call is_parent_of_student/teaches_homework_section
  // so auth.uid() inside those SECURITY DEFINER functions resolves to the
  // actual caller, exactly as it does when the mobile/web app calls them
  // directly via supabase.rpc(...).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

  let body: { submissionId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const submissionId = body.submissionId;
  if (!submissionId) return json({ error: "missing_submission_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: submission } = await admin
    .from("homework_submissions")
    .select("homework_id, student_id, file_path")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return json({ error: "not_found" }, 404);

  const { data: isParent } = await userClient.rpc("is_parent_of_student", {
    p_student_id: submission.student_id,
  });
  const { data: isTeacher } = await userClient.rpc("teaches_homework_section", {
    p_homework_id: submission.homework_id,
  });
  // Also allow the teacher who created/owns the homework — teaches_homework_section
  // checks timetable/section_assignments, which may not include the homework's own
  // teacher_id in all school setups.
  const { data: hw } = await admin
    .from("homework")
    .select("teacher_id")
    .eq("id", submission.homework_id)
    .maybeSingle();
  const isHomeworkTeacher = hw?.teacher_id === userData.user.id;
  if (!isParent && !isTeacher && !isHomeworkTeacher) return json({ error: "forbidden" }, 403);

  const { data: signed, error: signError } = await admin.storage
    .from("homework-submissions")
    .createSignedUrl(submission.file_path, 60);
  if (signError || !signed) return json({ error: "storage_object_missing" }, 500);

  return json({ url: signed.signedUrl });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
