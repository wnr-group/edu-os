import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { Users, GraduationCap, BookOpen, IndianRupee, UserPlus, Megaphone, Wallet, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DashboardTemplate, DashboardWidget } from "@/components/dashboard-template";
import { FeeCollectionChart } from "./fee-collection-chart";
import { AttendanceTodayWidget } from "./attendance-today-widget";
import { StudentsByClassChart } from "./students-by-class-chart";
import type { TermFee } from "./fee-collection-chart";
import type { AttendanceSummary } from "./attendance-chart";
import type { ClassCount } from "./students-by-class-chart";
import { PostOnboardingBanner } from "./post-onboarding-banner";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const BADGE_COLORS: Record<string, string> = {
  Event: "bg-indigo-100 text-indigo-700",
  Exam: "bg-amber-100 text-amber-700",
  Holiday: "bg-emerald-100 text-emerald-700",
  General: "bg-gray-100 text-gray-700",
};

function announcementType(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("exam") || t.includes("test") || t.includes("result")) return "Exam";
  if (t.includes("holiday") || t.includes("vacation") || t.includes("closed")) return "Holiday";
  if (t.includes("sports") || t.includes("exhibition") || t.includes("day") || t.includes("meeting")) return "Event";
  return "General";
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient();
  const schoolId = await getSchoolId();
  const today = new Date().toISOString().slice(0, 10);

  const academicYearId = await getAcademicYearId(schoolId!);

  // Stat card queries (parallel)
  const [
    { count: teacherCount },
    { count: studentCount },
    { count: sectionCount },
  ] = await Promise.all([
    supabase.from("teacher_profiles").select("*", { count: "exact", head: true }).eq("school_id", schoolId!),
    supabase.from("student_enrollments").select("*", { count: "exact", head: true })
      .eq("school_id", schoolId!)
      .eq("academic_year_id", academicYearId ?? "")
      .eq("is_active", true),
    supabase.from("sections").select("*", { count: "exact", head: true })
      .eq("school_id", schoolId!)
      .eq("academic_year_id", academicYearId ?? ""),
  ]);

 // Fee data for this academic year — due_date added so amounts can be
  // bucketed into terms below (no dedicated "term" column exists in the
  // schema; terms are derived from the academic year's own date range).
  const [{ data: feeLineItems }, { data: payments }, { data: yearRow }] = await Promise.all([
    supabase
      .from("fee_line_items")
      .select("total_amount, due_date")
      .eq("school_id", schoolId!)
      .eq("academic_year_id", academicYearId ?? ""),
    supabase
      .from("payments")
      .select("total_amount, payment_date, status")
      .eq("school_id", schoolId!)
      .eq("status", "success"),
    supabase
      .from("academic_years")
      .select("start_date, end_date")
      .eq("id", academicYearId ?? "")
      .maybeSingle(),
  ]);

  // Total due = sum of all fee line item amounts for the year
  const totalDue = (feeLineItems ?? []).reduce(
    (sum, item) => sum + Number(item.total_amount), 0
  );

  // Total collected = sum of successful payments
  const totalCollected = (payments ?? []).reduce(
    (sum, p) => sum + Number(p.total_amount), 0
  );

  // Fee chart: 3 equal terms spanning the academic year's own start/end
  // dates (not hardcoded calendar months, so this adapts to any school's
  // configured year). Line items with no due_date can't be attributed to a
  // term and are excluded from the term buckets (they still count in the
  // totalDue KPI above).
  const feeChartData: TermFee[] = [];
  if (yearRow?.start_date && yearRow?.end_date) {
    const start = new Date(yearRow.start_date);
    const end = new Date(yearRow.end_date);
    const third = (end.getTime() - start.getTime()) / 3;
    const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    for (let i = 0; i < 3; i++) {
      const termStart = new Date(start.getTime() + i * third);
      // Last term's boundary is inclusive of end_date (+1 day) so an item
      // due exactly on the last day of the year still falls inside a term.
      const termEnd = i === 2 ? new Date(end.getTime() + 24 * 60 * 60 * 1000) : new Date(start.getTime() + (i + 1) * third);

      const due = (feeLineItems ?? [])
        .filter((li) => li.due_date && new Date(li.due_date) >= termStart && new Date(li.due_date) < termEnd)
        .reduce((sum, li) => sum + Number(li.total_amount), 0);

      const collected = (payments ?? [])
        .filter((p) => p.payment_date && new Date(p.payment_date) >= termStart && new Date(p.payment_date) < termEnd)
        .reduce((sum, p) => sum + Number(p.total_amount), 0);

      feeChartData.push({
        term: `Term ${i + 1}`,
        range: `${fmt(termStart)} – ${fmt(i === 2 ? end : new Date(termEnd.getTime() - 24 * 60 * 60 * 1000))}`,
        collected,
        due,
      });
    }
  }

  // Attendance Today — class-wise marking status, not a present/absent %.
  // "Relevant classes" = sections with a timetable entry for today's
  // weekday (1=Monday..6=Saturday, matching timetable-grid.tsx's DAYS
  // convention — Sunday's getDay()=0 naturally matches zero rows, no
  // special-casing needed). "Marked" mirrors the exact definition already
  // used in teacher/attendance/page.tsx: any attendance_records row exists
  // for that section+date.
  const dayOfWeek = new Date().getDay();

  const { data: todaysTimetable } = await supabase
    .from("timetable")
    .select("section_id")
    .eq("school_id", schoolId!)
    .eq("academic_year_id", academicYearId ?? "")
    .eq("day_of_week", dayOfWeek);

  const todaysSectionIds = Array.from(new Set((todaysTimetable ?? []).map((t) => t.section_id as string)));

  let attendanceClasses: {
    id: string; className: string; sectionName: string; order: number;
    status: "marked" | "pending"; markedStudents: number; totalStudents: number;
  }[] = [];

  if (todaysSectionIds.length > 0) {
    const [{ data: sectionRows }, { data: markedRows }, { data: enrollmentRows }] = await Promise.all([
      supabase.from("sections").select("id, name, class:classes(name, order)").in("id", todaysSectionIds),
      supabase.from("attendance_records").select("section_id, student_id")
        .eq("school_id", schoolId!).eq("date", today).in("section_id", todaysSectionIds),
      supabase.from("student_enrollments").select("section_id, student_profile_id")
        .eq("school_id", schoolId!).eq("academic_year_id", academicYearId ?? "").eq("is_active", true)
        .in("section_id", todaysSectionIds),
    ]);

    const markedBySection = new Map<string, Set<string>>();
    for (const r of markedRows ?? []) {
      const key = r.section_id as string;
      if (!markedBySection.has(key)) markedBySection.set(key, new Set());
      markedBySection.get(key)!.add(r.student_id as string);
    }
    const totalBySection = new Map<string, number>();
    for (const e of enrollmentRows ?? []) {
      const key = e.section_id as string;
      totalBySection.set(key, (totalBySection.get(key) ?? 0) + 1);
    }

    attendanceClasses = (sectionRows ?? [])
      .map((s) => {
        const cls = s.class as unknown as { name: string; order: number } | null;
        const id = s.id as string;
        const markedStudents = markedBySection.get(id)?.size ?? 0;
        const totalStudents = totalBySection.get(id) ?? 0;
        return {
          id,
          className: cls?.name ?? "",
          order: cls?.order ?? 0,
          sectionName: s.name as string,
          status: (markedStudents > 0 ? "marked" : "pending") as "marked" | "pending",
          markedStudents,
          totalStudents,
        };
      })
      .sort((a, b) => a.order - b.order || a.sectionName.localeCompare(b.sectionName));
  }

  const markedCount = attendanceClasses.filter((c) => c.status === "marked").length;
  const attendanceSummary: AttendanceSummary = { markedCount, totalCount: attendanceClasses.length };
  // Students by class
  const { data: classStudents } = await supabase
    .from("student_enrollments")
    .select("class_id, class:classes(name, order)")
    .eq("school_id", schoolId!)
    .eq("academic_year_id", academicYearId ?? "")
    .eq("is_active", true);

  const classMap = new Map<string, { name: string; order: number; count: number }>();
  for (const s of classStudents ?? []) {
    const cls = s.class as unknown as { name: string; order: number } | null;
    if (!cls) continue;
    const key = s.class_id as string;
    if (!classMap.has(key)) classMap.set(key, { name: cls.name, order: cls.order, count: 0 });
    classMap.get(key)!.count++;
  }
  const studentsByClass: ClassCount[] = Array.from(classMap.values())
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ class: c.name.replace("Class ", "Cls "), students: c.count }));

  // Announcements (top 5)
  const { data: announcements } = await supabase
    .from("announcements")
    .select("title, created_at")
    .eq("school_id", schoolId!)
    .order("created_at", { ascending: false })
    .limit(5);

  const formattedAnnouncements = (announcements ?? []).map((a) => ({
    title: a.title,
    date: new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    type: announcementType(a.title),
  }));

  const stats: { label: string; value: string | number; icon: LucideIcon; iconBg: string; iconColor: string; href?: string }[] = [
    { label: "Students",      value: studentCount ?? 0,                             icon: GraduationCap, iconBg: "bg-emerald-50", iconColor: "text-emerald-600", href: "/admin/students" },
    { label: "Teachers",      value: teacherCount ?? 0,                             icon: Users,         iconBg: "bg-indigo-50",  iconColor: "text-indigo-600",  href: "/admin/teachers" },
    { label: "Classes",       value: sectionCount ?? 0,                             icon: BookOpen,      iconBg: "bg-violet-50",  iconColor: "text-violet-600",  href: "/admin/classes" },
    { label: "Fee Collected", value: `₹${(totalCollected / 100000).toFixed(1)}L`,   icon: IndianRupee,   iconBg: "bg-amber-50",   iconColor: "text-amber-600",   href: "/admin/fees" },
  ];

  return (
    <div className="space-y-6">
      <PostOnboardingBanner />
      <DashboardTemplate
        title="School Overview"
        stats={stats}
        chart={
          <DashboardWidget title="Fee Collection (Term Wise)">
            <FeeCollectionChart data={feeChartData} />
          </DashboardWidget>
        }
        overview={
          <DashboardWidget title="Students by Class">
            <StudentsByClassChart data={studentsByClass} />
          </DashboardWidget>
        }
        alerts={
          <AttendanceTodayWidget summary={attendanceSummary} classes={attendanceClasses} />
        }
        activity={
          <DashboardWidget title="Recent Announcements">
            {formattedAnnouncements.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No announcements yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {formattedAnnouncements.map((a) => (
                  <li key={a.title} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.date}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[a.type] ?? BADGE_COLORS.General}`}>
                      {a.type}
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
              <Link href="/admin/students" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
                <UserPlus className="h-3.5 w-3.5" />
                Add Student
              </Link>
              <Link href="/admin/announcements" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
                <Megaphone className="h-3.5 w-3.5" />
                New Announcement
              </Link>
              <Link href="/admin/fees" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
                <Wallet className="h-3.5 w-3.5" />
                Collect Fees
              </Link>
              <Link href="/admin/reports" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
                <BarChart3 className="h-3.5 w-3.5" />
                View Reports
              </Link>
            </div>
          </DashboardWidget>
        }
      />
    </div>
  );
}