import { Users, ClipboardList, CalendarCheck2, AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { ExamScheduleTable } from "@/app/(school)/admin/reports/exam-schedule-table";

export default async function PrincipalReportsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const [
    { data: exams, count: examCount },
    { count: studentCount },
    { count: disciplineCount },
    { count: attendanceCount },
    { data: quizLinks },
  ] = await Promise.all([
    supabase
      .from("exams")
      .select("id, name, start_date, end_date, academic_year:academic_years(name)", { count: "exact" })
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false }),
    supabase
      .from("student_profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId),
    supabase
      .from("discipline_records")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId),
    supabase
      .from("attendance_records")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId),
    supabase.from("quizzes").select("exam_id").eq("school_id", schoolId).not("exam_id", "is", null),
  ]);

  const quizExamIds = new Set((quizLinks ?? []).map((q) => q.exam_id));

  const examRows = (exams ?? []).map((e) => {
    const ay = e.academic_year as unknown as { name: string } | null;
    return {
      id: e.id,
      name: e.name,
      isQuiz: quizExamIds.has(e.id),
      academic_year: ay?.name ?? "—",
      start_date: e.start_date ? new Date(e.start_date).toLocaleDateString() : "—",
      end_date: e.end_date ? new Date(e.end_date).toLocaleDateString() : "—",
    };
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">School-wide summary and exam schedule.</p>
      </div>

      <KpiGrid>
        <KpiCard icon={Users} label="Total Students" value={studentCount ?? 0} />
        <KpiCard icon={ClipboardList} label="Total Exams" value={examCount ?? 0} />
        <KpiCard icon={CalendarCheck2} label="Attendance Records" value={attendanceCount ?? 0} />
        <KpiCard icon={AlertTriangle} label="Discipline Incidents" value={disciplineCount ?? 0} />
      </KpiGrid>

      <ExamScheduleTable rows={examRows} />
    </div>
  );
}
