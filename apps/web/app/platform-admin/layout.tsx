import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const PRODUCT_NAME = "EduOS";

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
    <div className="flex h-screen overflow-hidden bg-muted">
      <Sidebar title={PRODUCT_NAME} items={NAV} userName={userName} userRole="super_admin" />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar userName={userName} userRole="super_admin" showSearch={false} />
        <MobileNav title={PRODUCT_NAME} items={NAV} userName={userName} userRole="super_admin" showNotifications={false} />
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>
      </div>
    </div>
  );
}