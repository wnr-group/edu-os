import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Fire-and-forget, called once per public.feedback row right after it's
// inserted. One function, two shapes depending on how the row itself was
// addressed — the row is the source of truth, not the request body:
//  - to_role IN ('school_admin','principal') AND to_user_id IS NULL
//    (Contact Management — mobile inserts one row per role) -> fan out to
//    every same-school user holding that role.
//  - to_role = 'teacher' AND to_user_id IS NOT NULL (Message Teacher,
//    already resolved to one specific teacher client-side) -> notify that
//    one teacher only.
// A row that's neither (e.g. a legacy to_role='teacher' with a null
// to_user_id) has no valid recipient and is intentionally left un-notified
// rather than guessed at.
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

  let body: { feedback_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { feedback_id } = body;
  if (!feedback_id) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: fb } = await admin
    .from("feedback")
    .select("id, school_id, from_user_id, to_role, to_user_id, subject")
    .eq("id", feedback_id)
    .maybeSingle();
  if (!fb) return json({ result: "error", reason: "not_found" }, 404);
  // Re-checked here rather than trusted — same guard-not-security-boundary
  // philosophy as every other *-notify function in this codebase.
  if (fb.from_user_id !== callerId) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: feedbackEnabled } = await admin.rpc("feature_enabled", { p_school_id: fb.school_id, p_key: "feedback" });
  if (!feedbackEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  const [{ data: school }, { data: fromProfile }] = await Promise.all([
    admin.from("schools").select("name").eq("id", fb.school_id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", callerId).maybeSingle(),
  ]);
  const title = school?.name ?? "School";
  const parentName = fromProfile?.full_name ?? "A parent";

  let recipientIds: string[] = [];
  let messageBody: string;
  let type: string;

  if (fb.to_role === "teacher" && fb.to_user_id) {
    // fb.to_user_id is a client-supplied claim, not a permission — the
    // feedback_insert policy only constrains school_id and the feature
    // flag, so nothing on the way in stops a client from naming an
    // arbitrary uuid here. Confirm the named user actually holds an active
    // teacher role in this school before fanning out a notification/push
    // to them.
    const { data: recipient } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", fb.to_user_id)
      .eq("school_id", fb.school_id)
      .eq("role", "teacher")
      .eq("is_active", true)
      .maybeSingle();
    if (!recipient) return json({ result: "error", reason: "no_valid_recipient" }, 422);

    recipientIds = [fb.to_user_id];
    messageBody = `${parentName}: ${fb.subject}`;
    type = "message_teacher";
  } else if ((fb.to_role === "school_admin" || fb.to_role === "principal") && !fb.to_user_id) {
    // Contact Management inserts one row per staff role (this function runs
    // once per row) — super_admin isn't tied to fb.to_role at all (their own
    // user_roles row is school_id IS NULL, platform-wide), so it's included
    // on only ONE of the two calls (arbitrarily, the principal-row one) to
    // avoid notifying them twice for a single parent submission.
    const { data: staff } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("is_active", true)
      .or(
        fb.to_role === "principal"
          ? `and(school_id.eq.${fb.school_id},role.eq.principal),role.eq.super_admin`
          : `and(school_id.eq.${fb.school_id},role.eq.school_admin)`
      );
    recipientIds = (staff ?? []).map((s) => s.user_id);
    messageBody = `${parentName}: ${fb.subject}`;
    type = "feedback_contact";
  } else {
    return json({ result: "error", reason: "no_valid_recipient" }, 422);
  }

  let notified = 0;
  for (const recipientId of recipientIds) {
    await admin.from("notifications").insert({
      school_id: fb.school_id, user_id: recipientId, title, body: messageBody,
      type, entity_type: "feedback", entity_id: fb.id,
    });
    notified++;

    const { data: recipient } = await admin.from("profiles").select("push_token").eq("id", recipientId).maybeSingle();
    if (recipient?.push_token) {
      const r = await sendExpoPush(recipient.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", recipientId);
      }
    }
  }
  return json({ result: "ok", notified });
});

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
