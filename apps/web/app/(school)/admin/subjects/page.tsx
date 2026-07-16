import { BookOpen, Layers } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { AddSubjectDialog } from "./add-subject-dialog";
import { SubjectsTable } from "./subjects-table";
import { SubjectsQuickSetup } from "./subjects-quick-setup";

export default async function SubjectsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const [{ data: subjects }, { data: classes }] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, code, class:classes(name)")
      .eq("school_id", schoolId)
      .order("name"),
    supabase
      .from("classes")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("order"),
  ]);

  const rows = (subjects ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code ?? "—",
    class_name:
      (s.class as unknown as { name: string } | null)?.name ?? "—",
  }));

  const classesData = classes ?? [];

  // Unique class names for filter
  const uniqueClasses = Array.from(
    new Map(classesData.map((c) => [c.name, c])).values()
  );

  const totalSubjects = rows.length;
  const classesCovered = new Set(
    rows.filter((r) => r.class_name !== "—").map((r) => r.class_name)
  ).size;

  const classFilterOptions = uniqueClasses.map((c) => ({
    value: c.name,
    label: c.name,
  }));

  return (
    <div className="space-y-10">
      <SubjectsQuickSetup schoolId={schoolId} classes={classesData} />

      <SubjectsTable
        rows={rows}
        classFilterOptions={classFilterOptions}
        schoolId={schoolId}
        classesData={classesData}
        headerAction={<AddSubjectDialog schoolId={schoolId} classes={classesData} />}
        stats={
          <KpiGrid>
            <KpiCard icon={BookOpen} label="Total Subjects" value={totalSubjects} />
            <KpiCard icon={Layers} label="Classes Covered" value={classesCovered} />
          </KpiGrid>
        }
      />
    </div>
  );
}