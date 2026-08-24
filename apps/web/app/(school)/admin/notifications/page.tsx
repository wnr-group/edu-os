import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { NotificationCenter } from "@/components/notification-center";

// Both an actual school_admin AND a super_admin visiting this school's
// subdomain land on this same route (super_admin inherits school_admin's
// nav/routing here) — the category filter needs the real resolved role,
// not just "this is the /admin route", to know whether to show Leave.
export default async function AdminNotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const roles = user ? await getActiveRoles(supabase, user.id) : [];
  const viewerRole = topRole(roles) ?? "school_admin";
  return <NotificationCenter feedbackHref="/admin/feedback" viewerRole={viewerRole} />;
}
