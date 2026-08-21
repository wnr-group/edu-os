import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Event-driven, on-demand — invoked fire-and-forget by the web app right
// after schedule_ptm_meeting / reschedule_ptm_meeting / cancel_ptm_meeting
// succeed. Mirrors leave-notify/index.ts exactly: JWT-authenticated caller
// check, service-role client for the privileged reads/writes, dual-write to
// notifications + best-effort Expo push.
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

  let body: { meeting_id?: string; event?: "scheduled" | "rescheduled" | "cancelled" };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { meeting_id, event } = body;
  if (!meeting_id || !event) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: meeting } = await admin
    .from("ptm_meetings")
    .select("id, school_id, teacher_id, student_id, parent_id, scheduled_date, start_time, meeting_mode, location, status, created_by, cancelled_by")
    .eq("id", meeting_id)
    .maybeSingle();
  if (!meeting) return json({ result: "error", reason: "not_found" }, 404);
  if (!meeting.parent_id) return json({ result: "error", reason: "no_parent_linked" }, 422);

  const { data: ptmEnabled } = await admin.rpc("feature_enabled", { p_school_id: meeting.school_id, p_key: "ptm" });
  if (!ptmEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  // Caller must be someone the corresponding RPC would itself have allowed
  // to act on this meeting — the meeting's own teacher, or a same-school
  // school_admin/principal/super_admin (mirrors schedule_ptm_meeting /
  // reschedule_ptm_meeting / cancel_ptm_meeting's own authorization in
  // ptm_rpcs.sql). Re-checked here rather than trusting a "who did this"
  // column because reschedule/cancel don't record one — this is not the
  // security boundary itself (the RPC already enforced that moments ago),
  // just a guard against notify being called for a meeting the caller has
  // no legitimate connection to.
  const isTeacher = callerId === meeting.teacher_id;
  let isStaff = false;
  if (!isTeacher) {
    // super_admin holds a platform-level role row with school_id IS NULL,
    // not scoped to this school — checked separately from school_admin/principal.
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", callerId)
      .eq("is_active", true)
      .or(`school_id.eq.${meeting.school_id},school_id.is.null`)
      .in("role", ["super_admin", "school_admin", "principal"]);
    isStaff = (roleRows ?? []).some((r) => r.role === "super_admin" || r.school_id === meeting.school_id);
  }
  if (!isTeacher && !isStaff) {
    return json({ result: "error", reason: "not_authorized" }, 403);
  }

  const { data: student } = await admin.from("student_profiles").select("full_name").eq("id", meeting.student_id).maybeSingle();
  const { data: teacherProfile } = await admin.from("profiles").select("full_name").eq("id", meeting.teacher_id).maybeSingle();
  const { data: school } = await admin.from("schools").select("name").eq("id", meeting.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";
  const dateLabel = formatDateTime(meeting.scheduled_date, meeting.start_time);
  const whereLabel = meeting.meeting_mode === "online" ? "online" : (meeting.location || "in person");

  let messageBody: string;
  let type: string;
  if (event === "scheduled") {
    type = "ptm_scheduled";
    messageBody = `PTM for ${student?.full_name ?? "your child"} with ${teacherProfile?.full_name ?? "the teacher"} — ${dateLabel}, ${whereLabel}.`;
  } else if (event === "rescheduled") {
    type = "ptm_rescheduled";
    messageBody = `PTM for ${student?.full_name ?? "your child"} moved to ${dateLabel}.`;
  } else {
    if (meeting.status !== "cancelled") return json({ result: "error", reason: "not_cancelled" }, 422);
    type = "ptm_cancelled";
    messageBody = `PTM for ${student?.full_name ?? "your child"} on ${dateLabel} was cancelled.`;
  }

  return await deliver(admin, meeting.school_id, meeting.parent_id, meeting.student_id, schoolName, messageBody, type);
});

function formatDateTime(date: string, time: string): string {
  const d = new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${d}, ${time.slice(0, 5)}`;
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
