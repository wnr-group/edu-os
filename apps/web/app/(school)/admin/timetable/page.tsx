import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { PageHeader } from "@/components/page-header";
import { TimetableGrid } from "./timetable-grid";

export default async function TimetablePage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  if (!academicYearId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Timetable" description="A week-at-a-glance schedule for every class and teacher." />
        <p className="text-sm text-muted-foreground">
          No active academic year. Set one up under Academics before building a timetable.
        </p>
      </div>
    );
  }

  const [
    { data: activeRoles },
    { data: teacherProfiles },
    { data: classes },
    { data: sections },
    { data: subjects },
    { data: slots },
  ] = await Promise.all([
    supabase
      .from("user_roles")
      .select("user_id")
      .eq("school_id", schoolId)
      .eq("role", "teacher")
      .eq("is_active", true),
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
      .eq("academic_year_id", academicYearId)
      .order("name"),
    supabase
      .from("subjects")
      .select("id, name, class_id")
      .eq("school_id", schoolId)
      .order("name"),
    supabase
      .from("timetable")
      .select("id, section_id, day_of_week, period, subject_id, teacher_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId),
  ]);

  const activeUserIds = new Set((activeRoles ?? []).map((r) => r.user_id));

  const teachers = (teacherProfiles ?? [])
    .filter((t) => activeUserIds.has(t.profile_id))
    .map((t) => {
      const p = t.profile as unknown as { full_name: string } | null;
      return { id: t.profile_id, name: p?.full_name ?? "" };
    });

  return (
    <div className="space-y-6">
      <TimetableGrid
        schoolId={schoolId}
        academicYearId={academicYearId}
        classes={classes ?? []}
        sections={sections ?? []}
        subjects={subjects ?? []}
        teachers={teachers}
        slots={slots ?? []}
      />
    </div>
  );
}
