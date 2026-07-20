import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AttendancePage() {
  const sectionId = await getActiveSection();

  if (!sectionId) {
    return <NoSectionPrompt />;
  }

  const supabase = await createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: sectionRow }, { data: enrollments }, { data: existing }] =
    await Promise.all([
      supabase
        .from("sections")
        .select("name, class:classes(name)")
        .eq("id", sectionId)
        .single(),
      supabase
        .from("student_enrollments")
        .select("student_profile_id, student_profiles(id, full_name)")
        .eq("section_id", sectionId)
        .eq("is_active", true),
      supabase
        .from("attendance_records")
        .select("student_id, status, session")
        .eq("section_id", sectionId)
        .eq("date", today),
    ]);

  const students = (enrollments ?? [])
    .map((e) => {
      const sp = e.student_profiles as unknown as {
        id: string;
        full_name: string;
      } | null;
      return sp ? { id: sp.id, full_name: sp.full_name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a!.full_name ?? "").localeCompare(b!.full_name ?? "")) as {
    id: string;
    full_name: string;
  }[];

  const sec = sectionRow as unknown as {
    name: string;
    class: { name: string } | null;
  } | null;

  const sectionLabel = sec
    ? `${sec.class?.name ?? ""} – Section ${sec.name}`
    : sectionId;

  const fullDayRows = (existing ?? []).filter((r) => r.session === "FULL_DAY");
  const fnRows = (existing ?? []).filter((r) => r.session === "FN");
  const anRows = (existing ?? []).filter((r) => r.session === "AN");
  const isMarked = (existing?.length ?? 0) > 0;

  // For the table, prefer full-day; else show forenoon as the representative view.
  const displayRows = fullDayRows.length > 0 ? fullDayRows : fnRows.length > 0 ? fnRows : anRows;
  const existingMap: Record<string, string> = {};
  for (const rec of displayRows) existingMap[rec.student_id] = rec.status ?? "present";

  const markedSummary = fullDayRows.length > 0
    ? "Full day marked"
    : [fnRows.length > 0 ? "Forenoon" : null, anRows.length > 0 ? "Afternoon" : null].filter(Boolean).join(" + ") + " marked";

  const markHref = `/teacher/attendance/mark?sectionId=${sectionId}&date=${today}&session=FULL_DAY`;

  const statusBadge: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-700",
    absent: "bg-rose-100 text-rose-700",
    late: "bg-amber-100 text-amber-700",
  };

  function StatusPill({ status }: { status: string }) {
    const badge = statusBadge[status] ?? "bg-gray-100 text-gray-600";
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badge}`}>
        {status}
      </span>
    );
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={`${sectionLabel}  ·  ${today}${isMarked ? `  ·  ${markedSummary}` : ""}`}
        action={
          <Link href={markHref} className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
            {isMarked ? "Edit Attendance" : "Mark Attendance"}
          </Link>
        }
      />

      {!isMarked ? (
        <EmptyState
          icon={CalendarCheck}
          title="Attendance not marked yet for today"
          description="Record today's attendance to see the roster and status here."
          action={
            <Link href={markHref} className={cn(buttonVariants({ variant: "default", size: "lg" }))}>
              Mark Attendance
            </Link>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
                  <TableHead className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s, i) => (
                  <TableRow
                    key={s.id}
                    className={`transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <TableCell className="px-4 py-3 text-sm text-foreground">{s.full_name ?? "—"}</TableCell>
                    <TableCell className="px-4 py-3">
                      <StatusPill status={existingMap[s.id] ?? "present"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {students.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm"
              >
                <span className="text-sm font-medium text-foreground">{s.full_name ?? "—"}</span>
                <StatusPill status={existingMap[s.id] ?? "present"} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}