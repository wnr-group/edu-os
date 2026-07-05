import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export default async function PrincipalLayout({
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
  if (!hasAnyRole(roles, ["principal", "school_admin", "super_admin"], schoolId)) {
    redirect("/login");
  }

  return <>{children}</>;
}
