import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { Building2, Shield, Users, GraduationCap, AlertTriangle, Smartphone, TrendingUp, Plus, ListChecks } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DashboardTemplate, DashboardWidget } from "@/components/dashboard-template";
import { SchoolGrowthChart } from "./school-growth-chart";
import type { SchoolGrowthMonth } from "./school-growth-chart";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

interface SchoolRow {
  id: string;
  name: string;
  domain: string | null;
  is_active: boolean;
  contact_email: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
  created_at: string;
}

export default async function PlatformDashboard() {
  const supabase = createServiceSupabaseClient();

  const [
    { count: schoolCount },
    { count: platformAdminCount },
    { count: schoolUserCount },
    { count: teacherCount },
    { count: studentCount },
    { data: schools },
    { data: schoolUserRoles },
  ] = await Promise.all([
    supabase.from("schools").select("*", { count: "exact", head: true }),
    supabase.from("user_roles").select("*", { count: "exact", head: true }).is("school_id", null),
    supabase.from("user_roles").select("*", { count: "exact", head: true }).not("school_id", "is", null),
    supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "teacher"),
    supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "student"),
    supabase
      .from("schools")
      .select("id, name, domain, is_active, contact_email, app_store_url, play_store_url, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("user_roles").select("school_id").not("school_id", "is", null),
  ]);

  const schoolRows = (schools ?? []) as SchoolRow[];

  const stats: { label: string; value: number; icon: LucideIcon; iconBg: string; iconColor: string; href?: string }[] = [
    { label: "Total Schools", value: schoolCount ?? 0, icon: Building2, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", href: "/platform-admin/schools" },
    { label: "Platform Admins", value: platformAdminCount ?? 0, icon: Shield, iconBg: "bg-violet-50", iconColor: "text-violet-600", href: "/platform-admin/schools" },
    { label: "School Users", value: schoolUserCount ?? 0, icon: Users, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", href: "/platform-admin/schools" },
    { label: "Teachers", value: teacherCount ?? 0, icon: Users, iconBg: "bg-amber-50", iconColor: "text-amber-600", href: "/platform-admin/schools" },
    { label: "Students", value: studentCount ?? 0, icon: GraduationCap, iconBg: "bg-rose-50", iconColor: "text-rose-600", href: "/platform-admin/schools" },
  ];

  // Platform growth — new schools per month, last 6 months
  const now = new Date();
  const growthData: SchoolGrowthMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const count = schoolRows.filter((s) => s.created_at?.slice(0, 7) === monthKey).length;
    growthData.push({ month: MONTHS[d.getMonth()], schools: count });
  }

  // Schools overview — most recently added
  const recentSchools = schoolRows.slice(0, 6);

  // System alerts — grounded in real fields, no invented data
  const inactiveSchools = schoolRows.filter((s) => !s.is_active);
  const noContactEmail = schoolRows.filter((s) => !s.contact_email);
  const noMobileApp = schoolRows.filter((s) => !s.app_store_url && !s.play_store_url);

  // Top schools by user count
  const userCountBySchool = new Map<string, number>();
  for (const row of schoolUserRoles ?? []) {
    if (!row.school_id) continue;
    userCountBySchool.set(row.school_id, (userCountBySchool.get(row.school_id) ?? 0) + 1);
  }
  const topSchools = schoolRows
    .map((s) => ({ ...s, userCount: userCountBySchool.get(s.id) ?? 0 }))
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 5);

  return (
    <DashboardTemplate
      title="Platform Overview"
      description="Schools, users, and activity across the platform."
      stats={stats}
      chart={
        <DashboardWidget
          title="Platform Growth"
          action={
            <Link href="/platform-admin/schools" className="text-sm font-medium text-primary hover:underline">
              View all schools
            </Link>
          }
        >
          <SchoolGrowthChart data={growthData} />
        </DashboardWidget>
      }
      overview={
        <DashboardWidget title="Schools Overview">
          {recentSchools.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No schools yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentSchools.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/platform-admin/schools/${s.id}`} className="truncate text-sm font-medium text-foreground hover:underline">
                      {s.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{s.domain ?? "—"}</p>
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"} className="shrink-0">
                    {s.is_active ? "Active" : "Inactive"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      }
      alerts={
        <DashboardWidget title="System Alerts">
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="text-foreground">
                <span className="font-semibold">{inactiveSchools.length}</span> school
                {inactiveSchools.length === 1 ? "" : "s"} marked inactive
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span className="text-foreground">
                <span className="font-semibold">{noMobileApp.length}</span> school
                {noMobileApp.length === 1 ? "" : "s"} without mobile app links configured
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-foreground">
                <span className="font-semibold">{noContactEmail.length}</span> school
                {noContactEmail.length === 1 ? "" : "s"} missing a contact email
              </span>
            </li>
          </ul>
        </DashboardWidget>
      }
      topUsers={
        <DashboardWidget title="Top Schools by Users">
          {topSchools.length === 0 || topSchools[0].userCount === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No user activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {topSchools.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3">
                  <Link href={`/platform-admin/schools/${s.id}`} className="min-w-0 truncate text-sm font-medium text-foreground hover:underline">
                    {s.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {s.userCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      }
      quickActions={
        <DashboardWidget title="Quick Actions">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link href="/platform-admin/schools/new" className={buttonVariants({ variant: "default", size: "sm" }) + " justify-center"}>
              <Plus className="h-3.5 w-3.5" />
              Add School
            </Link>
            <Link href="/platform-admin/schools" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
              <ListChecks className="h-3.5 w-3.5" />
              View All Schools
            </Link>
          </div>
        </DashboardWidget>
      }
    />
  );
}