import { Users, ClipboardList, CalendarCheck2, AlertTriangle } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { ExamScheduleTable } from "./exam-schedule-table";

export default async function AdminReportsPage() {
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exams !== true) {
    return <ModuleUnavailable module="Exams" />;
  }

  const supabase = await createServerSupabaseClient();

  const [
    { data: exams, count: examCount },
    { count: studentCount },
    { count: disciplineCount },
    { count: attendanceCount },
  ] = await Promise.all([
    supabase
      .from("exams")
      .select("id, name, start_date, end_date, quiz_id, academic_year:academic_years(name)", { count: "exact" })
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false })
      .limit(5000),
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
  ]);

  const quizCount = (exams ?? []).filter((e) => (e as unknown as { quiz_id?: string | null }).quiz_id).length;
  const regularExamCount = (examCount ?? 0) - quizCount;

  const examRows = (exams ?? []).map((e) => {
    const ay = e.academic_year as unknown as { name: string } | null;
    return {
      id: e.id,
      name: e.name,
      isQuiz: Boolean((e as unknown as { quiz_id?: string | null }).quiz_id),
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
        <KpiCard
          icon={ClipboardList}
          label="Total Exams"
          value={examCount ?? 0}
          sublabel={quizCount > 0 ? `${regularExamCount} exams · ${quizCount} quizzes` : undefined}
        />
        <KpiCard icon={CalendarCheck2} label="Attendance Records" value={attendanceCount ?? 0} />
        <KpiCard icon={AlertTriangle} label="Discipline Incidents" value={disciplineCount ?? 0} />
      </KpiGrid>

      <ExamScheduleTable rows={examRows} />
    </div>
  );
}