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

  let body: { exam_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { exam_id } = body;
  if (!exam_id) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: exam } = await admin
    .from("exams")
    .select("id, school_id, name, datesheet_published_at")
    .eq("id", exam_id)
    .maybeSingle();
  if (!exam) return json({ result: "error", reason: "not_found" }, 404);

// Authorize: super_admin unconditionally, or school_admin/principal scoped to
  // this exam's school — same shape as every other check in this epic. A
  // super_admin's own user_roles row has school_id = NULL (global, not
  // school-scoped), so it must be checked separately, not folded into the
  // school-scoped query below.
  const { data: superAdminRole } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "super_admin")
    .eq("is_active", true)
    .maybeSingle();

  let authorized = !!superAdminRole;
  if (!authorized) {
    const { data: schoolRoleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("school_id", exam.school_id)
      .eq("is_active", true)
      .in("role", ["school_admin", "principal"])
      .maybeSingle();
    authorized = !!schoolRoleRow;
  }

  if (!authorized) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: school } = await admin.from("schools").select("name").eq("id", exam.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";

  const isFirstPublish = exam.datesheet_published_at === null;

  // Affected classes: all classes with a slot (first publish), or only dirty ones (subsequent).
  const { data: allSlots } = await admin
    .from("exam_schedule_slots")
    .select("class_id, is_dirty, subject_id, exam_date")
    .eq("exam_id", exam_id);

  const affectedClassIds = isFirstPublish
    ? [...new Set((allSlots ?? []).map((s) => s.class_id))]
    : [...new Set((allSlots ?? []).filter((s) => s.is_dirty).map((s) => s.class_id))];

  if (isFirstPublish) {
    await admin.from("exams").update({ datesheet_published_at: new Date().toISOString() }).eq("id", exam_id);
  }

  let notified = 0;
  for (const classId of affectedClassIds) {
    const { data: className } = await admin.from("classes").select("name").eq("id", classId).maybeSingle();

    const dirtySubjectNames = isFirstPublish
      ? null
      : (allSlots ?? [])
          .filter((s) => s.class_id === classId && s.is_dirty)
          .map((s) => s.subject_id);

    const title = schoolName;
    const body = isFirstPublish
      ? `Class ${className?.name ?? ""}: ${exam.name} datesheet is out.`
      : `Class ${className?.name ?? ""}: ${exam.name} datesheet updated.`;

    const { data: enrollments } = await admin
      .from("student_enrollments")
      .select("student_profile_id, student_profiles(id, parent_profile_id)")
      .eq("class_id", classId)
      .eq("is_active", true);

    for (const row of enrollments ?? []) {
      const sp = (row as any).student_profiles;
      if (!sp?.parent_profile_id) continue;

      await admin.from("notifications").insert({
        school_id: exam.school_id,
        user_id: sp.parent_profile_id,
        student_id: sp.id,
        title,
        body,
        type: "exam_datesheet",
      });

      const { data: parent } = await admin
        .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
      if (parent?.push_token) {
        const r = await sendExpoPush(parent.push_token, title, body);
        if (r === "device_not_registered") {
          await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
        } else if (r === "ok") notified++;
      }
    }
  }

  // Clear dirty flags + stamp last-notified, scoped to the affected classes.
  if (affectedClassIds.length > 0) {
    await admin
      .from("exam_schedule_slots")
      .update({ is_dirty: false })
      .eq("exam_id", exam_id)
      .in("class_id", affectedClassIds);
  }
  await admin.from("exams").update({ datesheet_last_notified_at: new Date().toISOString() }).eq("id", exam_id);

  return json({ result: "ok", affected_classes: affectedClassIds.length, notified });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function sendExpoPush(token: string, title: string, body: string): Promise<"ok" | "device_not_registered" | "failed"> {
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