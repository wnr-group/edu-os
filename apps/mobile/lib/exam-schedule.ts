import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const SEEN_STORAGE_KEY = "exam_datesheet_seen_v1";

export interface DatesheetSlot {
  id: string;
  subject: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  updated_at: string;
}

export interface ExamDatesheet {
  examId: string;
  examName: string;
  academicYearName: string;
  slots: DatesheetSlot[];
}

// The most relevant published-and-upcoming datesheet for the child's class —
// powers both the dashboard home card and the nested screen. "Upcoming" =
// has at least one slot today or later; otherwise the home card self-dismisses.
export async function loadActiveDatesheet(classId: string): Promise<ExamDatesheet | null> {
  const today = new Date().toLocaleDateString("en-CA");

  const { data: slots } = await supabase
    .from("exam_schedule_slots")
    .select("id, exam_date, start_time, end_time, updated_at, subjects(name), exams(id, name, academic_years(name))")
    .eq("class_id", classId)
    .order("exam_date", { ascending: true });

  if (!slots || slots.length === 0) return null;

  // Group by exam, keep only exams with at least one slot today-or-later.
  const byExam = new Map<string, { name: string; academicYearName: string; slots: DatesheetSlot[] }>();
  for (const s of slots as any[]) {
    const exam = s.exams;
    if (!exam) continue;
    if (!byExam.has(exam.id)) {
      byExam.set(exam.id, { name: exam.name, academicYearName: exam.academic_years?.name ?? "—", slots: [] });
    }
    byExam.get(exam.id)!.slots.push({
      id: s.id,
      subject: s.subjects?.name ?? "—",
      exam_date: s.exam_date,
      start_time: s.start_time,
      end_time: s.end_time,
      updated_at: s.updated_at,
    });
  }

  // Prefer the soonest exam that still has an upcoming paper.
  let best: ExamDatesheet | null = null;
  for (const [examId, exam] of byExam) {
    const hasUpcoming = exam.slots.some((s) => s.exam_date >= today);
    if (!hasUpcoming) continue;
    if (!best || exam.slots[0].exam_date < best.slots[0].exam_date) {
      best = { examId, examName: exam.name, academicYearName: exam.academicYearName, slots: exam.slots };
    }
  }

  return best;
}

// Local "have I seen this slot's latest version" tracking — same idiom as
// active-context.tsx's single-key AsyncStorage pattern, not a shared/reactive
// context, since this only needs to be read once per screen mount.
async function loadSeenMap(): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(SEEN_STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function isSlotUpdated(slot: DatesheetSlot): Promise<boolean> {
  const seen = await loadSeenMap();
  const lastSeen = seen[slot.id];
  return !!lastSeen && lastSeen < slot.updated_at;
}

export async function markDatesheetSeen(slots: DatesheetSlot[]): Promise<void> {
  const seen = await loadSeenMap();
  for (const s of slots) seen[s.id] = s.updated_at;
  await AsyncStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(seen));
}