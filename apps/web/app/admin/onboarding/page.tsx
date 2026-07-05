import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
import { WizardShell } from "./wizard-shell";

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const schoolId = await getSchoolId();
  if (!schoolId) redirect("/login");

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) redirect("/login");

  const { data: school } = await supabase
    .from("schools")
    .select("name, primary_color, logo_url")
    .eq("id", schoolId)
    .single();

  // Derive resume step from DB state
  const [
    { data: yearRow },
    { count: classCount },
    { count: teacherCount },
    { count: studentCount },
  ] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id")
      .eq("school_id", schoolId)
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("classes").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("teacher_profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("student_profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);

  const hasYear = !!yearRow;
  const hasClasses = (classCount ?? 0) > 0;
  const hasTeachers = (teacherCount ?? 0) > 0;
  const hasStudents = (studentCount ?? 0) > 0;

  // All four done → school is fully set up, skip the wizard
  if (hasYear && hasClasses && hasTeachers && hasStudents) {
    redirect("/admin/dashboard");
  }

  let initialStep = 1;
  if (hasYear && !hasClasses) initialStep = 2;
  else if (hasYear && hasClasses && !hasTeachers) initialStep = 3;
  else if (hasYear && hasClasses && hasTeachers && !hasStudents) initialStep = 4;

  return (
    <WizardShell
      schoolId={schoolId}
      schoolName={school?.name ?? "Your School"}
      brandColor={school?.primary_color ?? "#4f46e5"}
      logoUrl={school?.logo_url ?? null}
      initialStep={initialStep}
      initialAcademicYearId={yearRow?.id ?? null}
    />
  );
}
