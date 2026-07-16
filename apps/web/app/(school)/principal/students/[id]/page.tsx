export const dynamic = "force-dynamic";

import { Users, School } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { PrincipalStudentsTable } from "./students-table";

export default async function PrincipalStudentsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [{ data: enrollments }, { data: classes }] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select(
        "roll_number, student_profile:student_profiles(id, full_name, parent:profiles!parent_profile_id(phone)), class:classes(name), section:sections(name)"
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
    const sp = e.student_profile as unknown as { id: string; full_name: string | null; parent: { phone: string | null } | null } | null;
    const c = e.class as unknown as { name: string } | null;
    const sec = e.section as unknown as { name: string } | null;
    return {
      id: sp?.id ?? "",
      name: sp?.full_name ?? "",
      roll: e.roll_number ?? "",
      class_name: c?.name ?? "",
      section: sec?.name ?? "",
      parent_phone: sp?.parent?.phone ?? "",
    };
  }).filter((r) => r.id);

  const classFilterOptions = (classes ?? []).map((c) => ({ label: c.name, value: c.name }));

  return (
    <PrincipalStudentsTable
      rows={rows}
      classFilterOptions={classFilterOptions}
      stats={
        <KpiGrid>
          <KpiCard icon={Users} label="Total Students" value={rows.length} sublabel="All enrolled students" />
          <KpiCard icon={School} label="Total Classes" value={(classes ?? []).length} sublabel="Active classes" />
        </KpiGrid>
      }
    />
  );
}