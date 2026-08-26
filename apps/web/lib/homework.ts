"use client";

import { createClient } from "@/lib/supabase";

export type HomeworkRating = "good" | "satisfactory" | "needs_improvement";
export type RosterState = "not_started" | "viewed" | "done";

export interface RosterRow {
  studentId: string;
  fullName: string;
  state: RosterState;
  rating: HomeworkRating | null;
  teacherComment: string | null;
  reviewedAt: string | null;
  submission: { id: string; fileName: string; fileType: string } | null;
}

export interface AttachmentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
}

export async function loadRoster(homeworkId: string, sectionId: string): Promise<RosterRow[]> {
  const supabase = createClient();
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const { data: statuses } = await supabase
    .from("homework_status")
    .select("student_id, state, rating, teacher_comment, reviewed_at")
    .eq("homework_id", homeworkId);

  const { data: subs } = await supabase
    .from("homework_submissions")
    .select("id, student_id, file_name, file_type")
    .eq("homework_id", homeworkId);

  const byStudent: Record<string, any> = {};
  for (const s of statuses ?? []) byStudent[(s as any).student_id] = s;

  const subsByStudent: Record<string, any> = {};
  for (const s of subs ?? []) subsByStudent[(s as any).student_id] = s;

  return (enrollments ?? [])
    .map((e: any) => e.student_profiles)
    .filter(Boolean)
    .map((sp: any): RosterRow => {
      const s = byStudent[sp.id];
      const sub = subsByStudent[sp.id];
      return {
        studentId: sp.id,
        fullName: sp.full_name,
        state: (s?.state as RosterState) ?? "not_started",
        rating: s?.rating ?? null,
        teacherComment: s?.teacher_comment ?? null,
        reviewedAt: s?.reviewed_at ?? null,
        submission: sub ? { id: sub.id, fileName: sub.file_name, fileType: sub.file_type } : null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function loadAttachments(homeworkId: string): Promise<AttachmentRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("homework_attachments")
    .select("id, file_name, file_type, file_url")
    .eq("homework_id", homeworkId);
  return (data ?? []).map((a: any) => ({
    id: a.id, fileName: a.file_name, fileType: a.file_type, fileUrl: a.file_url,
  }));
}

export async function getSignedUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage.from("homework-attachments").createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}

export async function reviewStudent(
  homeworkId: string, studentId: string, rating: HomeworkRating, comment: string,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("review_homework", {
    p_homework_id: homeworkId, p_student_id: studentId, p_rating: rating, p_comment: comment,
  });
  return { error: error?.message ?? null };
}

export async function uploadAttachment(
  schoolId: string, homeworkId: string, file: File,
): Promise<{ error: string | null }> {
  if (file.size > 2 * 1024 * 1024) return { error: "File exceeds 2MB" };
  const supabase = createClient();
  const path = `homework/${schoolId}/${homeworkId}/${Date.now()}-${file.name}`;
  const up = await supabase.storage.from("homework-attachments").upload(path, file, { contentType: file.type });
  if (up.error) return { error: up.error.message };
  const ins = await supabase.from("homework_attachments").insert({
    homework_id: homeworkId, school_id: schoolId, file_url: path,
    file_name: file.name, file_type: file.type, file_size: file.size,
  });
  return { error: ins.error?.message ?? null };
}

async function callNotify(payload: object): Promise<void> {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-homework-notification`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* best-effort */ }
}

export const notifyAssigned = (homeworkId: string) => callNotify({ event: "assigned", homeworkId });
export const notifyReviewed = (homeworkId: string, studentId: string) =>
  callNotify({ event: "reviewed", homeworkId, studentId });

// Edge Functions resolve SUPABASE_URL from inside their own runtime (e.g. the
// internal Docker service address in self-hosted/local setups), which can
// differ from the origin this app actually reaches Supabase through — so a
// signed URL minted by the Edge Function can come back with a host this
// browser can't resolve. Storage sits behind the same gateway as every other
// Supabase API this app calls, so swapping in our own configured origin
// always lands on a reachable host; in production, where the origins already
// match, this is a no-op.
function fixEdgeFunctionUrlOrigin(url: string): string {
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const target = new URL(url);
    if (target.origin === configured.origin) return url;
    target.protocol = configured.protocol;
    target.host = configured.host;
    return target.toString();
  } catch {
    return url;
  }
}

export async function getHomeworkSubmissionSignedUrl(submissionId: string): Promise<{ url: string | null; error: string | null }> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { url: null, error: "Not authenticated" };

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homework-submission-signed-url`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId }),
    });
    const data = await res.json();
    if (!res.ok) return { url: null, error: data.error ?? "Could not open submission" };
    return { url: data.url ? fixEdgeFunctionUrlOrigin(data.url as string) : null, error: null };
  } catch {
    return { url: null, error: "Network error" };
  }
}
