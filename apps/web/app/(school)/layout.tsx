import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { NAV_CONFIG, allNavItems, withBadge } from "@/lib/nav-config";
import { fetchUnreviewedFlagGroupCount } from "@/lib/geo-attendance";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SectionSwitcher } from "@/components/section-switcher";
import type { SectionOption } from "@/components/section-switcher";
import { AcademicYearSwitcher } from "@/components/academic-year-switcher";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};



const SCHOOL_ROLES = [
  "super_admin",
  "school_admin",
  "principal",
  "teacher",
] as const;

export default async function SchoolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [roles, { data: profile }] = await Promise.all([
    getActiveRoles(supabase, user.id),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single(),
  ]);

  // A user may hold several roles; use the most privileged for navigation/UI.
  const realRole = topRole(roles);
  if (
    !realRole ||
    !SCHOOL_ROLES.includes(realRole as (typeof SCHOOL_ROLES)[number])
  ) {
    redirect("/login");
  }
  const userName = profile?.full_name || user.email || "User";

  let brandColor: string | undefined;
  let schoolName = "School ERP";
  const schoolId = await getSchoolId();
  if (schoolId) {
    const { data: school } = await supabase
      .from("schools")
      .select("name, primary_color")
      .eq("id", schoolId)
      .single();
    brandColor = school?.primary_color ?? undefined;
    schoolName = school?.name ?? "School ERP";
  }

  // Fetch years for switcher (admin/principal only)
  const hdrs = await headers();
  const currentYearId = hdrs.get("x-academic-year-id") ?? null;
  let years: { id: string; name: string; status: "draft" | "active" | "archived" }[] = [];
  if (schoolId && (realRole === "school_admin" || realRole === "super_admin" || realRole === "principal")) {
    const { data: yearRows } = await supabase
      .from("academic_years")
      .select("id, name, status")
      .eq("school_id", schoolId)
      .order("start_date", { ascending: false });
    years = (yearRows ?? []) as typeof years;
  }

  // Read active section cookie
  const cookieStore = await cookies();
  const activeSectionId = cookieStore.get("active_section")?.value ?? null;

  // Query available sections based on role
  let sections: SectionOption[] = [];
  if (schoolId) {
    if (realRole === "teacher") {
      let ttQuery = supabase
        .from("timetable")
        .select("section:sections(id, name, class:classes(name, order))")
        .eq("teacher_id", user.id);
      if (currentYearId) ttQuery = ttQuery.eq("academic_year_id", currentYearId);
      const [, { data: timetableRows }] = await Promise.all([
        supabase
          .from("teacher_profiles")
          .select("profile_id")
          .eq("profile_id", user.id)
          .maybeSingle(),
        ttQuery,
      ]);

      const seen = new Set<string>();

      for (const row of timetableRows ?? []) {
        const sec = row.section as unknown as { id: string; name: string; class: { name: string; order: number } | null };
        if (sec?.id && !seen.has(sec.id)) {
          seen.add(sec.id);
          sections.push({ id: sec.id, name: sec.name, className: sec.class?.name ?? "", classOrder: sec.class?.order ?? 0 });
        }
      }
    } else {
      let secQuery = supabase
        .from("sections")
        .select("id, name, class:classes(name, order)")
        .eq("school_id", schoolId);
      if (currentYearId) secQuery = secQuery.eq("academic_year_id", currentYearId);
      const { data: allSections } = await secQuery;

      for (const sec of allSections ?? []) {
        const cls = sec.class as unknown as { name: string; order: number } | null;
        sections.push({ id: sec.id, name: sec.name, className: cls?.name ?? "", classOrder: cls?.order ?? 0 });
      }
    }
  }

  // When a non-teacher has an active section they're viewing teacher context
  const inTeacherContext = !!activeSectionId && realRole !== "teacher";

  // If in teacher context, look up the class teacher for the active section
  let sidebarUserName = userName;
  if (inTeacherContext && activeSectionId && schoolId) {
    const { data: ct } = await supabase
      .from("section_assignments")
      .select("class_teacher_id")
      .eq("section_id", activeSectionId)
      .maybeSingle();
    let ctProfile: { full_name: string } | null = null;
    if (ct?.class_teacher_id) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", ct.class_teacher_id)
        .maybeSingle();
      ctProfile = pr;
    }
    if (ctProfile?.full_name) sidebarUserName = ctProfile.full_name;
  }

  // Nav config switches to the teacher variant when a section is active
  // (for non-teacher roles), same as before — just resolved from
  // lib/nav-config's role → {frequent, sections} map instead of a flat list.
  let navKey: string;
  let displayRole: string;

  if (inTeacherContext) {
    navKey = "teacher_no_feedback";
    displayRole = "teacher";
  } else if (realRole === "teacher") {
    navKey = "teacher";
    displayRole = "teacher";
  } else {
    // super_admin visiting a school subdomain gets the school_admin nav
    navKey = realRole === "super_admin" ? "school_admin" : realRole;
    displayRole = realRole;
  }

  let navConfig = NAV_CONFIG[navKey] ?? { frequent: [], sections: [] };
  if (schoolId && (displayRole === "school_admin" || displayRole === "principal")) {
    const unreviewedCount = await fetchUnreviewedFlagGroupCount(supabase, schoolId);
    const badgeHref = displayRole === "school_admin" ? "/admin/settings/geo-attendance" : "/principal/attendance/geo-review";
    navConfig = withBadge(navConfig, badgeHref, unreviewedCount);
  }
// Mobile has no top nav, so its drawer/bottom-tab-bar needs every page,
// frequent + sectioned, flattened into one list (the original pattern).
const allItems = allNavItems(navConfig);
const dashboardHref = navConfig.frequent[0]?.href ?? "/login";
// Only School Admin has a Settings page today.
const settingsHref = displayRole === "school_admin" ? "/admin/settings" : undefined;

  const EXIT_URLS: Record<string, string> = {
    school_admin: "/admin/dashboard",
    super_admin: "/admin/dashboard",
    principal: "/principal/dashboard",
  };
  const exitUrl = EXIT_URLS[realRole];
  const showSectionSwitcher = sections.length > 0 || realRole === "teacher";
  const sectionSwitcherProps = {
    sections,
    activeSectionId,
    userRole: realRole,
    exitUrl: realRole !== "teacher" ? exitUrl : undefined,
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app-shell">
      <TopBar
        title={schoolName}
        logoHref={dashboardHref}
        userName={sidebarUserName}
        userRole={displayRole}
        brandColor={brandColor}
        frequentItems={navConfig.frequent}
        moreSections={navConfig.sections}
        settingsHref={settingsHref}
        sectionSwitcher={
          showSectionSwitcher ? (
            <SectionSwitcher {...sectionSwitcherProps} variant="light" layout="inline" />
          ) : null
        }
        yearSwitcher={
          years.length > 0 ? (
            <AcademicYearSwitcher years={years} currentYearId={currentYearId} />
          ) : undefined
        }
      />
      <MobileNav
        title={schoolName}
        items={allItems}
        brandColor={brandColor}
        userName={sidebarUserName}
        userRole={displayRole}
        sectionSwitcher={
          showSectionSwitcher ? <SectionSwitcher {...sectionSwitcherProps} variant="light" /> : null
        }
      />
      <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">
        <div className="mb-4">
          <Breadcrumbs homeHref={dashboardHref} />
        </div>
        {years.find((y) => y.id === currentYearId)?.status === "draft" && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>Draft year:</strong> You are configuring a year that is not yet active. Changes here will not affect the live school until you activate this year from the{" "}
            <a href="/admin/academics" className="underline">Academics page</a>.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}