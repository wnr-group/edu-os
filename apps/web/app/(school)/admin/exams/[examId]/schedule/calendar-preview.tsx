"use client";

interface Slot {
  id: string; class_id: string; subject_id: string; exam_date: string;
  start_time: string; end_time: string; room_id: string | null; invigilator_id: string | null;
}

export function CalendarPreview({
  slots,
  classById,
  subjectById,
  roomById,
  teacherById,
}: {
  slots: Slot[];
  classById: Map<string, { id: string; name: string }>;
  subjectById: Map<string, { id: string; name: string }>;
  roomById: Map<string, { id: string; name: string }>;
  teacherById: Map<string, { id: string; name: string }>;
}) {
  const byDate = new Map<string, Slot[]>();
  for (const s of slots) {
    if (!byDate.has(s.exam_date)) byDate.set(s.exam_date, []);
    byDate.get(s.exam_date)!.push(s);
  }
  const dates = [...byDate.keys()].sort();

  if (dates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No papers to preview yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {dates.map((date) => {
        const daySlots = byDate.get(date)!.sort((a, b) => a.start_time.localeCompare(b.start_time));
        const weekday = new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" });
        return (
          <div key={date} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border bg-muted/50 px-4 py-2">
              <span className="text-sm font-semibold text-foreground">
                {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">{weekday}</span>
            </div>
            <div className="divide-y divide-border">
              {daySlots.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                      Class {classById.get(s.class_id)?.name ?? ""}
                    </span>
                    <span className="ml-2 font-medium text-foreground">{subjectById.get(s.subject_id)?.name ?? "—"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {s.start_time}–{s.end_time}
                    {s.room_id && <span className="ml-2">· {roomById.get(s.room_id)?.name}</span>}
                    {s.invigilator_id && <span className="ml-2">· {teacherById.get(s.invigilator_id)?.name}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}