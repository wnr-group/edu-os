import { supabase } from "./supabase";

export type PtmMeetingMode = "in_person" | "online";
export type PtmMeetingStatus = "scheduled" | "completed" | "cancelled" | "no_show";

export interface PtmMeetingItem {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  meetingMode: PtmMeetingMode;
  location: string | null;
  status: PtmMeetingStatus;
  cancelledReason: string | null;
  teacherName: string;
  className: string;
  subjectName: string | null;
}

// RLS on ptm_meetings already scopes this to the signed-in parent's own
// children (is_parent_of_student), same as every other parent read in this
// app — no new RPC needed for the list itself, only for feedback (see below).
export async function loadMyMeetings(studentId: string): Promise<PtmMeetingItem[]> {
  const { data: meetings, error } = await supabase
    .from("ptm_meetings")
    .select("id, teacher_id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, cancelled_reason, section:sections(name, class:classes(name)), subject:subjects(name)")
    .eq("student_id", studentId)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw error;

  const teacherIds = [...new Set((meetings ?? []).map((m) => m.teacher_id))];
  const { data: teacherProfiles, error: teacherErr } = teacherIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (teacherErr) throw teacherErr;
  const teacherNameById = new Map((teacherProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  return (meetings ?? []).map((m) => {
    const section = m.section as unknown as { name: string; class: { name: string } | null } | null;
    const subject = m.subject as unknown as { name: string } | null;
    return {
      id: m.id,
      scheduledDate: m.scheduled_date,
      startTime: m.start_time,
      durationMinutes: m.duration_minutes,
      meetingMode: m.meeting_mode as PtmMeetingMode,
      location: m.location,
      status: m.status as PtmMeetingStatus,
      cancelledReason: m.cancelled_reason,
      teacherName: teacherNameById.get(m.teacher_id) ?? "—",
      className: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
      subjectName: subject?.name ?? null,
    };
  });
}

export interface PtmFeedbackData {
  summary: string;
  academicRating: number | null;
  behaviorRating: number | null;
  followUpRequired: boolean;
  editedAt: string | null;
}

// Only ever reachable through this RPC — there is no RLS policy granting
// parents direct SELECT on ptm_feedback (internal_notes can't be hidden
// column-by-column via RLS), so a raw .from("ptm_feedback").select() from a
// parent session returns nothing. get_ptm_feedback_for_parent is a STABLE
// SECURITY DEFINER function with an explicit column list that never
// includes internal_notes, and returns zero rows (not an error) when no
// feedback exists yet or the teacher withheld it from parent view.
export async function loadMeetingFeedback(meetingId: string): Promise<PtmFeedbackData | null> {
  const { data, error } = await supabase.rpc("get_ptm_feedback_for_parent", { p_meeting_id: meetingId });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    summary: row.summary,
    academicRating: row.academic_rating,
    behaviorRating: row.behavior_rating,
    followUpRequired: row.follow_up_required,
    editedAt: row.edited_at,
  };
}

// ── Teacher mobile (Phase 3) ────────────────────────────────────────────
// Deliberately not loadMyMeetings(studentId) — a teacher's meetings aren't
// scoped to one student, they're every meeting where teacher_id = the
// signed-in teacher. RLS (ptm_meetings_select) already enforces that scope
// server-side; the .eq() here just mirrors it client-side, same as
// loadMyMeetings's .eq("student_id", ...) does for parents.

export interface TeacherPtmMeetingItem {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  meetingMode: PtmMeetingMode;
  location: string | null;
  status: PtmMeetingStatus;
  cancelledReason: string | null;
  studentName: string;
  className: string;
  subjectName: string | null;
}

export async function loadTeacherMeetings(teacherId: string): Promise<TeacherPtmMeetingItem[]> {
  const { data: meetings, error } = await supabase
    .from("ptm_meetings")
    .select("id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, cancelled_reason, student:student_profiles(full_name), section:sections(name, class:classes(name)), subject:subjects(name)")
    .eq("teacher_id", teacherId)
    .order("scheduled_date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw error;

  return (meetings ?? []).map((m) => {
    const student = m.student as unknown as { full_name: string | null } | null;
    const section = m.section as unknown as { name: string; class: { name: string } | null } | null;
    const subject = m.subject as unknown as { name: string } | null;
    return {
      id: m.id,
      scheduledDate: m.scheduled_date,
      startTime: m.start_time,
      durationMinutes: m.duration_minutes,
      meetingMode: m.meeting_mode as PtmMeetingMode,
      location: m.location,
      status: m.status as PtmMeetingStatus,
      cancelledReason: m.cancelled_reason,
      studentName: student?.full_name ?? "—",
      className: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
      subjectName: subject?.name ?? null,
    };
  });
}

// mark_ptm_completed already restricts writers to the meeting's own
// teacher_id (or admin/principal/super_admin) — see ptm_rpcs.sql — so no
// extra client-side ownership check is needed here.
export async function markPtmStatus(meetingId: string, status: "completed" | "no_show"): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("mark_ptm_completed", { p_meeting_id: meetingId, p_status: status });
  return { error: error?.message ?? null };
}

export interface TeacherPtmFeedback {
  summary: string;
  visibleToParent: boolean;
  internalNotes: string | null;
  academicRating: number | null;
  behaviorRating: number | null;
  followUpRequired: boolean;
}

// Unlike the parent's read path, the teacher reads their own feedback
// straight off the table — ptm_feedback_select already grants the row's own
// teacher_id a SELECT (internal_notes included), so no RPC indirection is
// needed here the way get_ptm_feedback_for_parent hides it from parents.
// internal_notes is fetched (not just displayed fields) even though the
// mobile screen has no field to edit it — see recordPtmFeedback below for why.
export async function loadOwnFeedback(meetingId: string): Promise<TeacherPtmFeedback | null> {
  const { data, error } = await supabase
    .from("ptm_feedback")
    .select("summary, visible_to_parent, internal_notes, academic_rating, behavior_rating, follow_up_required")
    .eq("meeting_id", meetingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    summary: data.summary,
    visibleToParent: data.visible_to_parent,
    internalNotes: data.internal_notes,
    academicRating: data.academic_rating,
    behaviorRating: data.behavior_rating,
    followUpRequired: data.follow_up_required,
  };
}

// record_ptm_feedback is an upsert (ON CONFLICT meeting_id) — same call
// creates the first feedback and edits it later. The mobile screen has no
// internal-notes field (kept lean for on-the-go use, matching the web
// form's staff-only field being the one thing left out here), but the RPC's
// upsert overwrites internal_notes unconditionally on every call — so a
// naive "always pass null" would silently wipe out notes a teacher wrote
// from web the moment they edit feedback from mobile. Callers must load the
// existing value via loadOwnFeedback first and pass it straight through.
export async function recordPtmFeedback(
  meetingId: string,
  input: {
    summary: string;
    visibleToParent: boolean;
    internalNotes: string | null;
    academicRating: number | null;
    behaviorRating: number | null;
    followUpRequired: boolean;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("record_ptm_feedback", {
    p_meeting_id: meetingId,
    p_summary: input.summary,
    p_visible_to_parent: input.visibleToParent,
    p_internal_notes: input.internalNotes,
    p_academic_rating: input.academicRating,
    p_behavior_rating: input.behaviorRating,
    p_follow_up_required: input.followUpRequired,
  });
  return { error: error?.message ?? null };
}

// ── Phase 4 — parent self-service slot booking ──────────────────────────

export interface PtmAvailableSlot {
  id: string;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  meetingMode: PtmMeetingMode;
  location: string | null;
  teacherName: string;
  subjectName: string | null;
  /** 'booked' means someone already claimed it — never who. The query below
   *  never selects booked_meeting_id or joins through it, so there is no
   *  path from this row to the other family's identity even if it wanted to. */
  status: "open" | "booked";
}

// Resolves the child's current active-year section first (same shape as
// the enrollments_parent_read RLS policy already grants parents), then
// loads BOTH open and booked slots for that section — ptm_slots_select RLS
// now returns both to a parent (widened from open-only), so a parent can
// see the full picture of what's on offer, not just what they can still
// claim. Booked ones are still fully anonymous — see PtmAvailableSlot.status.
export async function loadAvailableSlots(studentId: string): Promise<PtmAvailableSlot[]> {
  const { data: enrollment, error: enrollErr } = await supabase
    .from("student_enrollments")
    .select("section_id")
    .eq("student_profile_id", studentId)
    .eq("is_active", true)
    .maybeSingle();
  if (enrollErr) throw enrollErr;
  if (!enrollment) return [];

  const { data: slots, error } = await supabase
    .from("ptm_availability_slots")
    .select("id, teacher_id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, subject:subjects(name)")
    .eq("section_id", enrollment.section_id)
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;

  const teacherIds = [...new Set((slots ?? []).map((s) => s.teacher_id))];
  const { data: teacherProfiles, error: teacherErr } = teacherIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as { id: string; full_name: string | null }[], error: null };
  if (teacherErr) throw teacherErr;
  const teacherNameById = new Map((teacherProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  const nowMs = Date.now();
  return (slots ?? [])
    .filter((s) => new Date(`${s.scheduled_date}T${s.start_time}`).getTime() >= nowMs)
    .map((s) => {
      const subject = s.subject as unknown as { name: string } | null;
      return {
        id: s.id,
        scheduledDate: s.scheduled_date,
        startTime: s.start_time,
        durationMinutes: s.duration_minutes,
        meetingMode: s.meeting_mode as PtmMeetingMode,
        location: s.location,
        teacherName: teacherNameById.get(s.teacher_id) ?? "—",
        subjectName: subject?.name ?? null,
        status: s.status as "open" | "booked",
      };
    });
}

// The atomic claim — see book_ptm_slot's own comments for how concurrent
// double-booking is prevented server-side. `slot_unavailable` is the
// specific error a parent hits when someone else claimed the same slot
// first; callers should refresh the list on any error so a stale slot
// doesn't linger in view.
export async function bookSlot(slotId: string, studentId: string): Promise<{ meetingId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("book_ptm_slot", { p_slot_id: slotId, p_student_id: studentId });
  if (error) return { meetingId: null, error: error.message };
  return { meetingId: data as string, error: null };
}
