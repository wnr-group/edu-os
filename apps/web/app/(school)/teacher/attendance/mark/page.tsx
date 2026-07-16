import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AttendanceMarkForm } from "./attendance-mark-form";

export default async function AttendanceMarkPage({
  searchParams,
}: {
  searchParams: Promise<{ sectionId?: string; date?: string; session?: string }>;
}) {
  const { sectionId: paramSectionId, date, session: paramSession } = await searchParams;
  const session = (paramSession === "FN" || paramSession === "AN" ? paramSession : "FULL_DAY") as "FULL_DAY" | "FN" | "AN";
  const activeSectionId = await getActiveSection();
  const sectionId = paramSectionId ?? activeSectionId;

  if (!sectionId || !date) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm">
        <p className="text-muted-foreground">Missing section or date.</p>
      </div>
    );
  }

  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const { data: { user } } = await supabase.auth.getUser();

  const { data: sectionRow } = await supabase
    .from("sections")
    .select("name, class:classes(name)")
    .eq("id", sectionId)
    .single();

  const { data: studentEnrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id, roll_number, student_profile:student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const { data: existingAll } = await supabase
    .from("attendance_records")
    .select("student_id, status, session")
    .eq("section_id", sectionId)
    .eq("date", date);

  const hasFullDay = (existingAll ?? []).some((r) => r.session === "FULL_DAY");
  const hasSession = (existingAll ?? []).some((r) => r.session === "FN" || r.session === "AN");

  const existingMap: Record<string, string> = {};
  for (const rec of existingAll ?? []) {
    if (rec.session === session) existingMap[rec.student_id] = rec.status ?? "present";
  }

  const studentRows = (studentEnrollments ?? []).map((e) => {
    const sp = e.student_profile as unknown as { id: string; full_name: string | null } | null;
    return {
      id: sp?.id ?? "",
      roll_number: e.roll_number ?? "",
      full_name: sp?.full_name ?? "—",
      status: existingMap[sp?.id ?? ""] ?? "present",
    };
  }).filter((s) => s.id);

  const sec = sectionRow as unknown as {
    name: string;
    class: { name: string } | null;
  } | null;

  const sectionLabel = sec
    ? `${sec.class?.name ?? ""} – Section ${sec.name}`
    : sectionId;

  const sessions: { key: "FULL_DAY" | "FN" | "AN"; label: string }[] = [
    { key: "FULL_DAY", label: "Full Day" },
    { key: "FN", label: "Forenoon" },
    { key: "AN", label: "Afternoon" },
  ];
  const lockedToSession = hasSession; // FN/AN exist → full-day disabled
  const lockedToFullDay = hasFullDay; // full-day exists → FN/AN disabled

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href={`/teacher/attendance`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Attendance
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Mark Attendance</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sectionLabel}  ·  {date}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sessions.map((s) => {
          const disabled =
            (s.key === "FULL_DAY" && lockedToSession) ||
            (s.key !== "FULL_DAY" && lockedToFullDay);
          const active = s.key === session;
          const href = `/teacher/attendance/mark?sectionId=${sectionId}&date=${date}&session=${s.key}`;
          return disabled ? (
            <span key={s.key} className="cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground/40">
              {s.label}
            </span>
          ) : (
            <a
              key={s.key}
              href={href}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-border text-muted-foreground hover:bg-muted"}`}
            >
              {s.label}
            </a>
          );
        })}
      </div>
      {(lockedToSession || lockedToFullDay) && (
        <p className="-mt-2 text-xs text-amber-600">
          {lockedToFullDay ? "Marked as full-day for this date." : "Marked by session (FN/AN) for this date."}
        </p>
      )}

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <AttendanceMarkForm
          students={studentRows}
          sectionId={sectionId}
          date={date}
          session={session}
          schoolId={schoolId}
          markedBy={user!.id}
        />
      </div>
    </div>
  );
}