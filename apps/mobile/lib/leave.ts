import { supabase, supabaseUrl } from "./supabase";

export type LeaveType = "sick" | "casual" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequestItem {
  id: string;
  fromDate: string;
  toDate: string;
  leaveType: LeaveType;
  note: string | null;
  status: LeaveStatus;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export async function requestLeave(
  studentId: string, from: string, to: string, type: LeaveType, note: string,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("request_leave", {
    p_student_id: studentId, p_from: from, p_to: to, p_type: type, p_note: note,
  });
  if (error) return { id: null, error: error.message };
  return { id: data as string, error: null };
}

export async function loadMyRequests(studentId: string): Promise<LeaveRequestItem[]> {
  const { data } = await supabase
    .from("leave_requests")
    .select("id, from_date, to_date, leave_type, note, status, decision_note, decided_at, created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r: any) => ({
    id: r.id, fromDate: r.from_date, toDate: r.to_date, leaveType: r.leave_type,
    note: r.note, status: r.status, decisionNote: r.decision_note,
    decidedAt: r.decided_at, createdAt: r.created_at,
  }));
}

export async function cancelLeave(requestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("cancel_leave", { p_request_id: requestId });
  return { error: error?.message ?? null };
}

async function callLeaveNotify(leaveId: string, event: "requested" | "decided"): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${supabaseUrl}/functions/v1/leave-notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ leave_id: leaveId, event }),
    });
  } catch { /* best-effort */ }
}
export const notifyLeaveRequested = (leaveId: string) => callLeaveNotify(leaveId, "requested");
export const notifyLeaveDecided = (leaveId: string) => callLeaveNotify(leaveId, "decided");

export interface PendingLeaveItem extends LeaveRequestItem {
  studentId: string;
  studentName: string;
  rollNumber: string;
}

export async function loadSectionLeaveRequests(sectionId: string, statusFilter: LeaveStatus | "all"): Promise<PendingLeaveItem[]> {
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id, roll_number, student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const studentIds = (enrollments ?? []).map((e: any) => e.student_profiles?.id ?? e.student_profile_id).filter(Boolean);
  if (studentIds.length === 0) return [];

  let query = supabase
    .from("leave_requests")
    .select("id, student_id, from_date, to_date, leave_type, note, status, decision_note, decided_at, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: true });
  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data: requests } = await query;

  const studentInfo = new Map(
    (enrollments ?? []).map((e: any) => [
      e.student_profiles?.id ?? e.student_profile_id,
      { name: e.student_profiles?.full_name ?? "—", roll: e.roll_number ?? "" },
    ])
  );

  return (requests ?? []).map((r: any) => {
    const info = studentInfo.get(r.student_id) ?? { name: "—", roll: "" };
    return {
      id: r.id, studentId: r.student_id, studentName: info.name, rollNumber: info.roll,
      fromDate: r.from_date, toDate: r.to_date, leaveType: r.leave_type, note: r.note,
      status: r.status, decisionNote: r.decision_note, decidedAt: r.decided_at, createdAt: r.created_at,
    };
  });
}

export async function approveLeave(requestId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("approve_leave", { p_request_id: requestId });
  return { error: error?.message ?? null };
}
export async function rejectLeave(requestId: string, reason: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("reject_leave", { p_request_id: requestId, p_reason: reason });
  return { error: error?.message ?? null };
}

// Badge tie-in — which students in this section have approved leave covering `date`.
export async function loadApprovedLeaveForSectionDate(sectionId: string, date: string): Promise<Set<string>> {
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id")
    .eq("section_id", sectionId)
    .eq("is_active", true);
  const studentIds = (enrollments ?? []).map((e: any) => e.student_profile_id);
  if (studentIds.length === 0) return new Set();

  const { data } = await supabase
    .from("leave_requests")
    .select("student_id")
    .in("student_id", studentIds)
    .eq("status", "approved")
    .lte("from_date", date)
    .gte("to_date", date);

  return new Set((data ?? []).map((r: any) => r.student_id));
}