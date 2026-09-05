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

  if (entity_type === "kyc_document") return await resolveKycDocument(admin, entity_id, userData.user.id);
  if (entity_type === "feedback") return await resolveFeedback(admin, entity_id, userData.user.id);
  if (entity_type === "leave_request") return await resolveLeaveRequest(admin, entity_id, userData.user.id);
  return json({ error: "bad_entity_type" }, 400);
});

// deno-lint-ignore no-explicit-any
async function resolveLeaveRequest(admin: any, leaveId: string, callerId: string): Promise<Response> {
  const { data: lr } = await admin
    .from("leave_requests")
    .select("id, school_id, student_id, status, decided_by")
    .eq("id", leaveId)
    .maybeSingle();
  if (!lr) return json({ result: "error", reason: "not_found" }, 404);
  if (lr.status !== "approved" && lr.status !== "rejected") return json({ result: "no_op" });
  if (!lr.decided_by) return json({ result: "no_op" });

  // Mirrors approve_leave/reject_leave's own authorization exactly (super_admin,
  // school-scoped school_admin/principal, or the class teacher of the
  // student's active section) rather than strictly decided_by — otherwise
  // the normal case of an admin deciding from the Leave Inbox permanently
  // strands the class teacher's own notification card, since the teacher
  // (who legitimately can act on it) would always fail a decided_by-only
  // check. No GUC helpers here — this runs under the service-role client,
  // so every check is a direct table lookup, same as resolveFeedback's.
  let canResolve = lr.decided_by === callerId;
  if (!canResolve) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role, school_id")
      .eq("user_id", callerId)
      .eq("is_active", true);
    const roleRows = (roles ?? []) as { role: string; school_id: string | null }[];
    canResolve = roleRows.some((r) => r.role === "super_admin")
      || roleRows.some((r) => ["school_admin", "principal"].includes(r.role) && r.school_id === lr.school_id);
  }
  if (!canResolve) {
    const { data: yearRow } = await admin
      .from("academic_years")
      .select("id")
      .eq("school_id", lr.school_id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (yearRow) {
      const { data: enrollment } = await admin
        .from("student_enrollments")
        .select("section_id")
        .eq("student_profile_id", lr.student_id)
        .eq("academic_year_id", yearRow.id)
        .eq("is_active", true)
        .maybeSingle();
      if (enrollment?.section_id) {
        const { data: assignment } = await admin
          .from("section_assignments")
          .select("class_teacher_id")
          .eq("section_id", enrollment.section_id)
          .eq("academic_year_id", yearRow.id)
          .maybeSingle();
        canResolve = assignment?.class_teacher_id === callerId;
      }
    }
  }
  if (!canResolve) return json({ result: "error", reason: "forbidden" }, 403);

  const label = await roleLabelFor(admin, lr.decided_by, lr.school_id);
  const newBody = lr.status === "approved" ? `Leave request approved by ${label}.` : `Leave request rejected by ${label}.`;

  // Scoped to type='leave_requested' — entity_id is shared with the
  // separate parent-facing 'leave_decided' notification leave-notify
  // inserts on this same decision (fired concurrently, fire-and-forget, by
  // the caller). Without this filter, an unlucky race where that insert
  // lands before this update runs would overwrite the parent's fresh,
  // still-unread notification with the teacher-facing resolved text.
  const { data: updated } = await admin
    .from("notifications")
    .update({ body: newBody, is_read: true })
    .eq("entity_type", "leave_request")
    .eq("entity_id", leaveId)
    .eq("type", "leave_requested")
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
async function resolveKycDocument(admin: any, documentId: string, callerId: string): Promise<Response> {
  const { data: doc } = await admin
    .from("kyc_documents")
    .select("id, school_id, status, verified_by, rejection_reason")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return json({ result: "error", reason: "not_found" }, 404);
  if (doc.status !== "verified" && doc.status !== "rejected") return json({ result: "no_op" });
  if (!doc.verified_by) return json({ result: "no_op" });
  // Same re-check-don't-trust shape as resolveLeaveRequest — verify_documents/
  // reject_document always set verified_by = auth.uid() for the caller who
  // just acted, so this only ever rejects someone resolving a decision that
  // isn't theirs.
  if (doc.verified_by !== callerId) return json({ result: "error", reason: "forbidden" }, 403);

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
async function resolveFeedback(admin: any, feedbackId: string, callerId: string): Promise<Response> {
  const { data: fb } = await admin
    .from("feedback")
    .select("id, school_id, from_user_id, to_user_id, status, response, responded_by, thread_id")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return json({ result: "error", reason: "not_found" }, 404);
  if (fb.status !== "responded" || !fb.responded_by) return json({ result: "no_op" });

  // entity_id is a caller-supplied claim, not a permission — this is the
  // service-role client, so RLS isn't protecting this read/write at all.
  // Legitimate actors are enumerated from the feature, not from the
  // exploit that was originally reported here: the responder, the intended
  // recipient (e.g. the teacher a message_teacher notification was sent
  // to — they never wrote a response but must still be able to clear their
  // own copy), or same-school staff.
  const isResponder = fb.responded_by === callerId;
  const isRecipient = fb.to_user_id === callerId;
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("school_id", fb.school_id)
    .eq("is_active", true);
  const isStaff = (roles ?? []).some((r: { role: string }) => ["school_admin", "principal"].includes(r.role));
  if (!isResponder && !isRecipient && !isStaff) return json({ result: "error", reason: "forbidden" }, 403);

  const { data: feedbackEnabled } = await admin.rpc("feature_enabled", {
    p_school_id: fb.school_id, p_key: "feedback",
  });
  if (!feedbackEnabled) return json({ result: "error", reason: "module_disabled" }, 403);

  const label = await roleLabelFor(admin, fb.responded_by, fb.school_id);
  const newBody = `Responded by ${label}.`;

  // Sibling rows share the same thread_id (Contact Management inserts one
  // per staff role for the same parent submission) — resolving one row
  // must propagate to its sibling(s), not just this one, so the other
  // staff member sees the same "Responded by X" outcome instead of a
  // second, now-redundant pending item. But thread_id is client-written at
  // insert time (nothing constrains it beyond school_id/feature flag on
  // feedback_insert), so only the actual responder — who just proved they
  // own this response — may trigger the sweep; a mere recipient or an
  // uninvolved staff member resolves only their own notification row,
  // never siblings. The sweep itself is additionally constrained to rows
  // from the same submitter (from_user_id), so a forged thread_id can't
  // pull in an unrelated parent's row even when the caller is the
  // responder.
  if (!isResponder) {
    const { data: updated } = await admin
      .from("notifications")
      .update({ body: newBody, is_read: true })
      .eq("entity_type", "feedback")
      .eq("school_id", fb.school_id)
      .eq("entity_id", fb.id)
      .eq("user_id", callerId)
      .select("id");
    return json({ result: "ok", resolved: updated?.length ?? 0 });
  }

  const threadKey = fb.thread_id ?? fb.id;
  const { data: siblings } = await admin
    .from("feedback")
    .select("id")
    .eq("school_id", fb.school_id)
    .eq("from_user_id", fb.from_user_id)
    .or(`thread_id.eq.${threadKey},id.eq.${threadKey}`);
  const siblingIds = (siblings ?? []).map((s: { id: string }) => s.id);
  if (!siblingIds.includes(fb.id)) siblingIds.push(fb.id);

  const otherIds = siblingIds.filter((id: string) => id !== fb.id);
  if (otherIds.length > 0) {
    await admin
      .from("feedback")
      .update({ status: "responded", response: fb.response, responded_by: fb.responded_by })
      .eq("school_id", fb.school_id)
      .eq("from_user_id", fb.from_user_id)
      .in("id", otherIds);
  }

  const { data: updated } = await admin
    .from("notifications")
    .update({ body: newBody, is_read: true })
    .eq("entity_type", "feedback")
    .eq("school_id", fb.school_id)
    .in("entity_id", siblingIds)
    .select("id");

  return json({ result: "ok", resolved: updated?.length ?? 0 });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
