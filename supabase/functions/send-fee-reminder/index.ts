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

  let body: { student_ids?: string[] };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const studentIds = (body.student_ids ?? []).filter(Boolean);
  if (studentIds.length === 0) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  // All requested students must belong to one school; that school_id is what
  // we authorize against.
  const { data: students } = await admin
    .from("student_profiles")
    .select("id, school_id, full_name, parent_profile_id")
    .in("id", studentIds);
  if (!students || students.length === 0) return json({ result: "error", reason: "not_found" }, 404);

  const schoolIds = [...new Set(students.map((s) => s.school_id))];
  if (schoolIds.length !== 1) return json({ result: "error", reason: "mixed_schools" }, 400);
  const schoolId = schoolIds[0];

  // Authorize: super_admin unconditionally, or school_admin/principal for this school.
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
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .in("role", ["school_admin", "principal"])
      .maybeSingle();
    authorized = !!schoolRoleRow;
  }
  if (!authorized) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: outstandingRows } = await admin
    .from("student_fee_status")
    .select("student_id, outstanding")
    .in("student_id", studentIds);
  const outstandingByStudent = new Map((outstandingRows ?? []).map((r) => [r.student_id, r.outstanding]));

  const { data: school } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
  const schoolName = school?.name ?? "School";

  let sent = 0;
  for (const sp of students) {
    if (!sp.parent_profile_id) continue;

    const outstanding = outstandingByStudent.get(sp.id) ?? 0;
    const amountLabel = `₹${Number(outstanding).toLocaleString("en-IN")}`;
    const title = schoolName;
    const body = `${amountLabel} due for ${sp.full_name} — pay in the app.`;

    await admin.from("notifications").insert({
      school_id: schoolId,
      user_id: sp.parent_profile_id,
      student_id: sp.id,
      title,
      body,
      type: "fee_reminder",
    });

    const { data: parent } = await admin
      .from("profiles").select("push_token").eq("id", sp.parent_profile_id).maybeSingle();
    if (parent?.push_token) {
      const r = await sendExpoPush(parent.push_token, title, body);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", sp.parent_profile_id);
      } else if (r === "ok") sent++;
    }
  }

  return json({ result: "ok", notified: students.filter((s) => s.parent_profile_id).length, pushed: sent });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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