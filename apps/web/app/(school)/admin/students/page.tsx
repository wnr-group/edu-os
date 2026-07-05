import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { PageHeader } from "@/components/page-header";
import { AddStudentDialog } from "./add-student-dialog";
import { BulkActions } from "./bulk-actions";
import { StudentsTable } from "./students-table";

export default async function StudentsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: enrollments }, { data: classes }] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select(
        "id, roll_number, is_active, student_profile:student_profiles(id, full_name, email, admission_number, date_of_birth, gender, profile:profiles!profile_id(full_name, email), parent:profiles!parent_profile_id(full_name, phone)), class:classes(name), section:sections(name)"
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .limit(5000),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
  ]);

  const rows = (enrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null; email: string | null; admission_number: string | null; date_of_birth: string | null; gender: string | null; profile: { full_name: string; email: string } | null; parent: { full_name: string | null; phone: string | null } | null } | null;
    const c = e.class as unknown as { name: string } | null;
    const sec = e.section as unknown as { name: string } | null;
    return {
      id: sp?.id ?? e.id,
      enrollmentId: e.id,
      name: sp?.profile?.full_name ?? sp?.full_name ?? "",
      email: sp?.profile?.email ?? sp?.email ?? "",
      roll: e.roll_number ?? "",
      admission_number: sp?.admission_number ?? "",
      class_name: c?.name ?? "",
      section: sec?.name ?? "",
      parent_phone: sp?.parent?.phone ?? "",
      parent_name: sp?.parent?.full_name ?? "",
      date_of_birth: sp?.date_of_birth ?? "",
      gender: sp?.gender ?? "",
    };
  });

  const classFilterOptions = (classes ?? []).map((c) => ({
    label: c.name,
    value: c.name,
  }));

  return (
    <div>
      <PageHeader
        title="Students"
        description="Manage student enrollment and profiles."
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/students/uninstalled"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">!</span>
              App Not Installed
            </Link>
            <BulkActions students={rows} />
            <AddStudentDialog schoolId={schoolId} academicYearId={academicYearId ?? ""} classes={classes ?? []} />
          </div>
        }
        stats={[
          { label: "Total Students", value: rows.length },
          { label: "Classes", value: (classes ?? []).length },
        ]}
      />

      <StudentsTable rows={rows} classFilterOptions={classFilterOptions} />
    </div>
  );
}
