import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { NotificationCenter } from "@/components/notification-center";

export default async function PrincipalNotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const roles = user ? await getActiveRoles(supabase, user.id) : [];
  const viewerRole = topRole(roles) ?? "principal";
  return <NotificationCenter feedbackHref="/principal/feedback" viewerRole={viewerRole} />;
}
