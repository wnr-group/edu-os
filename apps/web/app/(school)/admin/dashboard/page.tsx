import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getAcademicYearId } from "@/lib/academic-year";
import { Users, GraduationCap, BookOpen, IndianRupee, UserPlus, Megaphone, Wallet, BarChart3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DashboardTemplate, DashboardWidget } from "@/components/dashboard-template";
import { FeeCollectionChart } from "./fee-collection-chart";
import { AttendanceChart } from "./attendance-chart";
import { StudentsByClassChart } from "./students-by-class-chart";
import type { FeeMonth } from "./fee-collection-chart";
import type { AttendanceData } from "./attendance-chart";
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

  // Fee data for this academic year
  const [{ data: feeLineItems }, { data: payments }] = await Promise.all([
    supabase
      .from("fee_line_items")
      .select("total_amount")
      .eq("school_id", schoolId!)
      .eq("academic_year_id", academicYearId ?? ""),
    supabase
      .from("payments")
      .select("total_amount, payment_date, status")
      .eq("school_id", schoolId!)
      .eq("status", "success"),
  ]);

  // Total due = sum of all fee line item amounts for the year
  const totalDue = (feeLineItems ?? []).reduce(
    (sum, item) => sum + Number(item.total_amount), 0
  );

  // Total collected = sum of successful payments
  const totalCollected = (payments ?? []).reduce(
    (sum, p) => sum + Number(p.total_amount), 0
  );

  // Compute fee chart: last 6 months collected vs due
  const now = new Date();
  const monthlyDue = totalDue > 0 ? Math.round(totalDue / 12) : 0;
  const feeChartData: FeeMonth[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = MONTHS[d.getMonth()];

    const monthPayments = (payments ?? []).filter((p) => {
      if (!p.payment_date) return false;
      return p.payment_date.slice(0, 7) === monthKey;
    });

    const collected = monthPayments.reduce((s, p) => s + Number(p.total_amount), 0);

    feeChartData.push({ month: label, collected, due: monthlyDue });
  }

  // Attendance donut (today)
  const [{ count: presentToday }, { count: absentToday }] = await Promise.all([
    supabase.from("attendance_records").select("*", { count: "exact", head: true })
      .eq("school_id", schoolId!).eq("date", today).in("status", ["present", "late"]),
    supabase.from("attendance_records").select("*", { count: "exact", head: true })
      .eq("school_id", schoolId!).eq("date", today).eq("status", "absent"),
  ]);
  const totalToday = (presentToday ?? 0) + (absentToday ?? 0);
  const presentPct = totalToday > 0 ? Math.round(((presentToday ?? 0) / totalToday) * 100) : 0;
  const attendanceData: AttendanceData = { present: presentPct, absent: 100 - presentPct };

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
          <DashboardWidget title="Monthly Fee Collection">
            <FeeCollectionChart data={feeChartData} />
          </DashboardWidget>
        }
        overview={
          <DashboardWidget title="Students by Class">
            <StudentsByClassChart data={studentsByClass} />
          </DashboardWidget>
        }
        alerts={
          <DashboardWidget title="Attendance Today">
            <div className="flex justify-center"><AttendanceChart data={attendanceData} /></div>
          </DashboardWidget>
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