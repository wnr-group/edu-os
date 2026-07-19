import { Users } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { ReportCardTable } from "./report-card-table";

export default async function ReportCardsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const [{ data: students }, { data: classes }, { data: exams }] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("roll_number, student_profile:student_profiles(id, full_name), class:classes(name), section:sections(name)")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .limit(5000),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("exams")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false }),
  ]);

  const rows = (students ?? []).map((s) => {
    const sp = s.student_profile as unknown as { id: string; full_name: string | null } | null;
    const c = s.class as unknown as { name: string } | null;
    const sec = s.section as unknown as { name: string } | null;
    return {
      id: sp?.id ?? "",
      name: sp?.full_name ?? "",
      roll: s.roll_number ?? "",
      class_name: c?.name ?? "",
      section: sec?.name ?? "",
    };
  }).filter((r) => r.id);

  const classOptions = (classes ?? []).map((c) => ({ label: c.name, value: c.name }));
  const examOptions = (exams ?? []).map((e) => ({ label: e.name, value: e.id }));

  return (
    <ReportCardTable
      rows={rows}
      classOptions={classOptions}
      examOptions={examOptions}
      stats={
        <KpiGrid>
          <KpiCard icon={Users} label="Total Students" value={rows.length} />
        </KpiGrid>
      }
    />
  );
}