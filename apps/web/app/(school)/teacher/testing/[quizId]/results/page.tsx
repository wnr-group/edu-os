import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Percent, Clock, AlertCircle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { DataTable } from "@/components/data-table";
import { ResultsActions } from "./results-actions";

const STATUS_STYLE: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-500",
  in_progress: "bg-amber-100 text-amber-700",
  submitted: "bg-blue-100 text-blue-700",
  graded: "bg-emerald-100 text-emerald-700",
};
const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  graded: "Graded",
};

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default async function QuizResultsPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.testing !== true) return <ModuleUnavailable module="Testing" />;

  const supabase = await createServerSupabaseClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, status, mode, section_id, total_points, pushed_to_gradebook_at, section:sections(name, class:classes(name))")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) notFound();

  const section = quiz.section as unknown as { name: string; class: { name: string } | null } | null;
  const sectionLabel = section ? `${section.class?.name ?? ""} – Section ${section.name}` : "";

  const [{ data: allAttempts }, { data: enrolled }, { count: totalStudents }] = await Promise.all([
    supabase
      .from("quiz_attempts")
      .select("id, student_id, status, started_at, submitted_at, attempt_number, student:student_profiles(id, full_name)")
      .eq("quiz_id", quizId),
    supabase
      .from("student_enrollments")
      .select("student_profile_id, student_profile:student_profiles(id, full_name)")
      .eq("section_id", quiz.section_id)
      .eq("is_active", true),
    supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("section_id", quiz.section_id).eq("is_active", true),
  ]);

  // A quiz can allow multiple attempts (quizzes.attempts_allowed) — keep only
  // each student's latest attempt so retakes don't show as duplicate rows or
  // get double-counted in the KPIs below. Matches the "latest attempt" rule
  // already used by the per-student drill-down page and push_quiz_to_gradebook.
  const latestByStudent = new Map<string, NonNullable<typeof allAttempts>[number]>();
  for (const a of allAttempts ?? []) {
    const existing = latestByStudent.get(a.student_id);
    if (!existing || a.attempt_number > existing.attempt_number) latestByStudent.set(a.student_id, a);
  }
  const attempts = Array.from(latestByStudent.values());

  const attemptIds = (attempts ?? []).map((a) => a.id);
  const { data: results } = attemptIds.length > 0
    ? await supabase.from("quiz_results").select("attempt_id, total_points, max_points, percentage, fully_graded").in("attempt_id", attemptIds)
    : { data: [] as { attempt_id: string; total_points: number; max_points: number; percentage: number; fully_graded: boolean }[] };
  const resultByAttempt: Record<string, { total_points: number; max_points: number; percentage: number; fully_graded: boolean }> = {};
  for (const r of results ?? []) resultByAttempt[r.attempt_id] = r;

  const { count: pendingCount } = attemptIds.length > 0
    ? await supabase.from("quiz_answers").select("id", { count: "exact", head: true }).in("attempt_id", attemptIds).eq("grading_status", "pending_manual_grade")
    : { count: 0 };

  const attemptedIds = new Set((attempts ?? []).map((a) => a.student_id));

  const attemptRows = (attempts ?? []).map((a) => {
    const student = a.student as unknown as { id: string; full_name: string | null } | null;
    const result = resultByAttempt[a.id];
    return {
      id: a.id,
      studentId: a.student_id,
      name: student?.full_name ?? "—",
      status: a.status,
      score: result ? `${result.total_points} / ${result.max_points}` : a.status === "in_progress" ? "—" : "Awaiting grading",
      time: a.submitted_at ? formatDuration(new Date(a.submitted_at).getTime() - new Date(a.started_at).getTime()) : "—",
      submittedAt: a.submitted_at ? new Date(a.submitted_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—",
    };
  });

  const notStartedRows = (enrolled ?? [])
    .filter((e) => !attemptedIds.has(e.student_profile_id))
    .map((e) => {
      const sp = e.student_profile as unknown as { id: string; full_name: string | null } | null;
      return {
        id: `not-started-${e.student_profile_id}`,
        studentId: e.student_profile_id,
        name: sp?.full_name ?? "—",
        status: "not_started",
        score: "—",
        time: "—",
        submittedAt: "—",
      };
    });

  const rows = [...attemptRows, ...notStartedRows];

  const submittedCount = (attempts ?? []).filter((a) => a.status !== "in_progress").length;
  const gradedPct = Object.values(resultByAttempt).map((r) => r.percentage);
  const avgScore = gradedPct.length > 0 ? Math.round(gradedPct.reduce((s, p) => s + p, 0) / gradedPct.length) : null;
  const submittedWithTime = (attempts ?? []).filter((a) => a.submitted_at);
  const avgTimeMs =
    submittedWithTime.length > 0
      ? submittedWithTime.reduce((s, a) => s + (new Date(a.submitted_at!).getTime() - new Date(a.started_at).getTime()), 0) / submittedWithTime.length
      : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link href="/teacher/testing" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Testing
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{quiz.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sectionLabel}</p>
        </div>
        <ResultsActions quizId={quiz.id} status={quiz.status} pushedToGradebook={quiz.pushed_to_gradebook_at !== null} />
      </div>

      <KpiGrid>
        <KpiCard icon={ClipboardCheck} label="Submitted" value={`${submittedCount} / ${totalStudents ?? 0}`} />
        <KpiCard icon={Percent} label="Average score" value={avgScore !== null ? `${avgScore}%` : "—"} />
        <KpiCard icon={Clock} label="Average time" value={avgTimeMs !== null ? formatDuration(avgTimeMs) : "—"} />
        <KpiCard icon={AlertCircle} label="Needs manual grading" value={pendingCount ?? 0} />
      </KpiGrid>

      <DataTable
        data={rows}
        columns={[
          {
            header: "Student",
            accessor: (row) => (
              <Link href={`/teacher/testing/${quizId}/results/${row.studentId}`} className="font-medium text-primary hover:underline">
                {row.name}
              </Link>
            ),
          },
          {
            header: "Status",
            accessor: (row) => (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[row.status] ?? "bg-gray-100 text-gray-500"}`}>
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
            ),
          },
          { header: "Score", accessor: "score" },
          { header: "Time taken", accessor: "time" },
          { header: "Submitted", accessor: "submittedAt" },
        ]}
        emptyMessage="No students enrolled in this section."
      />
    </div>
  );
}
