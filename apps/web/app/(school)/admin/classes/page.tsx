export const dynamic = "force-dynamic";

import { School, Layers, Users, CalendarDays } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { PageHeader } from "@/components/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { AddClassDialog, AddSectionDialog } from "./class-dialogs";
import { ClassesDataTable, SectionsDataTable } from "./classes-table";
import { ClassesQuickSetup } from "./classes-quick-setup";

type Tab = "quick-setup" | "all-classes";

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: Tab = tab === "all-classes" ? "all-classes" : "quick-setup";

  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const academicYearId = await getAcademicYearId(schoolId);

  const [
    { data: classes },
    { data: sections },
    { data: teacherProfiles },
    { data: assignments },
    { count: studentCount },
    { data: academicYear },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, \"order\"")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("sections")
      .select("id, name, class_id, class:classes(name)")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .order("name"),
    supabase
      .from("teacher_profiles")
      .select("profile_id, profile:profiles(full_name)")
      .eq("school_id", schoolId),
    supabase
      .from("section_assignments")
      .select("section_id, class_teacher_id")
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? ""),
    // Additive, read-only: powers the new "Total Students" overview card.
    supabase
      .from("student_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true),
    // Additive, read-only: powers the new "Academic Year" overview card.
    academicYearId
      ? supabase.from("academic_years").select("name").eq("id", academicYearId).single()
      : Promise.resolve({ data: null }),
  ]);

  const classTeacherBySection = new Map(
    (assignments ?? []).map((a) => [a.section_id, a.class_teacher_id] as const)
  );

  const sectionRows = (sections ?? []).map((s) => {
    const cls = s.class as unknown as { name: string } | null;
    return {
      id: s.id,
      class_name: cls?.name ?? "",
      section_name: s.name,
      class_teacher_id: classTeacherBySection.get(s.id) ?? "",
    };
  });

  const teacherOptions = (teacherProfiles ?? []).map((t) => {
    const p = t.profile as unknown as { full_name: string } | null;
    return { value: t.profile_id as string, label: p?.full_name ?? "" };
  });

  const totalClasses = (classes ?? []).length;
  const totalSections = sectionRows.length;

  const TABS: { key: Tab; label: string }[] = [
    { key: "quick-setup", label: "Quick Setup" },
    { key: "all-classes", label: "All Classes" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Classes" description="Manage classes and sections for your school." />

      {/* Tab strip — same underline-tab visual pattern used on detail pages */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const isActive = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={`/admin/classes?tab=${t.key}`}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "quick-setup" ? (
        <div className="space-y-6 pt-2">
          <ClassesQuickSetup schoolId={schoolId} academicYearId={academicYearId ?? ""} />

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Overview</h2>
              <AddClassDialog schoolId={schoolId} />
            </div>
            <KpiGrid>
              <KpiCard
                icon={School}
                label="Total Classes"
                value={totalClasses}
                sublabel="Active classes"
                href="/admin/classes?tab=all-classes"
              />
              <KpiCard
                icon={Layers}
                label="Total Sections"
                value={totalSections}
                sublabel="Active sections"
                href="/admin/classes?tab=all-classes"
              />
              <KpiCard
                icon={Users}
                label="Total Students"
                value={studentCount ?? 0}
                sublabel="Across all classes"
                href="/admin/students"
              />
              <KpiCard
                icon={CalendarDays}
                label="Academic Year"
                value={academicYear?.name ?? "—"}
                sublabel="Current session"
              />
            </KpiGrid>
          </div>
        </div>
      ) : (
        <div className="space-y-10 pt-2">
          <div>
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <span><span className="font-semibold text-foreground">{totalClasses}</span> total classes</span>
                <span className="text-border">·</span>
                <span><span className="font-semibold text-foreground">{totalSections}</span> total sections</span>
              </div>
              <AddClassDialog schoolId={schoolId} />
            </div>
            <ClassesDataTable classes={classes ?? []} schoolId={schoolId} />
          </div>

          <div>
            <SectionsDataTable
              sectionRows={sectionRows}
              schoolId={schoolId}
              academicYearId={academicYearId ?? ""}
              teachers={teacherOptions}
              classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
              headerAction={<AddSectionDialog schoolId={schoolId} classes={classes ?? []} academicYearId={academicYearId ?? ""} />}
            />
          </div>
        </div>
      )}
    </div>
  );
}