import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import type { LeaveRow } from "@/components/leave-inbox";

export async function loadLeaveRows(viewerLabel: string): Promise<{ rows: LeaveRow[]; viewerLabel: string }> {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const yearId = await getAcademicYearId(schoolId);

  const { data: requests } = await supabase
    .from("leave_requests")
    .select("id, student_id, from_date, to_date, leave_type, note, status, decision_note, student:student_profiles(full_name, parent_profile_id)")
    .order("created_at", { ascending: true });

  const studentIds = [...new Set((requests ?? []).map((r) => r.student_id))];
  const parentIds = [...new Set((requests ?? []).map((r: any) => r.student?.parent_profile_id).filter(Boolean))];

  const [{ data: enrollments }, { data: parentProfiles }] = await Promise.all([
    studentIds.length
      ? supabase.from("student_enrollments").select("student_profile_id, roll_number, classes(name)")
          .in("student_profile_id", studentIds).eq("academic_year_id", yearId ?? "").eq("is_active", true)
      : Promise.resolve({ data: [] as any[] }),
    parentIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", parentIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const parentNameById = new Map((parentProfiles ?? []).map((p: any) => [p.id, p.full_name]));
  const enrollmentByStudent = new Map(
    (enrollments ?? []).map((e: any) => [e.student_profile_id, { roll: e.roll_number ?? "", className: e.classes?.name ?? "—" }])
  );

  const rows: LeaveRow[] = (requests ?? []).map((r: any) => {
    const enr = enrollmentByStudent.get(r.student_id) ?? { roll: "", className: "—" };
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: r.student?.full_name ?? "—",
      rollNumber: enr.roll,
      className: enr.className,
      parentName: parentNameById.get(r.student?.parent_profile_id) ?? "",
      fromDate: r.from_date,
      toDate: r.to_date,
      leaveType: r.leave_type,
      note: r.note,
      status: r.status,
      decisionNote: r.decision_note,
    };
  });

  return { rows, viewerLabel };
}