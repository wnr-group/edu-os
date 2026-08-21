import { createClient } from "jsr:@supabase/supabase-js@2";

// Mobile-callable signed-URL endpoint for a parent's own child's KYC
// document. Modeled on send-homework-notification/index.ts's bearer-JWT
// pattern: validate the caller's own JWT with the anon-key client, then use
// the service-role client for the authorized lookup (RLS on kyc_documents
// only grants SELECT of school-scoped rows, not the parent-of-child
// narrowing this endpoint enforces explicitly). Parent-only — staff/teacher
// viewing continues to go through the existing web route.
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

  let body: { documentId?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const documentId = body.documentId;
  if (!documentId) return json({ error: "missing_document_id" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: doc } = await admin
    .from("kyc_documents")
    .select("subject_id, file_path")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return json({ error: "not_found" }, 404);

  const { data: ownChild } = await admin
    .from("student_profiles")
    .select("id")
    .eq("id", doc.subject_id)
    .eq("parent_profile_id", callerId)
    .maybeSingle();
  if (!ownChild) return json({ error: "forbidden" }, 403);

  const { data: signed, error: signError } = await admin.storage
    .from("kyc-docs")
    .createSignedUrl(doc.file_path, 60);
  if (signError || !signed) return json({ error: "sign_failed" }, 500);

  return json({ url: signed.signedUrl });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}
