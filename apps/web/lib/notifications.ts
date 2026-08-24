import { createClient } from "@/lib/supabase";
import { getActiveRoles, topRole } from "@/lib/auth/roles";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
  entity_type: string | null;
  entity_id: string | null;
  school_id: string;
}

interface CategoryDef {
  label: string;
  /** Only "actionable" types render inline action buttons and land in "Needs Action" — everything else is informational and only ever appears in "Recent Activity". */
  actionable: boolean;
}

// One entry per notification `type` this app currently produces for a
// staff (admin/principal/teacher) recipient. Unknown types (e.g. the
// existing parent-facing ones — homework, exams, fees, birthdays) fall back
// to a generic, non-actionable category below rather than being hidden —
// a staff member who happens to also be a parent-linked account should
// still see them, just without an inline action.
export const NOTIFICATION_CATEGORIES: Record<string, CategoryDef> = {
  leave_requested: { label: "Leave", actionable: true },
  admission_enrolled: { label: "Admissions", actionable: false },
  kyc_document_submitted: { label: "Documents", actionable: true },
  feedback_contact: { label: "Feedback", actionable: true },
  message_teacher: { label: "Feedback", actionable: true },
};
const DEFAULT_CATEGORY: CategoryDef = { label: "General", actionable: false };

export function categoryFor(type: string): CategoryDef {
  return NOTIFICATION_CATEGORIES[type] ?? DEFAULT_CATEGORY;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + `, ${time}`;
}

// RLS scopes this strictly to the signed-in user's own rows
// (notifications_select: user_id = auth.uid(), no role-based broadening for
// anyone) — no explicit user_id filter needed here, same shape as every
// other client-side load in this app.
export async function loadNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, type, is_read, created_at, entity_type, entity_id, school_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationRow[];
}

export async function loadUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);
  return count ?? 0;
}

// Returns whether the update actually persisted (a non-empty .select()
// result) rather than assuming success — notifications_update is also
// user_id = auth.uid()-scoped, so a stale/mis-scoped id would otherwise
// silently no-op and leave the caller's optimistic UI wrong after a refresh
// (exactly the bug this was hardened against).
export async function markRead(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const supabase = createClient();
  const { data } = await supabase.from("notifications").update({ is_read: true }).in("id", ids).select("id");
  return (data?.length ?? 0) === ids.length;
}

const ROLE_LABELS: Record<string, string> = {
  teacher: "Class Teacher",
  school_admin: "School Admin",
  principal: "Principal",
  super_admin: "Super Admin",
};

async function labelForUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const roles = await getActiveRoles(supabase, userId);
  const role = topRole(roles);
  return role ? (ROLE_LABELS[role] ?? role) : "—";
}

// ── Notification detail — expanded on click, sourced live from the
// referenced entity (entity_type/entity_id) rather than duplicated onto the
// notification row itself. A discriminated result instead of a bare
// nullable: kyc_documents_select (and feedback_select) both fold "module
// disabled since this notification was created" and "row genuinely gone"
// into the same empty result under RLS — a bare `T | null` return can't
// tell those apart, and the caller has no distinct signal to stop showing
// a loading state versus display an explanatory message. Checking
// feature_enabled explicitly first is what makes that distinction possible.
export type DetailResult<T> =
  | { kind: "ok"; detail: T }
  | { kind: "feature_disabled" }
  | { kind: "not_found" };

export interface KycDocumentDetail {
  studentName: string;
  documentTypeName: string;
  status: string;
  actorName: string | null;
  actorRole: string | null;
  actedAt: string | null;
  rejectionReason: string | null;
}

export async function loadKycDocumentDetail(documentId: string, schoolId: string): Promise<DetailResult<KycDocumentDetail>> {
  const supabase = createClient();
  const { data: enabled } = await supabase.rpc("feature_enabled", { p_school_id: schoolId, p_key: "kyc_documents" });
  if (!enabled) return { kind: "feature_disabled" };

  const { data: doc } = await supabase
    .from("kyc_documents")
    .select("subject_id, document_type_id, status, verified_by, verified_at, rejection_reason")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { kind: "not_found" };

  const [{ data: student }, { data: docType }, actorProfile] = await Promise.all([
    supabase.from("student_profiles").select("full_name").eq("id", doc.subject_id).maybeSingle(),
    supabase.from("document_types").select("name").eq("id", doc.document_type_id).maybeSingle(),
    doc.verified_by
      ? supabase.from("profiles").select("full_name").eq("id", doc.verified_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    kind: "ok",
    detail: {
      studentName: student?.full_name ?? "—",
      documentTypeName: docType?.name ?? "—",
      status: doc.status,
      actorName: actorProfile.data?.full_name ?? null,
      actorRole: doc.verified_by ? await labelForUser(supabase, doc.verified_by) : null,
      actedAt: doc.verified_at,
      rejectionReason: doc.rejection_reason,
    },
  };
}

export interface FeedbackDetail {
  fromName: string;
  message: string;
  response: string | null;
  status: string;
  respondedByName: string | null;
  respondedByRole: string | null;
  createdAt: string;
  respondedAt: string | null;
}

export async function loadFeedbackDetail(feedbackId: string, schoolId: string): Promise<DetailResult<FeedbackDetail>> {
  const supabase = createClient();
  const { data: enabled } = await supabase.rpc("feature_enabled", { p_school_id: schoolId, p_key: "feedback" });
  if (!enabled) return { kind: "feature_disabled" };

  const { data: fb } = await supabase
    .from("feedback")
    .select("from_user_id, message, response, status, responded_by, created_at, responded_at")
    .eq("id", feedbackId)
    .maybeSingle();
  if (!fb) return { kind: "not_found" };

  const [{ data: fromProfile }, respondedProfile] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", fb.from_user_id).maybeSingle(),
    fb.responded_by
      ? supabase.from("profiles").select("full_name").eq("id", fb.responded_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    kind: "ok",
    detail: {
      fromName: fromProfile?.full_name ?? "—",
      message: fb.message,
      response: fb.response,
      status: fb.status,
      respondedByName: respondedProfile.data?.full_name ?? null,
      respondedByRole: fb.responded_by ? await labelForUser(supabase, fb.responded_by) : null,
      createdAt: fb.created_at,
      respondedAt: fb.responded_at,
    },
  };
}
