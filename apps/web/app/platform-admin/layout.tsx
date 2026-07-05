import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const NAV = [
  { label: "Dashboard", href: "/platform-admin/dashboard" },
  { label: "Schools", href: "/platform-admin/schools" },
];

export default async function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["super_admin"])) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const userName = profile?.full_name ?? user.email ?? "Admin";

  return (
    <div className="flex h-screen">
      <Sidebar title="Balaji ERP" items={NAV} userName={userName} userRole="super_admin" />
      <main className="flex-1 overflow-y-auto bg-[#F8F9FC] px-8 py-6">{children}</main>
    </div>
  );
}
