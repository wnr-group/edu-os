import { File } from "expo-file-system";
import { supabase, supabaseUrl } from "./supabase";

export type HomeworkRating = "good" | "satisfactory" | "needs_improvement";
export type RosterState = "not_started" | "viewed" | "done";

export interface TeacherHomeworkItem {
  id: string;
  title: string;
  subject: string;
  due_date: string;
  doneCount: number;
  totalCount: number;
}

export interface RosterRow {
  studentId: string;
  fullName: string;
  state: RosterState;
  rating: HomeworkRating | null;
  teacherComment: string | null;
  reviewedAt: string | null;
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string; // storage object path
}

// Homework list for a teacher's section, with done/total counts.
export async function loadTeacherHomework(
  sectionId: string,
  teacherId: string,
): Promise<TeacherHomeworkItem[]> {
  const { data: hw } = await supabase
    .from("homework")
    .select("id, title, due_date, subjects(name)")
    .eq("teacher_id", teacherId)
    .eq("section_id", sectionId)
    .order("due_date", { ascending: false })
    .limit(30);

  const ids = (hw ?? []).map((h: any) => h.id);

  // Total enrolled students in the section (denominator).
  const { count: totalCount } = await supabase
    .from("student_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("section_id", sectionId)
    .eq("is_active", true);

  // Done counts per homework.
  const doneByHw: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: statuses } = await supabase
      .from("homework_status")
      .select("homework_id, state")
      .in("homework_id", ids)
      .eq("state", "done");
    for (const s of statuses ?? []) {
      doneByHw[(s as any).homework_id] = (doneByHw[(s as any).homework_id] ?? 0) + 1;
    }
  }

  return (hw ?? []).map((h: any) => ({
    id: h.id,
    title: h.title,
    subject: h.subjects?.name ?? "—",
    due_date: h.due_date,
    doneCount: doneByHw[h.id] ?? 0,
    totalCount: totalCount ?? 0,
  }));
}

// Build the roster: all enrolled students LEFT JOINed with their status.
export async function loadRoster(homeworkId: string, sectionId: string): Promise<RosterRow[]> {
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const { data: statuses } = await supabase
    .from("homework_status")
    .select("student_id, state, rating, teacher_comment, reviewed_at")
    .eq("homework_id", homeworkId);

  const byStudent: Record<string, any> = {};
  for (const s of statuses ?? []) byStudent[(s as any).student_id] = s;

  return (enrollments ?? [])
    .map((e: any) => e.student_profiles)
    .filter(Boolean)
    .map((sp: any): RosterRow => {
      const s = byStudent[sp.id];
      return {
        studentId: sp.id,
        fullName: sp.full_name,
        state: (s?.state as RosterState) ?? "not_started",
        rating: s?.rating ?? null,
        teacherComment: s?.teacher_comment ?? null,
        reviewedAt: s?.reviewed_at ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function loadAttachments(homeworkId: string): Promise<AttachmentRow[]> {
  const { data } = await supabase
    .from("homework_attachments")
    .select("id, file_name, file_type, file_url")
    .eq("homework_id", homeworkId);
  return (data ?? []).map((a: any) => ({
    id: a.id, fileName: a.file_name, fileType: a.file_type, fileUrl: a.file_url,
  }));
}

export async function getSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("homework-attachments")
    .createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

// Teacher review via the column-aware RPC.
export async function reviewStudent(
  homeworkId: string, studentId: string, rating: HomeworkRating, comment: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("review_homework", {
    p_homework_id: homeworkId,
    p_student_id: studentId,
    p_rating: rating,
    p_comment: comment,
  });
  return { error: error?.message ?? null };
}

// Upload one picked file to the private bucket; insert the attachments row.
export async function uploadAttachment(
  schoolId: string, homeworkId: string,
  file: { uri: string; name: string; mimeType: string; size: number },
): Promise<{ error: string | null }> {
  if (file.size > 2 * 1024 * 1024) return { error: "File exceeds 2MB" };
  const path = `homework/${schoolId}/${homeworkId}/${Date.now()}-${file.name}`;
  // RN: read the local file uri into a byte array for upload. fetch().arrayBuffer()
  // is unreliable for file:// URIs in React Native, so use expo-file-system.
  const bytes = await new File(file.uri).bytes();
  const up = await supabase.storage
    .from("homework-attachments")
    .upload(path, bytes, { contentType: file.mimeType, upsert: false });
  if (up.error) return { error: up.error.message };
  const ins = await supabase.from("homework_attachments").insert({
    homework_id: homeworkId,
    school_id: schoolId,
    file_url: path,
    file_name: file.name,
    file_type: file.mimeType,
    file_size: file.size,
  });
  return { error: ins.error?.message ?? null };
}

// Fire the "assigned" notification fan-out (best-effort; never blocks the user).
export async function notifyAssigned(homeworkId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${supabaseUrl}/functions/v1/send-homework-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "assigned", homeworkId }),
    });
  } catch {
    // best-effort; the homework is already saved
  }
}

// Fire the "reviewed" notification for one student (best-effort).
export async function notifyReviewed(homeworkId: string, studentId: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${supabaseUrl}/functions/v1/send-homework-notification`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "reviewed", homeworkId, studentId }),
    });
  } catch {
    // best-effort
  }
}

export type ParentHomeworkState = "new" | "viewed" | "done" | "reviewed";

export interface ParentHomeworkItem {
  id: string;
  title: string;
  subject: string;
  description: string;
  due_date: string;
  state: ParentHomeworkState;
  rating: HomeworkRating | null;
  teacherComment: string | null;
}

function deriveParentState(s: any): ParentHomeworkState {
  if (!s) return "new";
  if (s.reviewed_at) return "reviewed";
  if (s.state === "done") return "done";
  return "viewed";
}

// Homework for a child's section between two YYYY-MM-DD dates (inclusive),
// merged with that child's status.
async function loadParentHomeworkBetween(
  sectionId: string, studentId: string, firstDay: string, lastDay: string,
): Promise<ParentHomeworkItem[]> {
  const { data: hw } = await supabase
    .from("homework")
    .select("id, title, description, due_date, subjects(name)")
    .eq("section_id", sectionId)
    .gte("due_date", firstDay)
    .lte("due_date", lastDay)
    .order("due_date", { ascending: true });

  const ids = (hw ?? []).map((h: any) => h.id);
  const statusByHw: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: statuses } = await supabase
      .from("homework_status")
      .select("homework_id, state, rating, teacher_comment, reviewed_at")
      .in("homework_id", ids)
      .eq("student_id", studentId);
    for (const s of statuses ?? []) statusByHw[(s as any).homework_id] = s;
  }

  return (hw ?? []).map((h: any): ParentHomeworkItem => {
    const s = statusByHw[h.id];
    return {
      id: h.id,
      title: h.title,
      description: h.description ?? "",
      subject: h.subjects?.name ?? "",
      due_date: h.due_date,
      state: deriveParentState(s),
      rating: s?.rating ?? null,
      teacherComment: s?.teacher_comment ?? null,
    };
  });
}

// Homework for a child's section in a calendar month (powers the calendar view).
export async function loadParentHomework(
  sectionId: string, studentId: string, year: number, month: number,
): Promise<ParentHomeworkItem[]> {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).toISOString().split("T")[0];
  return loadParentHomeworkBetween(sectionId, studentId, firstDay, lastDay);
}

// Homework due within +/- `days` of today (powers the grouped status list).
export async function loadParentHomeworkRange(
  sectionId: string, studentId: string, days = 30,
): Promise<ParentHomeworkItem[]> {
  const toStr = (d: Date) => d.toLocaleDateString("en-CA");
  const from = new Date(); from.setDate(from.getDate() - days);
  const to = new Date(); to.setDate(to.getDate() + days);
  return loadParentHomeworkBetween(sectionId, studentId, toStr(from), toStr(to));
}

// One homework's status for a child (for the detail screen).
export async function loadStudentStatus(homeworkId: string, studentId: string): Promise<{
  state: ParentHomeworkState; rating: HomeworkRating | null; teacherComment: string | null;
  title: string; description: string; subject: string; dueDate: string;
} | null> {
  const { data: hw } = await supabase
    .from("homework")
    .select("id, title, description, due_date, subjects(name)")
    .eq("id", homeworkId)
    .maybeSingle();
  if (!hw) return null;

  const { data: s } = await supabase
    .from("homework_status")
    .select("state, rating, teacher_comment, reviewed_at")
    .eq("homework_id", homeworkId)
    .eq("student_id", studentId)
    .maybeSingle();

  return {
    state: deriveParentState(s),
    rating: (s as any)?.rating ?? null,
    teacherComment: (s as any)?.teacher_comment ?? null,
    title: (hw as any).title,
    description: (hw as any).description ?? "",
    subject: (hw as any).subjects?.name ?? "",
    dueDate: (hw as any).due_date,
  };
}

export async function markViewed(homeworkId: string, studentId: string): Promise<void> {
  await supabase.rpc("mark_homework_viewed", { p_homework_id: homeworkId, p_student_id: studentId });
}
export async function markDone(homeworkId: string, studentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("mark_homework_done", { p_homework_id: homeworkId, p_student_id: studentId });
  return { error: error?.message ?? null };
}
export async function unmarkDone(homeworkId: string, studentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("unmark_homework_done", { p_homework_id: homeworkId, p_student_id: studentId });
  return { error: error?.message ?? null };
}
