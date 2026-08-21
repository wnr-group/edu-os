import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Event-driven, fire-and-forget — invoked once by the web app right after
// publish_ptm_slot / bulk_publish_ptm_slots succeeds AND at least one slot
// was actually created (never for a call where every slot was skipped as a
// duplicate/conflict/past-dated). Section-wide fan-out, not the single-
// recipient shape of ptm-notify: mirrors send-homework-notification's
// notifyAssigned() (student_enrollments -> student_profiles.parent_profile_id,
// one notification per parent) rather than reusing ptm-notify, since there is
// no ptm_meetings row yet for an unbooked slot and there are many recipients,
// not one. ptm-notify itself is untouched by this function.
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

  let body: { section_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { section_id } = body;
  if (!section_id) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: section } = await admin
    .from("sections")
    .select("id, school_id")
    .eq("id", section_id)
    .maybeSingle();
  if (!section) return json({ result: "error", reason: "not_found" }, 404);

  const { data: ptmEnabled } = await admin.rpc("feature_enabled", { p_school_id: section.school_id, p_key: "ptm" });
  if (!ptmEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  // Re-checked here rather than trusted, same philosophy as ptm-notify: the
  // publish RPC already enforced this moments ago, this is just a guard
  // against the function being called for a section the caller has no
  // legitimate connection to. Mirrors publish_ptm_slot's own authorization —
  // same-school admin/principal/super_admin, or a teacher associated with
  // this section in the active academic year.
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role, school_id")
    .eq("user_id", callerId)
    .eq("is_active", true)
    .or(`school_id.eq.${section.school_id},school_id.is.null`);
  const roles = roleRows ?? [];
  const isStaff = roles.some((r) => r.role === "super_admin" || ((r.role === "school_admin" || r.role === "principal") && r.school_id === section.school_id));

  let isTeacher = false;
  if (!isStaff && roles.some((r) => r.role === "teacher" && r.school_id === section.school_id)) {
    const { data: yearId } = await admin.rpc("get_active_academic_year", { p_school_id: section.school_id });
    const { data: assignment } = await admin
      .from("section_assignments").select("id")
      .eq("section_id", section_id).eq("class_teacher_id", callerId).eq("academic_year_id", yearId)
      .maybeSingle();
    isTeacher = !!assignment;
    if (!isTeacher) {
      const { data: tt } = await admin
        .from("timetable").select("id")
        .eq("section_id", section_id).eq("teacher_id", callerId).eq("academic_year_id", yearId)
        .limit(1).maybeSingle();
      isTeacher = !!tt;
    }
  }
  if (!isStaff && !isTeacher) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: school } = await admin.from("schools").select("name").eq("id", section.school_id).maybeSingle();
  const schoolName = school?.name ?? "School";

  return await notifySectionParents(admin, section.school_id, section_id, schoolName);
});

// deno-lint-ignore no-explicit-any
async function notifySectionParents(admin: any, schoolId: string, sectionId: string, schoolName: string): Promise<Response> {
  const { data: enrollments } = await admin
    .from("student_enrollments")
    .select("student_profile_id, student_profiles(parent_profile_id)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  // A parent with more than one child in the same section would otherwise
  // appear once per child — dedupe to exactly one notification per parent.
  const parentIds = new Set<string>();
  for (const row of enrollments ?? []) {
    const parentId = row.student_profiles?.parent_profile_id;
    if (parentId) parentIds.add(parentId);
  }

  const title = schoolName;
  const messageBody = "New PTM slots are open — book your preferred time.";

  let sent = 0;
  for (const parentId of parentIds) {
    // student_id is intentionally NULL: this notification concerns the whole
    // section, not one specific child, and a parent may have several
    // children enrolled in it.
    await admin.from("notifications").insert({
      school_id: schoolId,
      user_id: parentId,
      student_id: null,
      title,
      body: messageBody,
      type: "ptm_slots_published",
    });

    const { data: parent } = await admin.from("profiles").select("push_token").eq("id", parentId).maybeSingle();
    if (parent?.push_token) {
      const r = await sendExpoPush(parent.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", parentId);
      } else if (r === "ok") sent++;
    }
  }
  return json({ result: "ok", notified: parentIds.size, pushed: sent });
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
