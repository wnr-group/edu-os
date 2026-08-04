import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req: Request) => {
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

  let body: { leave_id?: string; event?: "requested" | "decided" };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { leave_id, event } = body;
  if (!leave_id || !event) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: lr } = await admin
    .from("leave_requests")
    .select("id, school_id, student_id, from_date, to_date, status, decision_note, requested_by, decided_by")
    .eq("id", leave_id)
    .maybeSingle();
  if (!lr) return json({ result: "error", reason: "not_found" }, 404);

  const { data: sp } = await admin
    .from("student_profiles")
    .select("full_name, parent_profile_id")
    .eq("id", lr.student_id)
    .maybeSingle();
  if (!sp) return json({ result: "error", reason: "student_not_found" }, 404);

  const { data: school } = await admin.from("schools").select("name").eq("id", lr.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";
  const dateLabel = formatRange(lr.from_date, lr.to_date);

  if (event === "requested") {
    if (lr.requested_by !== callerId) return json({ result: "error", reason: "not_authorized" }, 403);

    const { data: yearId } = await admin.rpc("get_active_academic_year", { p_school_id: lr.school_id });
    const { data: enrollment } = await admin
      .from("student_enrollments")
      .select("section_id")
      .eq("student_profile_id", lr.student_id)
      .eq("academic_year_id", yearId)
      .eq("is_active", true)
      .maybeSingle();
    if (!enrollment?.section_id) return json({ result: "error", reason: "no_section" }, 422);

    const { data: assignment } = await admin
      .from("section_assignments")
      .select("class_teacher_id")
      .eq("section_id", enrollment.section_id)
      .eq("academic_year_id", yearId)
      .maybeSingle();
    if (!assignment?.class_teacher_id) return json({ result: "error", reason: "no_class_teacher" }, 422);

    const title = schoolName;
    const messageBody = `${sp.full_name} — leave request for ${dateLabel} needs your approval.`;
    return await deliver(admin, lr.school_id, assignment.class_teacher_id, lr.student_id, title, messageBody, "leave_requested");
  }

  if (event === "decided") {
    if (!sp.parent_profile_id) return json({ result: "error", reason: "no_parent_linked" }, 422);
    if (lr.status !== "approved" && lr.status !== "rejected") return json({ result: "error", reason: "not_decided" }, 422);
    if (lr.decided_by !== callerId) return json({ result: "error", reason: "not_authorized" }, 403);

    const title = schoolName;
    const messageBody = lr.status === "approved"
      ? `${sp.full_name}'s leave for ${dateLabel} was approved — marked Excused.`
      : `${sp.full_name}'s leave for ${dateLabel} was declined${lr.decision_note ? `: ${lr.decision_note}` : "."}`;
    return await deliver(admin, lr.school_id, sp.parent_profile_id, lr.student_id, title, messageBody, "leave_decided");
  }

  return json({ error: "bad_event" }, 400);
});

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (from === to) return f;
  const t = new Date(to + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${f}–${t}`;
}

async function deliver(
  admin: ReturnType<typeof createClient>,
  schoolId: string, recipientId: string, studentId: string,
  title: string, body: string, type: string,
): Promise<Response> {
  await admin.from("notifications").insert({ school_id: schoolId, user_id: recipientId, student_id: studentId, title, body, type });

  const { data: recipient } = await admin.from("profiles").select("push_token").eq("id", recipientId).maybeSingle();
  let result: "sent" | "recorded_no_app" = "recorded_no_app";
  if (recipient?.push_token) {
    const r = await sendExpoPush(recipient.push_token, title, body);
    if (r === "device_not_registered") {
      await admin.from("profiles").update({ push_token: null }).eq("id", recipientId);
    } else if (r === "ok") {
      result = "sent";
    }
  }
  return json({ result });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

async function sendExpoPush(token: string, title: string, body: string): Promise<"ok" | "device_not_registered" | "failed"> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
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