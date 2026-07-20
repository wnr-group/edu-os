import { AlertTriangle, FileText, MessageCircle, Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { DisciplineTable, type DisciplineRow } from "./discipline-table";

export default async function AdminDisciplinePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  // student_id added to the select (was already a column, just not read before)
  // so each row can link to the existing student detail page.
  const { data: records } = await supabase
    .from("discipline_records")
    .select("id, student_id, category, severity, description, created_at, student:student_profiles(full_name, enrollments:student_enrollments(roll_number, section:sections(name, class:classes(name))))")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  const rows: DisciplineRow[] = (records ?? []).map((r) => {
    const sp = r.student as unknown as {
      full_name: string;
      enrollments: { roll_number: string | null; section: { name: string; class: { name: string } | null } | null }[] | null;
    } | null;
    const enrollment = sp?.enrollments?.[0] ?? null;
    const className = enrollment?.section?.class?.name ?? "";
    const sectionName = enrollment?.section?.name ?? "";
    return {
      id: r.id,
      student_id: (r as any).student_id ?? "",
      student_name: sp?.full_name ?? "—",
      roll_number: enrollment?.roll_number ?? "—",
      class_section: className && sectionName ? `${className} – ${sectionName}` : "—",
      category: r.category ?? "—",
      severity: r.severity as string | null,
      description: r.description ?? "—",
      date: r.created_at ? new Date(r.created_at).toLocaleDateString() : "—",
    };
  });

  const total = rows.length;
  const writtenCount = rows.filter((r) => r.severity === "written").length;
  const verbalCount = rows.filter((r) => r.severity === "verbal" || !r.severity).length;
  const pct = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}% of total` : undefined);

  const categoryOptions = Array.from(new Set(rows.map((r) => r.category).filter((c) => c && c !== "—"))).map((c) => ({
    label: c.charAt(0).toUpperCase() + c.slice(1),
    value: c,
  }));

  return (
    <DisciplineTable
      rows={rows}
      categoryOptions={categoryOptions}
      // "Pending Review" has no backing field on discipline_records yet
      // (no status/review-workflow column exists), so it's shown as a
      // placeholder rather than a fabricated count. Wire it up to a real
      // value the moment that column exists — no other layout change needed.
      stats={
        <KpiGrid>
          <KpiCard icon={AlertTriangle} label="Total Incidents" value={total} sublabel="This Academic Year" />
          <KpiCard icon={FileText} label="Written" value={writtenCount} sublabel={pct(writtenCount)} />
          <KpiCard icon={MessageCircle} label="Verbal" value={verbalCount} sublabel={pct(verbalCount)} />
          <KpiCard icon={Clock} label="Pending Review" value="—" sublabel="Not tracked yet" />
        </KpiGrid>
      }
    />
  );
}