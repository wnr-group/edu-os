import { AlertTriangle, FileText, MessageCircle, Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { CreateDisciplineForm } from "./create-discipline-form";
import { DisciplineTable, type DisciplineRow } from "./discipline-table";

export default async function TeacherDisciplinePage() {
  const sectionId = await getActiveSection();
  if (!sectionId) return <NoSectionPrompt />;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const schoolId = (await getSchoolId())!;

  // Fetch students enrolled in the active section
  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id, roll_number, student_profile:student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  // Build student lookup map and dropdown options
  const studentMap = new Map<string, { name: string; roll: string }>();
  const studentOptions: { value: string; label: string }[] = [];

  for (const e of enrollments ?? []) {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null } | null;
    if (!sp) continue;
    const name = sp.full_name ?? "—";
    const roll = e.roll_number ?? "—";
    studentMap.set(sp.id, { name, roll });
    studentOptions.push({ value: sp.id, label: name });
  }

  const studentIds = Array.from(studentMap.keys());

  // Fetch discipline records for students in this section
  const { data: records } = await supabase
    .from("discipline_records")
    .select("id, student_id, category, severity, description, created_at")
    .eq("school_id", schoolId)
    .in(
      "student_id",
      studentIds.length > 0
        ? studentIds
        : ["00000000-0000-0000-0000-000000000000"]
    )
    .order("created_at", { ascending: false });

  const rows: DisciplineRow[] = (records ?? []).map((r) => {
    const student = studentMap.get(r.student_id);
    return {
      id: r.id,
      student_id: r.student_id,
      student_name: student?.name ?? "—",
      roll_number: student?.roll ?? "—",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Discipline</h1>
        <p className="mt-1 text-sm text-muted-foreground">Discipline records for your section.</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-foreground">Log Incident</h2>
        <CreateDisciplineForm
          schoolId={schoolId}
          sectionId={sectionId}
          students={studentOptions}
          userId={user!.id}
        />
      </div>

      <DisciplineTable
        rows={rows}
        categoryOptions={categoryOptions}
        stats={
          <KpiGrid>
            <KpiCard icon={AlertTriangle} label="Total Incidents" value={total} sublabel="This section" />
            <KpiCard icon={FileText} label="Written" value={writtenCount} sublabel={pct(writtenCount)} />
            <KpiCard icon={MessageCircle} label="Verbal" value={verbalCount} sublabel={pct(verbalCount)} />
            <KpiCard icon={Clock} label="Pending Review" value="—" sublabel="Not tracked yet" />
          </KpiGrid>
        }
      />
    </div>
  );
}