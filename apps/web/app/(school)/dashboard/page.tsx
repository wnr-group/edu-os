import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, topRole } from "@/lib/auth/roles";
import { StatCard } from "@/components/stat-card";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const roles = await getActiveRoles(supabase, user.id);
  // A user may hold several roles; render the dashboard for the most privileged.
  const role = topRole(roles) ?? "teacher";
  const schoolId = await getSchoolId();

  if (role === "school_admin" || role === "super_admin") {
    const [
      { count: studentCount },
      { count: teacherCount },
      { data: recentStudents },
    ] = await Promise.all([
      supabase
        .from("student_profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!),
      supabase
        .from("teacher_profiles")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId!),
      supabase
        .from("student_profiles")
        .select(
          "id, profile:profiles(full_name), class:classes(name), section:sections(name), created_at"
        )
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const { data: announcements } = await supabase
      .from("announcements")
      .select("id, title, target_type, created_at")
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false })
      .limit(3);

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome back. Here&apos;s what&apos;s happening at your school.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Students" value={studentCount ?? 0} />
          <StatCard label="Total Teachers" value={teacherCount ?? 0} />
          <StatCard label="Fees Collected" value="—" />
          <StatCard label="Pending Fees" value="—" />
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Quick Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/students"
              className={cn(buttonVariants({ size: "sm" }), "inline-flex items-center")}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add Student
            </Link>
            <Link
              href="/admin/teachers"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center")}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Invite Teacher
            </Link>
            <Link
              href="/admin/announcements"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center")}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Announcement
            </Link>
          </div>
        </div>

        {/* Two-column: Recent Admissions + Announcements */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Recent Admissions
            </h2>
            {(recentStudents ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No students admitted yet.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border bg-white">
                {(recentStudents ?? []).map((s: any) => {
                  const profile = s.profile as { full_name: string } | null;
                  const cls = s.class as { name: string } | null;
                  const sec = s.section as { name: string } | null;
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border-b px-5 py-3 last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                          {(profile?.full_name ?? "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {profile?.full_name ?? "—"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {cls?.name ?? "—"}
                            {sec?.name ? ` · ${sec.name}` : ""}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
              Announcements
            </h2>
            <div className="space-y-3">
              {(announcements ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">No announcements yet.</p>
              ) : (
                (announcements ?? []).map((a) => (
                  <div key={a.id} className="rounded-lg border bg-white px-4 py-3">
                    <p className="text-xs font-semibold uppercase text-indigo-600">
                      {a.target_type}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-gray-900">{a.title}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (role === "teacher") {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your teaching overview for today.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="My Classes" value="—" />
          <StatCard label="Homework to Review" value="—" />
          <StatCard label="Attendance Status" value="—" />
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/teacher/attendance/mark"
            className={cn(buttonVariants({ size: "sm" }), "inline-flex items-center")}
          >
            Mark Attendance
          </Link>
          <Link
            href="/teacher/homework"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "inline-flex items-center")}
          >
            View Homework
          </Link>
        </div>
      </div>
    );
  }

  // Principal
  const [
    { count: pStudentCount },
    { count: pTeacherCount },
    { data: pAnnouncements },
  ] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId!),
    supabase
      .from("teacher_profiles")
      .select("id", { count: "exact", head: true })
      .eq("school_id", schoolId!),
    supabase
      .from("announcements")
      .select("id, title, target_type, created_at")
      .eq("school_id", schoolId!)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">School health overview.</p>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Today's Attendance" value="—" />
        <StatCard label="Active Teachers" value={pTeacherCount ?? 0} />
        <StatCard label="Active Students" value={pStudentCount ?? 0} />
      </div>
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Recent Announcements
        </h2>
        <div className="space-y-3">
          {(pAnnouncements ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">No announcements yet.</p>
          ) : (
            (pAnnouncements ?? []).map((a) => (
              <div key={a.id} className="rounded-lg border bg-white px-4 py-3">
                <p className="text-xs font-semibold uppercase text-indigo-600">
                  {a.target_type}
                </p>
                <p className="mt-0.5 text-sm font-medium text-gray-900">{a.title}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
