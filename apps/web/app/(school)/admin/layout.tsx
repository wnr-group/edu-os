import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export default async function AdminLayout({
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
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) redirect("/login");

  // Redirect to onboarding if school has no academic years yet
  if (schoolId) {
    const { count } = await supabase
      .from("academic_years")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);
    if ((count ?? 0) === 0) {
      redirect("/admin/onboarding");
    }
  }

  return <>{children}</>;
}
