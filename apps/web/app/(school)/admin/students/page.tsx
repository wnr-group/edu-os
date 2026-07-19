import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { StudentsBoard } from "./students-board";

export default async function StudentsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: enrollments }, { data: classes }] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select(
        "id, roll_number, is_active, student_profile:student_profiles(id, full_name, email, admission_number, date_of_birth, gender, profile:profiles!profile_id(full_name, email), parent:profiles!parent_profile_id(full_name, phone)), class:classes(id, name), section:sections(id, name)"
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true)
      .limit(5000),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
  ]);

  const rows = (enrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null; email: string | null; admission_number: string | null; date_of_birth: string | null; gender: string | null; profile: { full_name: string; email: string } | null; parent: { full_name: string | null; phone: string | null } | null } | null;
    const c = e.class as unknown as { id: string; name: string } | null;
    const sec = e.section as unknown as { id: string; name: string } | null;
    return {
      id: sp?.id ?? e.id,
      enrollmentId: e.id,
      name: sp?.profile?.full_name ?? sp?.full_name ?? "",
      email: sp?.profile?.email ?? sp?.email ?? "",
      roll: e.roll_number ?? "",
      admission_number: sp?.admission_number ?? "",
      class_id: c?.id ?? "",
      class_name: c?.name ?? "",
      section_id: sec?.id ?? "",
      section: sec?.name ?? "",
      parent_phone: sp?.parent?.phone ?? "",
      parent_name: sp?.parent?.full_name ?? "",
      date_of_birth: sp?.date_of_birth ?? "",
      gender: sp?.gender ?? "",
    };
  });

  return (
    <StudentsBoard
      schoolId={schoolId}
      academicYearId={academicYearId ?? ""}
      rows={rows}
      classes={classes ?? []}
    />
  );
}