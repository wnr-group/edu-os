import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { DatesheetBuilder } from "./datesheet-builder";

export default async function ExamSchedulePage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exam_schedule !== true) {
    return <ModuleUnavailable module="Exam Schedule" />;
  }

  const supabase = await createServerSupabaseClient();

  const { data: exam } = await supabase
    .from("exams")
    .select("id, name, start_date, end_date, datesheet_published_at, academic_year:academic_years(name)")
    .eq("id", examId)
    .eq("school_id", schoolId)
    .maybeSingle();

  if (!exam) notFound();

 const [
    { data: classes },
    { data: subjects },
    { data: teacherProfiles },
    { data: rooms },
    { data: slots },
  ] = await Promise.all([
    supabase.from("classes").select("id, name, order").eq("school_id", schoolId).order("order"),
    supabase.from("subjects").select("id, name, class_id").eq("school_id", schoolId),
    supabase
      .from("teacher_profiles")
      .select("profile_id, profile:profiles(full_name)")
      .eq("school_id", schoolId),
    supabase.from("rooms").select("id, name, capacity").eq("school_id", schoolId).eq("is_active", true).order("name"),
    supabase
      .from("exam_schedule_slots")
      .select("id, class_id, subject_id, exam_date, start_time, end_time, room_id, invigilator_id, is_dirty, updated_at")
      .eq("exam_id", examId)
      .order("exam_date"),
  ]);

  const teachers = (teacherProfiles ?? []).map((t) => {
    const p = t.profile as unknown as { full_name: string } | null;
    return { id: t.profile_id, name: p?.full_name ?? "—" };
  });

  const academicYear = exam.academic_year as unknown as { name: string } | null;

  return (
    <DatesheetBuilder
      schoolId={schoolId}
      exam={{
        id: exam.id,
        name: exam.name,
        academicYearName: academicYear?.name ?? "—",
        startDate: exam.start_date,
        endDate: exam.end_date,
        datesheetPublishedAt: exam.datesheet_published_at,
      }}
      classes={classes ?? []}
      subjects={subjects ?? []}
      teachers={teachers}
      rooms={rooms ?? []}
      slots={slots ?? []}
    />
  );
}