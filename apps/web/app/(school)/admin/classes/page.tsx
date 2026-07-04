import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { PageHeader } from "@/components/page-header";
import { AddClassDialog, AddSectionDialog } from "./class-dialogs";
import { ClassesDataTable, SectionsDataTable } from "./classes-table";
import { ClassesQuickSetup } from "./classes-quick-setup";

export default async function ClassesPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: classes }, { data: sections }, { data: teacherProfiles }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("classes")
        .select("id, name, \"order\"")
        .eq("school_id", schoolId)
        .order("order"),
      supabase
        .from("sections")
        .select("id, name, class_id, class:classes(name)")
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
    ]);

  const classTeacherBySection = new Map(
    (assignments ?? []).map((a) => [a.section_id, a.class_teacher_id] as const)
  );

  const sectionRows = (sections ?? []).map((s) => {
    const cls = s.class as unknown as { name: string } | null;
    return {
      id: s.id,
      class_name: cls?.name ?? "",
      section_name: s.name,
      class_teacher_id: classTeacherBySection.get(s.id) ?? "",
    };
  });

  const teacherOptions = (teacherProfiles ?? []).map((t) => {
    const p = t.profile as unknown as { full_name: string } | null;
    return { value: t.profile_id as string, label: p?.full_name ?? "" };
  });

  return (
    <div className="space-y-10">
      <ClassesQuickSetup schoolId={schoolId} academicYearId={academicYearId ?? ""} />

      <div>
        <PageHeader
          title="Classes"
          description="Manage classes and sections for your school."
          action={<AddClassDialog schoolId={schoolId} />}
          stats={[
            { label: "Total Classes", value: (classes ?? []).length },
            { label: "Total Sections", value: sectionRows.length },
          ]}
        />
        <ClassesDataTable classes={classes ?? []} schoolId={schoolId} />
      </div>

      <div>
        <PageHeader
          title="Sections"
          description="Assign sections to classes."
          action={<AddSectionDialog schoolId={schoolId} classes={classes ?? []} academicYearId={academicYearId ?? ""} />}
        />
        <SectionsDataTable
          sectionRows={sectionRows}
          schoolId={schoolId}
          academicYearId={academicYearId ?? ""}
          teachers={teacherOptions}
          classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}
