import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { TimetableForm } from "./timetable-form";
import { TimetableTable } from "./timetable-table";

const DAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

export default async function TimetablePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [
    { data: teacherProfiles },
    { data: classes },
    { data: sections },
    { data: subjects },
    { data: slots },
  ] = await Promise.all([
    supabase
      .from("teacher_profiles")
      .select("profile_id, profile:profiles(full_name)")
      .eq("school_id", schoolId),
    supabase
      .from("classes")
      .select("id, name, order")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("sections")
      .select("id, name, class_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? ""),
    supabase
      .from("subjects")
      .select("id, name, class_id")
      .eq("school_id", schoolId),
    supabase
      .from("timetable")
      .select(
        "id, day_of_week, period, teacher_id, section:sections(name, class:classes(name, order)), subject:subjects(name)"
      )
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .order("day_of_week")
      .order("period"),
  ]);

  // Build a teacher name lookup from teacher_profiles
  const teacherNameMap = new Map(
    (teacherProfiles ?? []).map((t) => {
      const p = t.profile as unknown as { full_name: string } | null;
      return [t.profile_id, p?.full_name ?? ""] as const;
    })
  );

  const teacherOptions = (teacherProfiles ?? []).map((t) => {
    const p = t.profile as unknown as { full_name: string } | null;
    return { value: t.profile_id, label: p?.full_name ?? "" };
  });

  const classOptions = (classes ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    order: c.order as number,
  }));

  const sectionOptions = (sections ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    classId: s.class_id,
  }));

  const subjectOptions = (subjects ?? []).map((s) => ({
    value: s.id,
    label: s.name,
    classId: s.class_id,
  }));

  const tableRows = (slots ?? []).map((s) => {
    const section = s.section as unknown as {
      name: string;
      class: { name: string; order: number } | null;
    } | null;
    const subject = s.subject as unknown as { name: string } | null;
    const className = section?.class?.name ?? "";
    const classOrder = section?.class?.order ?? 0;
    return {
      id: s.id,
      teacher: teacherNameMap.get(s.teacher_id) ?? "",
      class: className,
      classOrder,
      section: section?.name ?? "",
      subject: subject?.name ?? "",
      day: DAY_NAMES[s.day_of_week] ?? String(s.day_of_week),
      dayOfWeek: s.day_of_week,
      period: s.period,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Timetable</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Assign teachers to class sections, subjects, and periods.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-medium text-foreground">Assign Teacher</h2>
        {academicYearId ? (
          <TimetableForm
            schoolId={schoolId}
            academicYearId={academicYearId}
            teachers={teacherOptions}
            classes={classOptions}
            sections={sectionOptions}
            subjects={subjectOptions}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            No active academic year. Set one up under Academics before assigning teachers.
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium text-foreground">Current Assignments</h2>
        <TimetableTable rows={tableRows} schoolId={schoolId} />
      </div>
    </div>
  );
}
