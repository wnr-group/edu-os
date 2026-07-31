import { supabase } from "./supabase";

export type AttendanceSession = "FULL_DAY" | "FN" | "AN";
export type AttendanceStatus = "present" | "absent" | "late";

export const SESSION_LABELS: Record<AttendanceSession, string> = {
  FULL_DAY: "Full Day",
  FN: "Forenoon",
  AN: "Afternoon",
};

export interface MarkedCount {
  sectionId: string;
  total: number;
  marked: number;
  /** The granularity actually present for this section+date, if any. */
  existingMode: "FULL_DAY" | "SESSION" | null;
}

export interface SectionAttendanceRow {
  recordId: string | null;
  studentId: string;
  fullName: string;
  rollNumber: string;
  /** null = not yet marked for this date/session. */
  status: AttendanceStatus | null;
  notifiedAt: string | null;
  hasParent: boolean;
}

/** Count active enrolled students vs. marked rows for a section/date/session. */
export async function fetchMarkedCount(
  sectionId: string,
  date: string,
  session: AttendanceSession,
): Promise<MarkedCount> {
  const [enrollRes, recRes] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("student_profile_id", { count: "exact", head: false })
      .eq("section_id", sectionId)
      .eq("is_active", true),
    supabase
      .from("attendance_records")
      .select("session")
      .eq("section_id", sectionId)
      .eq("date", date),
  ]);

  const total = (enrollRes.data ?? []).length;
  const rows = recRes.data ?? [];
  const marked = rows.filter((r: any) => r.session === session).length;
  const hasFullDay = rows.some((r: any) => r.session === "FULL_DAY");
  const hasSession = rows.some((r: any) => r.session === "FN" || r.session === "AN");
  const existingMode: MarkedCount["existingMode"] =
    hasFullDay ? "FULL_DAY" : hasSession ? "SESSION" : null;

  return { sectionId, total, marked, existingMode };
}

/** Load the roster for a section with any existing marks for date+session. */
export async function fetchSectionAttendance(
  sectionId: string,
  date: string,
  session: AttendanceSession,
): Promise<SectionAttendanceRow[]> {
  const [studentRes, recRes] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("roll_number, student_profile_id, student_profiles(id, full_name, admission_number, parent_profile_id)")
      .eq("section_id", sectionId)
      .eq("is_active", true)
      .order("roll_number"),
    supabase
      .from("attendance_records")
      .select("id, student_id, status, notified_at")
      .eq("section_id", sectionId)
      .eq("date", date)
      .eq("session", session),
  ]);

  const recMap = new Map<string, { id: string; status: AttendanceStatus; notified_at: string | null }>();
  (recRes.data ?? []).forEach((r: any) =>
    recMap.set(r.student_id, { id: r.id, status: r.status, notified_at: r.notified_at }),
  );

  return (studentRes.data ?? []).map((s: any, idx: number) => {
    const p = s.student_profiles;
    const sid = p?.id ?? s.student_profile_id;
    const existing = recMap.get(sid);
    return {
      recordId: existing?.id ?? null,
      studentId: sid,
      fullName: p?.full_name ?? "Student",
      rollNumber: s.roll_number || p?.admission_number || String(idx + 1),
      status: existing?.status ?? null,
      notifiedAt: existing?.notified_at ?? null,
      hasParent: !!p?.parent_profile_id,
    };
  });
}

/** Per-day present% for the last N distinct marked dates of a section. */
export interface DayStat { date: string; pct: number }

export async function fetchRecentStats(
  sectionId: string,
  days = 7,
): Promise<DayStat[]> {
  const { data } = await supabase
    .from("attendance_records")
    .select("date, status")
    .eq("section_id", sectionId)
    .order("date", { ascending: false });

  const byDate = new Map<string, { present: number; total: number }>();
  (data ?? []).forEach((r: any) => {
    if (r.status === "excused") return; // neutral — excluded from both numerator and denominator
    const agg = byDate.get(r.date) ?? { present: 0, total: 0 };
    agg.total += 1;
    if (r.status === "present" || r.status === "late") agg.present += 1;
    byDate.set(r.date, agg);
  });

  return [...byDate.entries()]
    .slice(0, days)
    .map(([date, a]) => ({ date, pct: a.total ? Math.round((a.present / a.total) * 100) : 0 }))
    .reverse();
}

/** Delete all rows for a section+date in the given granularity. */
export async function clearAttendance(
  sectionId: string,
  date: string,
  mode: "FULL_DAY" | "SESSION",
): Promise<{ error: string | null }> {
  const sessions = mode === "FULL_DAY" ? ["FULL_DAY"] : ["FN", "AN"];
  const { error } = await supabase
    .from("attendance_records")
    .delete()
    .eq("section_id", sectionId)
    .eq("date", date)
    .in("session", sessions);
  return { error: error?.message ?? null };
}
