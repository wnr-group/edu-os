import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import type { PtmRow } from "@/components/ptm-inbox";

// One query, RLS-scoped — the same row set naturally narrows per role
// (teacher sees only their own meetings, admin/principal see the whole
// school, parent sees their own child's) exactly like loadLeaveRows().
export async function loadPtmRows(viewerLabel: string): Promise<{ rows: PtmRow[]; viewerLabel: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: meetings } = await supabase
    .from("ptm_meetings")
    .select(
      "id, teacher_id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, cancelled_reason, student:student_profiles(id, full_name), section:sections(name, class:classes(name)), subject:subjects(name)"
    )
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });

  // teacher_id references auth.users, not profiles, so it can't be embedded
  // via PostgREST — resolved as a separate lookup map, same pattern as
  // exam_schedule's invigilator_id → teacherById in calendar-preview.tsx.
  const teacherIds = [...new Set((meetings ?? []).map((m) => m.teacher_id))];
  const { data: teacherProfiles } = teacherIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const teacherNameById = new Map((teacherProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  const meetingIds = (meetings ?? []).map((m) => m.id);
  const { data: feedback } = meetingIds.length > 0
    ? await supabase.from("ptm_feedback").select("meeting_id").in("meeting_id", meetingIds)
    : { data: [] as { meeting_id: string }[] };
  const hasFeedback = new Set((feedback ?? []).map((f) => f.meeting_id));

  const rows: PtmRow[] = (meetings ?? []).map((m) => {
    const student = m.student as unknown as { id: string; full_name: string | null } | null;
    const section = m.section as unknown as { name: string; class: { name: string } | null } | null;
    const subject = m.subject as unknown as { name: string } | null;
    return {
      id: m.id,
      studentId: student?.id ?? "",
      studentName: student?.full_name ?? "—",
      teacherName: teacherNameById.get(m.teacher_id) ?? "—",
      className: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
      subjectName: subject?.name ?? null,
      scheduledDate: m.scheduled_date,
      startTime: m.start_time,
      durationMinutes: m.duration_minutes,
      meetingMode: m.meeting_mode,
      location: m.location,
      status: m.status,
      cancelledReason: m.cancelled_reason,
      hasFeedback: hasFeedback.has(m.id),
    };
  });

  return { rows, viewerLabel };
}

export interface PtmSectionOption {
  id: string;
  label: string;
  classId: string;
}
export interface PtmStudentOption {
  id: string;
  fullName: string;
  sectionId: string;
}
export interface PtmTeacherOption {
  id: string;
  fullName: string;
  sectionId: string;
}
export interface PtmSubjectOption {
  id: string;
  name: string;
  classId: string;
}

// Data needed by the "Schedule meeting" form. Sections are scoped to what
// the caller teaches for a teacher (same timetable-based lookup used by the
// school layout's section switcher); admin/principal get every section in
// the school, matching how they schedule for any class.
export async function loadPtmSchedulingContext(role: string, userId: string): Promise<{
  sections: PtmSectionOption[];
  students: PtmStudentOption[];
  teachers: PtmTeacherOption[];
  subjects: PtmSubjectOption[];
  // Bulk scheduling is available to admin/principal (any permitted section)
  // and to teachers (their own assigned sections only — `sections` above is
  // already scoped to the teacher's own timetable, same as the single-
  // meeting flow, and bulk_schedule_ptm_meetings re-enforces the section
  // association server-side regardless of what this list contains).
  allowBulk: boolean;
  // True only for a teacher caller. Bulk mode has no per-row teacher picker
  // for a teacher — bulk_schedule_ptm_meetings requires p_teacher_id =
  // auth.uid() on that branch — so the drawer must lock the teacher field
  // to the signed-in teacher instead of offering the admin/principal-style
  // free picker.
  bulkTeacherLocked: boolean;
  currentUserId: string;
}> {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  let sectionIds: string[] | null = null;
  if (role === "teacher") {
    let ttQuery = supabase.from("timetable").select("section_id").eq("teacher_id", userId);
    if (academicYearId) ttQuery = ttQuery.eq("academic_year_id", academicYearId);
    const { data: ttRows } = await ttQuery;
    sectionIds = [...new Set((ttRows ?? []).map((r) => r.section_id))];
  }

  let sectionQuery = supabase.from("sections").select("id, name, class_id, class:classes(name)").eq("school_id", schoolId);
  if (sectionIds) sectionQuery = sectionIds.length > 0 ? sectionQuery.in("id", sectionIds) : sectionQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  const { data: sectionRows } = await sectionQuery;
  const sections: PtmSectionOption[] = (sectionRows ?? []).map((s) => {
    const cls = s.class as unknown as { name: string } | null;
    return { id: s.id, classId: s.class_id, label: `${cls?.name ?? ""} – ${s.name}` };
  });

  const scopedSectionIds = sections.map((s) => s.id);
  const emptyEnrollments: { student_profile_id: string; section_id: string; student_profile: { id: string; full_name: string | null } | null }[] = [];
  const emptyAssignments: { section_id: string; class_teacher_id: string }[] = [];
  const emptyTimetable: { section_id: string; teacher_id: string }[] = [];
  const [{ data: enrollments }, { data: assignmentRows }, { data: timetableRows }, { data: subjectRows }] = await Promise.all([
    scopedSectionIds.length > 0
      ? supabase
          .from("student_enrollments")
          .select("student_profile_id, section_id, student_profile:student_profiles(id, full_name)")
          .in("section_id", scopedSectionIds)
          .eq("is_active", true)
      : Promise.resolve({ data: emptyEnrollments }),
    // Teachers associated with each section — the same two relationships
    // teaches_section() checks (class_teacher_id in section_assignments, or
    // appears in timetable), scoped to the active academic year. Restricts
    // the "Schedule meeting" teacher picker per section so a meeting can't
    // accidentally be assigned to an unrelated teacher — enforced again
    // server-side in schedule_ptm_meeting, this is just the UI narrowing.
    scopedSectionIds.length > 0 && academicYearId
      ? supabase.from("section_assignments").select("section_id, class_teacher_id").in("section_id", scopedSectionIds).eq("academic_year_id", academicYearId)
      : Promise.resolve({ data: emptyAssignments }),
    scopedSectionIds.length > 0 && academicYearId
      ? supabase.from("timetable").select("section_id, teacher_id").in("section_id", scopedSectionIds).eq("academic_year_id", academicYearId)
      : Promise.resolve({ data: emptyTimetable }),
    supabase.from("subjects").select("id, name, class_id").eq("school_id", schoolId),
  ]);

  const students: PtmStudentOption[] = (enrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null } | null;
    return { id: sp?.id ?? e.student_profile_id, fullName: sp?.full_name ?? "—", sectionId: e.section_id };
  });

  const teacherSectionPairs = new Set<string>();
  const teacherIds = new Set<string>();
  for (const a of assignmentRows ?? []) { teacherSectionPairs.add(`${a.class_teacher_id}::${a.section_id}`); teacherIds.add(a.class_teacher_id); }
  for (const t of timetableRows ?? []) { teacherSectionPairs.add(`${t.teacher_id}::${t.section_id}`); teacherIds.add(t.teacher_id); }
  const { data: teacherProfiles } = teacherIds.size > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", [...teacherIds])
    : { data: [] as { id: string; full_name: string | null }[] };
  const teacherNameById = new Map((teacherProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const teachers: PtmTeacherOption[] = [...teacherSectionPairs].map((pair) => {
    const [teacherId, sectionId] = pair.split("::");
    return { id: teacherId, sectionId, fullName: teacherNameById.get(teacherId) ?? "—" };
  });

  const subjects: PtmSubjectOption[] = (subjectRows ?? []).map((s) => ({ id: s.id, name: s.name, classId: s.class_id }));

  return { sections, students, teachers, subjects, allowBulk: true, bulkTeacherLocked: role === "teacher", currentUserId: userId };
}

// ── Phase 4 — parent self-service booking (Bookings tab) ────────────────

export interface PtmBookingRow {
  id: string; // ptm_meetings.id
  studentName: string;
  parentName: string;
  className: string;
  teacherId: string;
  teacherName: string;
  scheduledDate: string;
  startTime: string;
  bookedAt: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  /** Whether the CURRENT viewer has acknowledged this booking — drives the per-tab unread indicator. */
  acknowledgedByMe: boolean;
}

// Booking-origin rows are just ptm_meetings where booking_slot_id IS NOT
// NULL — no separate table to query. They also still appear in the
// Scheduled/Completed/Cancelled tabs via loadPtmRows unchanged; this is a
// cross-cutting view onto the same rows, not a different bucket.
export async function loadPtmBookings(currentUserId: string): Promise<PtmBookingRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data: meetings } = await supabase
    .from("ptm_meetings")
    .select(
      "id, teacher_id, parent_id, scheduled_date, start_time, status, created_at, student:student_profiles(full_name), section:sections(name, class:classes(name))"
    )
    .not("booking_slot_id", "is", null)
    .order("created_at", { ascending: false });

  const rows = meetings ?? [];

  const peopleIds = [...new Set(rows.flatMap((m) => [m.teacher_id, m.parent_id]).filter((id): id is string => !!id))];
  const { data: profiles } = peopleIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", peopleIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  const meetingIds = rows.map((m) => m.id);
  const { data: myAcks } = meetingIds.length > 0
    ? await supabase.from("ptm_booking_acknowledgements").select("meeting_id").eq("user_id", currentUserId).in("meeting_id", meetingIds)
    : { data: [] as { meeting_id: string }[] };
  const ackedByMe = new Set((myAcks ?? []).map((a) => a.meeting_id));

  return rows.map((m) => {
    const student = m.student as unknown as { full_name: string | null } | null;
    const section = m.section as unknown as { name: string; class: { name: string } | null } | null;
    return {
      id: m.id,
      studentName: student?.full_name ?? "—",
      parentName: m.parent_id ? nameById.get(m.parent_id) ?? "—" : "—",
      className: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
      teacherId: m.teacher_id,
      teacherName: nameById.get(m.teacher_id) ?? "—",
      scheduledDate: m.scheduled_date,
      startTime: m.start_time,
      bookedAt: m.created_at,
      status: m.status,
      acknowledgedByMe: ackedByMe.has(m.id),
    };
  });
}

// ── Phase 4 refinement — Available Slots tab ─────────────────────────────

export interface PtmSlotItem {
  id: string;
  startTime: string;
  durationMinutes: number;
  meetingMode: "in_person" | "online";
  location: string | null;
  subjectName: string | null;
  status: "open" | "booked";
  /** Only ever set for a booked slot — an open slot has no student attached until a parent claims it. */
  bookedStudentName: string | null;
  bookedParentName: string | null;
}

export interface PtmSlotGroup {
  key: string;
  teacherId: string;
  teacherName: string;
  sectionId: string;
  className: string;
  scheduledDate: string;
  /** Actively enrolled students in this section — a separate figure from the slot count below, never combined into one ambiguous fraction (§10 decision from the approved refinement plan). */
  sectionStudentCount: number;
  slots: PtmSlotItem[];
}

// Withdrawn slots are excluded entirely — both from the list and from the
// booked/total counts below — since they're no longer part of what's
// currently on offer. "Total" therefore means open+booked (what a parent
// could see or has claimed), not everything ever published.
export async function loadPtmAvailableSlots(): Promise<PtmSlotGroup[]> {
  const supabase = await createServerSupabaseClient();

  const { data: slotRows } = await supabase
    .from("ptm_availability_slots")
    .select(
      "id, teacher_id, section_id, academic_year_id, scheduled_date, start_time, duration_minutes, meeting_mode, location, status, booked_meeting_id, subject:subjects(name), section:sections(name, class:classes(name))"
    )
    .neq("status", "withdrawn")
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });

  const rows = slotRows ?? [];
  if (rows.length === 0) return [];

  const teacherIds = [...new Set(rows.map((r) => r.teacher_id))];
  const { data: teacherProfiles } = teacherIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", teacherIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const teacherNameById = new Map((teacherProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));

  // Resolve the student/parent for each booked slot via its ptm_meetings row.
  const bookedMeetingIds = rows.map((r) => r.booked_meeting_id).filter((id): id is string => !!id);
  const { data: bookedMeetings } = bookedMeetingIds.length > 0
    ? await supabase.from("ptm_meetings").select("id, parent_id, student:student_profiles(full_name)").in("id", bookedMeetingIds)
    : { data: [] as { id: string; parent_id: string | null; student: unknown }[] };
  const parentIds = [...new Set((bookedMeetings ?? []).map((m) => m.parent_id).filter((id): id is string => !!id))];
  const { data: parentProfiles } = parentIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", parentIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const parentNameById = new Map((parentProfiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const bookedInfoByMeetingId = new Map(
    (bookedMeetings ?? []).map((m) => {
      const student = m.student as unknown as { full_name: string | null } | null;
      return [m.id, { studentName: student?.full_name ?? "—", parentName: m.parent_id ? parentNameById.get(m.parent_id) ?? "—" : "—" }];
    })
  );

  // One enrollment-count query per distinct (section, academic_year) pair
  // appearing in the slot list — the "N students" figure shown alongside,
  // never folded into the slots-booked fraction.
  const sectionYearPairs = [...new Set(rows.map((r) => `${r.section_id}::${r.academic_year_id}`))];
  const studentCountByPair = new Map<string, number>();
  await Promise.all(
    sectionYearPairs.map(async (pair) => {
      const [sectionId, academicYearId] = pair.split("::");
      const { count } = await supabase
        .from("student_enrollments")
        .select("id", { count: "exact", head: true })
        .eq("section_id", sectionId)
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
      studentCountByPair.set(pair, count ?? 0);
    })
  );

  const groups = new Map<string, PtmSlotGroup>();
  for (const r of rows) {
    const key = `${r.teacher_id}::${r.section_id}::${r.scheduled_date}`;
    let group = groups.get(key);
    if (!group) {
      const section = r.section as unknown as { name: string; class: { name: string } | null } | null;
      group = {
        key,
        teacherId: r.teacher_id,
        teacherName: teacherNameById.get(r.teacher_id) ?? "—",
        sectionId: r.section_id,
        className: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
        scheduledDate: r.scheduled_date,
        sectionStudentCount: studentCountByPair.get(`${r.section_id}::${r.academic_year_id}`) ?? 0,
        slots: [],
      };
      groups.set(key, group);
    }
    const subject = r.subject as unknown as { name: string } | null;
    const booked = r.booked_meeting_id ? bookedInfoByMeetingId.get(r.booked_meeting_id) : null;
    group.slots.push({
      id: r.id,
      startTime: r.start_time,
      durationMinutes: r.duration_minutes,
      meetingMode: r.meeting_mode as "in_person" | "online",
      location: r.location,
      subjectName: subject?.name ?? null,
      status: r.status as "open" | "booked",
      bookedStudentName: booked?.studentName ?? null,
      bookedParentName: booked?.parentName ?? null,
    });
  }

  return [...groups.values()].sort((a, b) => (a.scheduledDate + a.className + a.teacherName).localeCompare(b.scheduledDate + b.className + b.teacherName));
}
