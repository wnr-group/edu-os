import { createServerSupabaseClient } from "@/lib/supabase/server";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

interface Props {
  studentId: string;
  month: number; // 0-indexed
  year: number;
}

export async function StudentAttendanceTab({ studentId, month, year }: Props) {
  const supabase = await createServerSupabaseClient();

  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: records } = await supabase
    .from("attendance_records")
    .select("date, status, session")
    .eq("student_id", studentId)
    .gte("date", from)
    .lte("date", to);

  type Rec = { date: string; status: string; session: string };
  const rows = (records ?? []) as Rec[];

  const isPresent = (s: string) => s === "present" || s === "late";
  const present = rows.filter((r) => r.status === "present").length;
  const absent = rows.filter((r) => r.status === "absent").length;
  const late = rows.filter((r) => r.status === "late").length;
  // excused is neutral — excluded from both numerator and denominator
  const countable = rows.filter((r) => r.status !== "excused");
  const total = countable.length; // total sessions, not days
  const pct = total > 0 ? Math.round((countable.filter((r) => isPresent(r.status)).length / total) * 100) : 0;

  // Per-day grouping for the calendar (a day may hold FN + AN).
  const dayMap: Record<string, Rec[]> = {};
  for (const r of rows) (dayMap[r.date] ??= []).push(r);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = lastDay;
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  function cellColor(day: number): string {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const recs = dayMap[dateStr];
    if (!recs || recs.length === 0) return "bg-muted text-muted-foreground";
    const full = recs.find((r) => r.session === "FULL_DAY");
    const status = full ? full.status : recs.every((r) => isPresent(r.status))
      ? "present"
      : recs.some((r) => r.status === "absent")
      ? "absent"
      : "late";
    if (status === "excused") return "bg-sky-500 text-white";
    if (status === "present") return "bg-emerald-500 text-white";
    if (status === "absent") return "bg-rose-500 text-white";
    if (status === "late") return "bg-amber-400 text-white";
    return "bg-muted text-muted-foreground";
  }

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Attendance", value: `${pct}%`, color: "text-emerald-600" },
          { label: "Present", value: present, color: "text-emerald-600" },
          { label: "Absent", value: absent, color: "text-rose-600" },
          { label: "Late", value: late, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4 text-center shadow-sm">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          {MONTH_NAMES[month]} {year}
        </h3>
        <div className="grid grid-cols-7 gap-1">
          {DAY_LABELS.map((d) => (
            <div key={d} className="py-1 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
          {cells.map((day, i) => (
            <div key={i} className={`aspect-square rounded-md flex items-center justify-center text-xs font-medium ${day ? cellColor(day) : ""}`}>
              {day ?? ""}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        {[
          { color: "bg-emerald-500", label: "Present" },
          { color: "bg-rose-500", label: "Absent" },
          { color: "bg-amber-400", label: "Late" },
          { color: "bg-sky-500", label: "Excused" },
          { color: "bg-muted", label: "No record" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className={`h-3 w-3 rounded-sm ${l.color}`} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
