export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { Users, UserCheck, UserX, ClipboardList, ClipboardEdit } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DashboardTemplate, DashboardWidget } from "@/components/dashboard-template";
import { SectionAttendanceChart } from "./section-attendance-chart";
import type { SectionAttendance } from "./section-attendance-chart";
import Link from "next/link";

function getLastNSchoolDays(n: number): Date[] {
  const days: Date[] = [];
  let d = new Date();
  d.setDate(d.getDate() - 1);
  while (days.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  return days.reverse();
}

export default async function TeacherDashboard() {
  const sectionId = await getActiveSection();

  if (!sectionId) {
    return <NoSectionPrompt />;
  }

  const [supabase, schoolId] = await Promise.all([
    createServerSupabaseClient(),
    getSchoolId(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // --- Parallel: section info + student count + today attendance + class teacher ---
  const [
    { data: sectionData },
    { count: studentCount },
    { data: todayAttRows },
    { data: classTeacherAssignment },
  ] = await Promise.all([
    supabase
      .from("sections")
      .select("name, class:classes(name)")
      .eq("id", sectionId)
      .single(),

    supabase
      .from("student_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .eq("is_active", true),

    supabase
      .from("attendance_records")
      .select("status")
      .eq("section_id", sectionId)
      .eq("date", today),

    supabase
      .from("section_assignments")
      .select("class_teacher_id")
      .eq("section_id", sectionId)
      .maybeSingle(),
  ]);

  let classTeacherName: string | null = null;
  if (classTeacherAssignment?.class_teacher_id && schoolId) {
    const { data: activeRole } = await supabase
      .from("user_roles")
      .select("is_active")
      .eq("user_id", classTeacherAssignment.class_teacher_id)
      .eq("school_id", schoolId)
      .eq("role", "teacher")
      .eq("is_active", true)
      .maybeSingle();

    if (activeRole) {
      const { data: ctProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", classTeacherAssignment.class_teacher_id)
        .maybeSingle();
      classTeacherName = ctProfile?.full_name ?? null;
    }
  }

  // Section display name
  const cls = sectionData?.class as unknown as { name: string } | null;
  const className = cls?.name ?? "";
  const sectionName = sectionData?.name ?? "";
  const sectionLabel = `${className} – Section ${sectionName}`;

  // Today's attendance numbers — excused is neutral, excluded from the total.
  const todayRows = (todayAttRows ?? []).filter((r) => r.status !== "excused");
  const totalToday = todayRows.length;
  const presentToday = todayRows.filter((r) => r.status === "present").length;
  const absentToday = totalToday - presentToday;
  const presentPct = totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : null;

  // Mark attendance URL
  const markAttendanceHref = `/teacher/attendance/mark?sectionId=${sectionId}&date=${today}`;

  // --- 7-day attendance trend ---
  const schoolDays = getLastNSchoolDays(7);
  const earliest = schoolDays[0].toISOString().slice(0, 10);

  const { data: trendRows } = await supabase
    .from("attendance_records")
    .select("date, status")
    .eq("section_id", sectionId)
    .gte("date", earliest)
    .lte("date", today);

   const trendData: SectionAttendance[] = schoolDays.map((day) => {
    const dateStr = day.toISOString().slice(0, 10);
    const dayRows = (trendRows ?? []).filter((r) => r.date === dateStr && r.status !== "excused");
    const total = dayRows.length;
    const present = dayRows.filter((r) => r.status === "present").length;
    const percent = total > 0 ? Math.round((present / total) * 100) : 0;
    // Short label: e.g. "Mon 14"
    const label = day.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
    return { section: label, percent };
  });

  // --- Upcoming homework (next 5, due_date >= today) ---
  const { data: homeworkRows } = await supabase
    .from("homework")
    .select("id, title, due_date, subject:subjects(name)")
    .eq("section_id", sectionId)
    .gte("due_date", today)
    .order("due_date", { ascending: true })
    .limit(5);

  // --- Recent discipline incidents (last 3) ---
  // Step 1: get student IDs in this section via enrollments
  const { data: sectionEnrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id, student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const sectionStudents = (sectionEnrollments ?? []).map((e) => {
    const profile = e.student_profiles as unknown as { id: string; full_name: string } | null;
    return { id: profile?.id ?? e.student_profile_id, full_name: profile?.full_name ?? "Unknown Student" };
  });

  const studentIds = (sectionStudents ?? []).map((s) => s.id);

  // Step 2: query discipline records
  let disciplineRows: { category: string; severity: string; created_at: string; student_id: string }[] = [];
  if (studentIds.length > 0 && schoolId) {
    const { data } = await supabase
      .from("discipline_records")
      .select("category, severity, created_at, student_id")
      .eq("school_id", schoolId)
      .in("student_id", studentIds)
      .order("created_at", { ascending: false })
      .limit(3);
    disciplineRows = data ?? [];
  }

  // Build student name lookup
  const studentNameMap: Record<string, string> = {};
  for (const s of sectionStudents ?? []) {
    studentNameMap[s.id] = s.full_name ?? "Unknown Student";
  }

  const stats: { label: string; value: string | number; icon: LucideIcon; iconBg: string; iconColor: string; sublabel?: string; href?: string }[] = [
    { label: "Students", value: studentCount ?? 0, icon: Users, iconBg: "bg-indigo-50", iconColor: "text-indigo-600", href: "/teacher/students" },
    {
      label: "Present Today",
      value: totalToday > 0 ? presentToday : "—",
      sublabel: presentPct !== null ? `${presentPct}% present` : "Not marked yet",
      icon: UserCheck,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      href: "/teacher/attendance",
    },
    {
      label: "Absent Today",
      value: totalToday > 0 ? absentToday : "—",
      icon: UserX,
      iconBg: "bg-rose-50",
      iconColor: "text-rose-600",
      href: "/teacher/attendance",
    },
  ];

  return (
    <DashboardTemplate
      title={sectionLabel}
      description={`${classTeacherName ? `Class Teacher: ${classTeacherName}` : "No class teacher assigned"} · ${studentCount ?? 0} students`}
      stats={stats}
      chart={
        <DashboardWidget title="7-Day Attendance Trend">
          <SectionAttendanceChart data={trendData} />
        </DashboardWidget>
      }
      overview={
        <DashboardWidget title="Upcoming Homework">
          {!homeworkRows || homeworkRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No upcoming homework.</p>
          ) : (
            <ul className="space-y-3">
              {homeworkRows.map((hw) => {
                const subject = hw.subject as unknown as { name: string } | null;
                return (
                  <li key={hw.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{hw.title}</p>
                      <p className="text-xs text-muted-foreground">{subject?.name ?? "—"}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {hw.due_date}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </DashboardWidget>
      }
      alerts={
        <DashboardWidget title="Recent Discipline Incidents">
          {disciplineRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No recent incidents.</p>
          ) : (
            <ul className="space-y-3">
              {disciplineRows.map((inc, i) => (
                <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {studentNameMap[inc.student_id] ?? "Unknown Student"}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{inc.category}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                      inc.severity === "high"
                        ? "bg-rose-50 text-rose-700"
                        : inc.severity === "medium"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {inc.severity}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardWidget>
      }
      quickActions={
        <DashboardWidget title="Quick Actions">
          <div className="grid grid-cols-1 gap-2">
            <Link href={markAttendanceHref} className={buttonVariants({ variant: "default", size: "sm" }) + " justify-center"}>
              <ClipboardEdit className="h-3.5 w-3.5" />
              {totalToday > 0 ? "Edit Attendance" : "Mark Attendance"}
            </Link>
            <Link href="/teacher/homework" className={buttonVariants({ variant: "outline", size: "sm" }) + " justify-center"}>
              <ClipboardList className="h-3.5 w-3.5" />
              View Homework
            </Link>
          </div>
        </DashboardWidget>
      }
    />
  );
}