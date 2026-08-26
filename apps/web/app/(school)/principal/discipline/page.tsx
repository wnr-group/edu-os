import { AlertTriangle, FileText, MessageCircle, Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { DisciplineTable, type DisciplineRow } from "./discipline-table";

export default async function DisciplinePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: records } = await supabase
    .from("discipline_records")
    .select(
      "id, student_id, category, severity, status, description, created_at, student:student_profiles(full_name, enrollments:student_enrollments(roll_number))"
    )
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  const rows: DisciplineRow[] = (records ?? []).map((r) => {
    const sp = r.student as unknown as { full_name: string; enrollments: { roll_number: string | null }[] | null } | null;
    const rollNumber = sp?.enrollments?.[0]?.roll_number ?? "—";
    return {
      id: r.id,
      student_id: (r as any).student_id ?? "",
      student_name: sp?.full_name ?? "—",
      roll_number: rollNumber,
      category: r.category ?? "—",
      severity: r.severity,
      status: (r as any).status ?? "pending",
      description: r.description ?? "—",
      date: r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
    };
  });

  const total = rows.length;
  const writtenCount = rows.filter((r) => r.severity === "written").length;
  const verbalCount = rows.filter((r) => r.severity === "verbal" || !r.severity).length;
  const pendingCount = rows.filter((r) => r.status !== "reviewed").length;
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}% of total` : undefined);

  const categoryOptions = Array.from(new Set(rows.map((r) => r.category).filter((c) => c && c !== "—"))).map((c) => ({
    label: c.charAt(0).toUpperCase() + c.slice(1),
    value: c,
  }));

  return (
    <DisciplineTable
      rows={rows}
      categoryOptions={categoryOptions}
      stats={
        <KpiGrid>
          <KpiCard icon={AlertTriangle} label="Total Incidents" value={total} sublabel="This Academic Year" />
          <KpiCard icon={FileText} label="Written" value={writtenCount} sublabel={pct(writtenCount)} />
          <KpiCard icon={MessageCircle} label="Verbal" value={verbalCount} sublabel={pct(verbalCount)} />
          <KpiCard icon={Clock} label="Pending Review" value={pendingCount} sublabel={pendingCount === 0 ? "All incidents reviewed" : "Awaiting review"} />
        </KpiGrid>
      }
    />
  );
}