import { ClipboardList } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { AddExamDialog } from "../academics/academic-dialogs";
import { ExamsTable } from "./exams-table";

export default async function ExamsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exams !== true) {
    return <ModuleUnavailable module="Exams" />;
  }

  const [{ data: academicYears }, { data: exams }] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false }),
    supabase
      .from("exams")
      .select("id, name, start_date, end_date, datesheet_published_at, academic_year:academic_years(name)")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false }),
  ]);

  const years = academicYears ?? [];

  const examRows = (exams ?? []).map((e) => {
    const ay = e.academic_year as unknown as { name: string } | null;
    return {
      id: e.id,
      name: e.name,
      academic_year: ay?.name ?? "—",
      start: e.start_date ?? "—",
      end: e.end_date ?? "—",
      published: e.datesheet_published_at !== null,
    };
  });

  return (
    <div className="space-y-6">
      <ExamsTable
        examRows={examRows}
        headerAction={
          <AddExamDialog
            schoolId={schoolId}
            academicYears={years.map((y) => ({ id: y.id, name: y.name }))}
          />
        }
        stats={
          <KpiGrid>
            <KpiCard icon={ClipboardList} label="Exams" value={examRows.length} />
          </KpiGrid>
        }
      />
    </div>
  );
}