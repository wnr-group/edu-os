import { createClient } from "jsr:@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Fire-and-forget, called once by the web admin/principal student-documents
// tab right after upsert_kyc_document succeeds — mirrors leave-notify's
// shape. upsert_kyc_document itself already restricts callers to
// super_admin/school_admin/principal, so the "uploader" here is always
// staff too; this notifies every OTHER same-school admin/principal that a
// document is awaiting their review (excludes the uploader — notifying
// yourself that you just uploaded something is noise, not signal).
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

  let body: { document_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { document_id } = body;
  if (!document_id) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: doc } = await admin
    .from("kyc_documents")
    .select("id, school_id, subject_id, document_type_id, status, uploaded_by")
    .eq("id", document_id)
    .maybeSingle();
  if (!doc) return json({ result: "error", reason: "not_found" }, 404);
  if (doc.status !== "submitted") return json({ result: "error", reason: "not_pending" }, 422);
  // Re-checked here rather than trusted — the caller must be the one who
  // actually just uploaded this document, same guard-not-security-boundary
  // philosophy as every other *-notify function in this codebase.
  if (doc.uploaded_by !== callerId) return json({ result: "error", reason: "not_authorized" }, 403);

  const { data: kycEnabled } = await admin.rpc("feature_enabled", { p_school_id: doc.school_id, p_key: "kyc_documents" });
  if (!kycEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  const [{ data: school }, { data: student }, { data: docType }] = await Promise.all([
    admin.from("schools").select("name").eq("id", doc.school_id).maybeSingle(),
    admin.from("student_profiles").select("full_name").eq("id", doc.subject_id).maybeSingle(),
    admin.from("document_types").select("name").eq("id", doc.document_type_id).maybeSingle(),
  ]);
  const title = school?.name ?? "School";
  const messageBody = `${docType?.name ?? "Document"} for ${student?.full_name ?? "a student"} is awaiting review.`;

  // super_admin's own user_roles row is school_id IS NULL (platform-wide,
  // not scoped to any one school) — matched separately from the
  // same-school school_admin/principal branch, same shape used everywhere
  // else in this codebase that needs both.
  const { data: staff } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("is_active", true)
    .or(`and(school_id.eq.${doc.school_id},role.in.(school_admin,principal)),role.eq.super_admin`)
    .neq("user_id", callerId);

  let notified = 0;
  for (const s of staff ?? []) {
    await admin.from("notifications").insert({
      school_id: doc.school_id, user_id: s.user_id, title, body: messageBody,
      type: "kyc_document_submitted", entity_type: "kyc_document", entity_id: doc.id,
    });
    notified++;

    const { data: recipient } = await admin.from("profiles").select("push_token").eq("id", s.user_id).maybeSingle();
    if (recipient?.push_token) {
      const r = await sendExpoPush(recipient.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", s.user_id);
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
