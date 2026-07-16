import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createServerSupabaseClient } from "../../lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { MobileNav } from "@/components/mobile-nav";
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

const NAV_ITEMS: Record<string, { label: string; href: string }[]> = {
  school_admin: [
    { label: "Dashboard",      href: "/admin/dashboard" },
    { label: "Teachers",       href: "/admin/teachers" },
    { label: "Students",       href: "/admin/students" },
    { label: "Classes",        href: "/admin/classes" },
    { label: "Subjects",       href: "/admin/subjects" },
    { label: "Timetable",      href: "/admin/timetable" },
    { label: "Academics",      href: "/admin/academics" },
    { label: "Fees",           href: "/admin/fees" },
    { label: "Fee Types",      href: "/admin/settings/fee-types" },
    { label: "Syllabus",       href: "/admin/syllabus" },
    { label: "Announcements",  href: "/admin/announcements" },
    { label: "Gallery",        href: "/admin/gallery" },
    { label: "Discipline",     href: "/admin/discipline" },
    { label: "Feedback",       href: "/admin/feedback" },
    { label: "Reports",        href: "/admin/reports" },
    { label: "Report Cards",   href: "/admin/report-cards" },
    { label: "Certificates",   href: "/admin/certificates" },
    { label: "Settings",       href: "/admin/settings" },
  ],
  teacher: [
    { label: "Dashboard",  href: "/teacher/dashboard" },
    { label: "Students",   href: "/teacher/students" },
    { label: "Attendance", href: "/teacher/attendance" },
    { label: "Homework",   href: "/teacher/homework" },
    { label: "Results",    href: "/teacher/results" },
    { label: "Discipline", href: "/teacher/discipline" },
    { label: "Fees",       href: "/teacher/fees" },
    { label: "Feedback",   href: "/teacher/feedback" },
  ],
  teacher_no_feedback: [
    { label: "Dashboard",  href: "/teacher/dashboard" },
    { label: "Students",   href: "/teacher/students" },
    { label: "Attendance", href: "/teacher/attendance" },
    { label: "Homework",   href: "/teacher/homework" },
    { label: "Results",    href: "/teacher/results" },
    { label: "Discipline", href: "/teacher/discipline" },
    { label: "Fees",       href: "/teacher/fees" },
  ],
  principal: [
    { label: "Dashboard",     href: "/principal/dashboard" },
    { label: "Announcements", href: "/principal/announcements" },
    { label: "Discipline",    href: "/principal/discipline" },
    { label: "Feedback",      href: "/principal/feedback" },
    { label: "Reports",       href: "/principal/reports" },
    { label: "Certificates",  href: "/principal/certificates" },
  ],
  super_admin: [
    { label: "Dashboard", href: "/platform-admin/dashboard" },
    { label: "Schools",   href: "/platform-admin/schools" },
  ],
};

const EXIT_URLS: Record<string, string> = {
  school_admin: "/admin/dashboard",
  super_admin: "/admin/dashboard",
  principal: "/principal/dashboard",
};

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

  // Nav items switch to teacher view when a section is active (for non-teacher roles)
  let navItems: { label: string; href: string }[];
  let displayRole: string;

  if (inTeacherContext) {
    navItems = NAV_ITEMS.teacher_no_feedback;
    displayRole = "teacher";
  } else if (realRole === "teacher") {
    navItems = NAV_ITEMS.teacher;
    displayRole = "teacher";
  } else {
    // super_admin visiting a school subdomain gets the school_admin nav
    const navRole = realRole === "super_admin" ? "school_admin" : realRole;
    navItems = NAV_ITEMS[navRole] ?? [];
    displayRole = realRole;
  }

  const exitUrl = EXIT_URLS[realRole];
  const sectionSwitcherEl = sections.length > 0 || realRole === "teacher" ? (
    <SectionSwitcher
      sections={sections}
      activeSectionId={activeSectionId}
      userRole={realRole}
      exitUrl={realRole !== "teacher" ? exitUrl : undefined}
    />
  ) : null;

  return (
    <div className="flex h-screen overflow-hidden bg-muted">
      <Sidebar
        title={schoolName}
        items={navItems}
        brandColor={brandColor}
        userName={sidebarUserName}
        userRole={displayRole}
        sectionSwitcher={sectionSwitcherEl}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          userName={sidebarUserName}
          userRole={displayRole}
          brandColor={brandColor}
          yearSwitcher={
            years.length > 0 ? (
              <AcademicYearSwitcher years={years} currentYearId={currentYearId} />
            ) : undefined
          }
        />
        <MobileNav
          title={schoolName}
          items={navItems}
          brandColor={brandColor}
          userName={sidebarUserName}
          userRole={displayRole}
          sectionSwitcher={sectionSwitcherEl}
        />
        <main className="flex-1 overflow-y-auto p-4 pb-24 lg:p-8 lg:pb-8">
          {years.find((y) => y.id === currentYearId)?.status === "draft" && (
            <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <strong>Draft year:</strong> You are configuring a year that is not yet active. Changes here will not affect the live school until you activate this year from the{" "}
              <a href="/admin/academics" className="underline">Academics page</a>.
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}