import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
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
    <div className="flex h-screen flex-col overflow-hidden bg-app-shell">
      <TopBar
        title={PRODUCT_NAME}
        logoHref="/platform-admin/dashboard"
        userName={userName}
        userRole="super_admin"
        showSearch={false}
        frequentItems={NAV}
      />
      <MobileNav title={PRODUCT_NAME} items={NAV} userName={userName} userRole="super_admin" showSearch={false} />
      <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">{children}</main>
    </div>
  );
}