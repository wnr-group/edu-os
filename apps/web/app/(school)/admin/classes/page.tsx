export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { ClassesBoard } from "./classes-board";

export default async function ClassesPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [
    { data: classes },
    { data: sections },
    { data: teacherProfiles },
    { data: assignments },
    { data: enrollments },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, \"order\"")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("sections")
      .select("id, name, class_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .order("name"),
    supabase
      .from("teacher_profiles")
      .select("profile_id, profile:profiles(full_name)")
      .eq("school_id", schoolId),
    supabase
      .from("section_assignments")
      .select("section_id, class_teacher_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? ""),
    supabase
      .from("student_enrollments")
      .select("section_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true),
  ]);

  const teacherOptions = (teacherProfiles ?? []).map((t) => {
    const p = t.profile as unknown as { full_name: string } | null;
    return { id: t.profile_id as string, name: p?.full_name ?? "" };
  });

  const teacherBySection = new Map(
    (assignments ?? []).map((a) => [a.section_id, a.class_teacher_id] as const)
  );

  const studentCountBySection = new Map<string, number>();
  (enrollments ?? []).forEach((e) => {
    studentCountBySection.set(e.section_id, (studentCountBySection.get(e.section_id) ?? 0) + 1);
  });

  const sectionRows = (sections ?? []).map((s) => ({
    id: s.id,
    class_id: s.class_id,
    name: s.name,
    teacherId: teacherBySection.get(s.id) ?? "",
    students: studentCountBySection.get(s.id) ?? 0,
  }));

  return (
    <ClassesBoard
      schoolId={schoolId}
      academicYearId={academicYearId ?? ""}
      classes={classes ?? []}
      sections={sectionRows}
      teacherOptions={teacherOptions}
    />
  );
}
