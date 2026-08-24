import { createClient } from "jsr:@supabase/supabase-js@2";

// Fire-and-forget, called once by the web notification center right after
// an action RPC succeeds (verify_documents/reject_document) or a feedback
// response is saved. Multiple staff can be notified about the SAME entity
// (kyc-document-notify/feedback-notify fan out one row per recipient) — this
// is the one place that resolves every one of those rows together, so
// acting once (by anyone authorized) closes it for everyone, instead of
// leaving stale Approve/Reject buttons live on rows nobody will ever click
// again. Never trusts a client-supplied "who acted" label — always re-reads
// the entity's own actor column (kyc_documents.verified_by /
// feedback.responded_by) and resolves the role from user_roles, same
// re-check-don't-trust philosophy as every other *-notify function here.
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

  let body: { entity_type?: "kyc_document" | "feedback" | "leave_request"; entity_id?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { entity_type, entity_id } = body;
  if (!entity_type || !entity_id) return json({ error: "missing_fields" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  if (entity_type === "kyc_document") return await resolveKycDocument(admin, entity_id);
  if (entity_type === "feedback") return await resolveFeedback(admin, entity_id);
  if (entity_type === "leave_request") return await resolveLeaveRequest(admin, entity_id);
  return json({ error: "bad_entity_type" }, 400);
});

// deno-lint-ignore no-explicit-any
async function resolveLeaveRequest(admin: any, leaveId: string): Promise<Response> {
  const { data: lr } = await admin
    .from("leave_requests")
    .select("id, school_id, status, decided_by")
    .eq("id", leaveId)
    .maybeSingle();
  if (!lr) return json({ result: "error", reason: "not_found" }, 404);
  if (lr.status !== "approved" && lr.status !== "rejected") return json({ result: "no_op" });
  if (!lr.decided_by) return json({ result: "no_op" });

  const label = await roleLabelFor(admin, lr.decided_by, lr.school_id);
  const newBody = lr.status === "approved" ? `Leave request approved by ${label}.` : `Leave request rejected by ${label}.`;

  const { data: updated } = await admin
    .from("notifications")
    .update({ body: newBody, is_read: true })
    .eq("entity_type", "leave_request")
    .eq("entity_id", leaveId)
    .select("id");

  return json({ result: "ok", resolved: updated?.length ?? 0 });
}

async function roleLabelFor(admin: ReturnType<typeof createClient>, userId: string, schoolId: string): Promise<string> {
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("is_active", true)
    .or(`school_id.eq.${schoolId},school_id.is.null`);
  const precedence = ["super_admin", "school_admin", "principal", "teacher"];
  const roleNames = (roles ?? []).map((r) => r.role as string);
  const top = precedence.find((r) => roleNames.includes(r)) ?? roleNames[0] ?? "";
  const labels: Record<string, string> = {
    super_admin: "Super Admin", school_admin: "School Admin", principal: "Principal", teacher: "Class Teacher",
  };
  return labels[top] ?? top;
}

// deno-lint-ignore no-explicit-any
async function resolveKycDocument(admin: any, documentId: string): Promise<Response> {
  const { data: doc } = await admin
    .from("kyc_documents")
    .select("id, school_id, status, verified_by, rejection_reason")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return json({ result: "error", reason: "not_found" }, 404);
  if (doc.status !== "verified" && doc.status !== "rejected") return json({ result: "no_op" });
  if (!doc.verified_by) return json({ result: "no_op" });

  const label = await roleLabelFor(admin, doc.verified_by, doc.school_id);
  const newBody = doc.status === "verified" ? `Document approved by ${label}.` : `Document rejected by ${label}.`;

  const { data: updated } = await admin
    .from("notifications")
    .update({ body: newBody, is_read: true })
    .eq("entity_type", "kyc_document")
    .eq("entity_id", documentId)
    .select("id");

  return json({ result: "ok", resolved: updated?.length ?? 0 });
}

// deno-lint-ignore no-explicit-any
async function resolveFeedback(admin: any, feedbackId: string): Promise<Response> {
  const { data: fb } = await admin
    .from("feedback")
    .select("id, school_id, status, response, responded_by, thread_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return json({ result: "error", reason: "not_found" }, 404);
  if (fb.status !== "responded" || !fb.responded_by) return json({ result: "no_op" });

  // Sibling rows share the same thread_id (Contact Management inserts one
  // per staff role for the same parent submission) — resolving one row
  // must propagate to its sibling(s), not just this one, so the other
  // staff member sees the same "Responded by X" outcome instead of a
  // second, now-redundant pending item.
  const threadKey = fb.thread_id ?? fb.id;
  const { data: siblings } = await admin
    .from("feedback")
    .select("id")
    .or(`thread_id.eq.${threadKey},id.eq.${threadKey}`);
  const siblingIds = (siblings ?? []).map((s: { id: string }) => s.id);
  if (!siblingIds.includes(fb.id)) siblingIds.push(fb.id);

  const otherIds = siblingIds.filter((id: string) => id !== fb.id);
  if (otherIds.length > 0) {
    await admin
      .from("feedback")
      .update({ status: "responded", response: fb.response, responded_by: fb.responded_by })
      .in("id", otherIds);
  }

  const label = await roleLabelFor(admin, fb.responded_by, fb.school_id);
  const newBody = `Responded by ${label}.`;

  const { data: updated } = await admin
    .from("notifications")
    .update({ body: newBody, is_read: true })
    .eq("entity_type", "feedback")
    .in("entity_id", siblingIds)
    .select("id");

  return json({ result: "ok", resolved: updated?.length ?? 0 });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
