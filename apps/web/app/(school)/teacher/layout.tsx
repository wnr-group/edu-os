import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveSection } from "@/lib/section-context";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const schoolId = await getSchoolId();
  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["teacher", "principal", "school_admin", "super_admin"], schoolId)) {
    redirect("/login");
  }

  // A user who actually holds the teacher role belongs here. An admin/principal
  // (without a teacher role) only lands here after drilling into a section;
  // otherwise send them back to their own dashboard.
  const isTeacher = roles.some((r) => r.role === "teacher");
  if (!isTeacher) {
    const activeSection = await getActiveSection();
    if (!activeSection) {
      const dest = hasAnyRole(roles, ["principal"], schoolId)
        ? "/principal/dashboard"
        : "/admin/dashboard";
      redirect(dest);
    }
  }

  return <>{children}</>;
}
