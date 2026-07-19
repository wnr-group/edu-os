export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { TeacherStudentsBoard, type TeacherStudentRow } from "./students-board";

export default async function TeacherStudentsPage() {
  const sectionId = await getActiveSection();
  if (!sectionId) return <NoSectionPrompt />;

  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: sectionRow }, { data: enrollments }] = await Promise.all([
    supabase
      .from("sections")
      .select("name, class:classes(name)")
      .eq("id", sectionId)
      .single(),
    supabase
      .from("student_enrollments")
      .select("roll_number, student_profile:student_profiles(id, full_name, admission_number, photo_url, gender, parent:profiles!parent_profile_id(phone))")
      .eq("section_id", sectionId)
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true)
      .order("roll_number"),
  ]);

  const students: TeacherStudentRow[] = (enrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null; admission_number: string | null; photo_url: string | null; gender: string | null; parent: { phone: string | null } | null } | null;
    return {
      id: sp?.id ?? "",
      full_name: sp?.full_name ?? null,
      roll_number: e.roll_number ?? null,
      admission_number: sp?.admission_number ?? null,
      photo_url: sp?.photo_url ?? null,
      gender: sp?.gender ?? null,
      parent_phone: sp?.parent?.phone ?? null,
    };
  });

  const cls = sectionRow?.class as unknown as { name: string } | null;
  const sectionLabel = cls ? `${cls.name} – Section ${sectionRow?.name}` : sectionRow?.name ?? "";

  return (
    <TeacherStudentsBoard
      title="Students"
      description={`${sectionLabel} · ${students.length} student${students.length !== 1 ? "s" : ""}`}
      rows={students}
    />
  );
}