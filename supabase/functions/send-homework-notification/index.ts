import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Two events:
//  - "assigned": fan out to ALL parents of students enrolled in the homework's
//    section. Called once when a teacher publishes homework.
//  - "reviewed": notify the ONE parent of the reviewed student. Called right
//    after review_homework() succeeds.
type Event = "assigned" | "reviewed";

Deno.serve(async (req: Request) => {
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

  let body: { event?: Event; homeworkId?: string; studentId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { event, homeworkId, studentId } = body;
  if (!event || !homeworkId) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: hw } = await admin
    .from("homework")
    .select("id, school_id, section_id, title, due_date")
    .eq("id", homeworkId)
    .maybeSingle();
  if (!hw) return json({ result: "error", reason: "not_found" }, 404);

  const { data: homeworkEnabled } = await admin.rpc("feature_enabled", {
    p_school_id: hw.school_id,
    p_key: "homework",
  });
  if (!homeworkEnabled) return json({ result: "error", reason: "module_disabled" }, 403);
  // Authorize: caller must teach this section (homeroom or timetable, active year).
  // NOTE: explicit admin queries using callerId rather than the
  // teaches_homework_section RPC — that RPC relies on auth.uid(), which is NULL
  // when invoked through the service-role admin client, so it would always deny.
  const { data: yearId } = await admin.rpc("get_active_academic_year", {
    p_school_id: hw.school_id,
  });
  const { data: assignment } = await admin
    .from("section_assignments").select("id")
    .eq("section_id", hw.section_id)
    .eq("class_teacher_id", callerId)
    .eq("academic_year_id", yearId)
    .maybeSingle();
  let authorized = !!assignment;
  if (!authorized) {
    const { data: tt } = await admin
      .from("timetable").select("id")
      .eq("section_id", hw.section_id)
      .eq("teacher_id", callerId)
      .eq("academic_year_id", yearId)
      .limit(1).maybeSingle();
    authorized = !!tt;
  }
  if (!authorized) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: school } = await admin
    .from("schools").select("name").eq("id", hw.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";

  if (event === "assigned") {
    return await notifyAssigned(admin, hw, schoolName);
  }
  if (event === "reviewed") {
    if (!studentId) return json({ error: "missing_student" }, 400);
    return await notifyReviewed(admin, hw, schoolName, studentId);
  }
  return json({ error: "bad_event" }, 400);
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function notifyAssigned(admin: any, hw: any, schoolName: string): Promise<Response> {
  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("student_profile_id, student_profiles(id, full_name, parent_profile_id)")
    .eq("section_id", hw.section_id)
    .eq("is_active", true);

  const dateLabel = new Date(hw.due_date + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "short",
  });
  const title = schoolName;
  const messageBody = `New homework: ${hw.title} (due ${dateLabel}).`;

  let sent = 0;
  for (const row of enrollments ?? []) {
    const sp = row.student_profiles;
    if (!sp?.parent_profile_id) continue;

    await admin.from("notifications").insert({
      school_id: hw.school_id,
      user_id: sp.parent_profile_id,
      student_id: sp.id,
      title,
      body: messageBody,
      type: "homework_assigned",
    });

    const { data: parent } = await admin
      .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
    if (parent?.push_token) {
      const r = await sendExpoPush(parent.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
      } else if (r === "ok") sent++;
    }
  }
  return json({ result: "ok", pushed: sent });
}

// deno-lint-ignore no-explicit-any
async function notifyReviewed(admin: any, hw: any, schoolName: string, studentId: string): Promise<Response> {
  const { data: sp } = await admin
    .from("student_profiles")
    .select("id, full_name, parent_profile_id")
    .eq("id", studentId)
    .maybeSingle();
  if (!sp?.parent_profile_id) return json({ result: "error", reason: "no_parent_linked" }, 422);

  const title = schoolName;
  const messageBody = `Your child's homework "${hw.title}" has been reviewed by the teacher.`;

  await admin.from("notifications").insert({
    school_id: hw.school_id,
    user_id: sp.parent_profile_id,
    student_id: sp.id,
    title,
    body: messageBody,
    type: "homework_reviewed",
  });

  const { data: parent } = await admin
    .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
  let result = "recorded_no_app";
  if (parent?.push_token) {
    const r = await sendExpoPush(parent.push_token, title, messageBody);
    if (r === "device_not_registered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
    } else if (r === "ok") result = "sent";
  }
  return json({ result });
}

async function sendExpoPush(
  token: string, title: string, body: string,
): Promise<"ok" | "device_not_registered" | "failed"> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
    });
    const data = await res.json();
    const status = data?.data?.status;
    const errType = data?.data?.details?.error;
    if (status === "ok") return "ok";
    if (errType === "DeviceNotRegistered") return "device_not_registered";
    return "failed";
  } catch { return "failed"; }
}
