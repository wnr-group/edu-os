import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Two events, both Live Quiz mode only — async quizzes never call this
// function (see notifyLiveQuizReminder/notifyLiveQuizResultsReady in
// apps/web/app/(school)/teacher/testing/[quizId]/live/notify.ts, the only
// callers):
//  - "reminder": fan out to ALL parents of students enrolled in the quiz's
//    section. Teacher-triggered from the live host screen, before starting.
//  - "results_ready": fan out to parents of students with a submitted/
//    graded attempt for this quiz. Fired once when the live session ends.
type Event = "reminder" | "results_ready";

Deno.serve(async (req: Request) => {
  // Mirrors leave-notify's explicit CORS/preflight handling (send-homework-
  // notification omits it and relies on the platform's own OPTIONS
  // short-circuit — both work, but this is the more complete reference).
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);
  const callerId = userData.user.id;

  let body: { event?: Event; quizId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { event, quizId } = body;
  if (!event || !quizId) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: quiz } = await admin
    .from("quizzes")
    .select("id, school_id, section_id, academic_year_id, mode, title")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) return json({ result: "error", reason: "not_found" }, 404);
  if (quiz.mode !== "live") return json({ result: "error", reason: "not_live_quiz" }, 400);

  const { data: testingEnabled } = await admin.rpc("feature_enabled", {
    p_school_id: quiz.school_id,
    p_key: "testing",
  });
  if (!testingEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  // Authorize: caller must teach this section (homeroom or timetable, the
  // CURRENT active academic year), or be school_admin/principal/super_admin
  // at this school. NOTE 1: explicit admin queries using callerId rather
  // than teaches_section()/get_my_role() — those rely on auth.uid()/request
  // header GUCs, which are unavailable through the service-role admin
  // client (same reasoning as send-homework-notification). NOTE 2: resolves
  // the active year via get_active_academic_year() rather than trusting
  // quiz.academic_year_id directly — a section_assignments/timetable row is
  // keyed to the CURRENT active year, and a quiz can outlive a year
  // rollover, so matching on the quiz's own stored year silently failed
  // authorization whenever the two diverged (mirrors send-homework-
  // notification's identical resolution for the same reason).
  const { data: yearId } = await admin.rpc("get_active_academic_year", {
    p_school_id: quiz.school_id,
  });
  let authorized = false;
  const { data: assignment } = await admin
    .from("section_assignments").select("id")
    .eq("section_id", quiz.section_id)
    .eq("class_teacher_id", callerId)
    .eq("academic_year_id", yearId)
    .maybeSingle();
  authorized = !!assignment;
  if (!authorized) {
    const { data: tt } = await admin
      .from("timetable").select("id")
      .eq("section_id", quiz.section_id)
      .eq("teacher_id", callerId)
      .eq("academic_year_id", yearId)
      .limit(1).maybeSingle();
    authorized = !!tt;
  }
  if (!authorized) {
    const { data: staffRole } = await admin
      .from("user_roles").select("id")
      .eq("user_id", callerId)
      .eq("school_id", quiz.school_id)
      .eq("is_active", true)
      .in("role", ["school_admin", "principal"])
      .maybeSingle();
    authorized = !!staffRole;
  }
  if (!authorized) {
    const { data: superAdmin } = await admin
      .from("user_roles").select("id")
      .eq("user_id", callerId)
      .is("school_id", null)
      .eq("role", "super_admin")
      .eq("is_active", true)
      .maybeSingle();
    authorized = !!superAdmin;
  }
  if (!authorized) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: school } = await admin
    .from("schools").select("name").eq("id", quiz.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";

  if (event === "reminder") return await notifyReminder(admin, quiz, schoolName);
  if (event === "results_ready") return await notifyResultsReady(admin, quiz, schoolName);
  return json({ error: "bad_event" }, 400);
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function notifyReminder(admin: any, quiz: any, schoolName: string): Promise<Response> {
  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("student_profile_id, student_profiles(id, full_name, parent_profile_id)")
    .eq("section_id", quiz.section_id)
    .eq("is_active", true);

  const title = schoolName;
  const messageBody = `Live quiz "${quiz.title}" is starting soon — join the waiting room now.`;

  let notified = 0;
  let pushed = 0;
  for (const row of enrollments ?? []) {
    const sp = row.student_profiles;
    if (!sp?.parent_profile_id) continue;

    const { error: insertErr } = await admin.from("notifications").insert({
      school_id: quiz.school_id,
      user_id: sp.parent_profile_id,
      student_id: sp.id,
      title,
      body: messageBody,
      type: "quiz_live_reminder",
    });
    if (insertErr) continue;
    notified++;

    const { data: parent } = await admin
      .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
    if (parent?.push_token) {
      const r = await sendExpoPush(parent.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
      } else if (r === "ok") pushed++;
    }
  }
  return json({ result: "ok", notified, pushed });
}

// deno-lint-ignore no-explicit-any
async function notifyResultsReady(admin: any, quiz: any, schoolName: string): Promise<Response> {
  const { data: attempts } = await admin
    .from("quiz_attempts")
    .select("status, student:student_profiles(id, full_name, parent_profile_id)")
    .eq("quiz_id", quiz.id)
    .in("status", ["submitted", "graded"]);

  const title = schoolName;
  const messageBody = `Results for "${quiz.title}" are ready.`;

  const notifiedParents = new Set<string>();
  let notified = 0;
  let pushed = 0;
  for (const row of attempts ?? []) {
    const sp = row.student;
    if (!sp?.parent_profile_id || notifiedParents.has(sp.parent_profile_id)) continue;
    notifiedParents.add(sp.parent_profile_id);

    const { error: insertErr } = await admin.from("notifications").insert({
      school_id: quiz.school_id,
      user_id: sp.parent_profile_id,
      student_id: sp.id,
      title,
      body: messageBody,
      type: "quiz_live_results_ready",
    });
    if (insertErr) continue;
    notified++;

    const { data: parent } = await admin
      .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
    if (parent?.push_token) {
      const r = await sendExpoPush(parent.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
      } else if (r === "ok") pushed++;
    }
  }
  return json({ result: "ok", notified, pushed });
}

async function sendExpoPush(
  token: string, title: string, body: string,
): Promise<"ok" | "device_not_registered" | "failed"> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json();
    const status = data?.data?.status;
    const errType = data?.data?.details?.error;
    if (status === "ok") return "ok";
    if (errType === "DeviceNotRegistered") return "device_not_registered";
    return "failed";
  } catch { return "failed"; }
}
