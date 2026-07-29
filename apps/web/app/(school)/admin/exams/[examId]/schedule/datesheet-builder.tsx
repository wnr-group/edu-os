"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { List, CalendarDays, Send, Download } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AddPaperForm, type SlotFormValues } from "./add-paper-drawer";
import { CalendarPreview } from "./calendar-preview";

interface ClassOption { id: string; name: string; order: number }
interface SubjectOption { id: string; name: string; class_id: string }
interface TeacherOption { id: string; name: string }
interface RoomOption { id: string; name: string; capacity: number | null }
interface Slot {
  id: string;
  class_id: string;
  subject_id: string;
  exam_date: string;
  start_time: string;
  end_time: string;
  room_id: string | null;
  invigilator_id: string | null;
  is_dirty: boolean;
  updated_at: string;
}

interface Props {
  schoolId: string;
  exam: {
    id: string;
    name: string;
    academicYearName: string;
    startDate: string | null;
    endDate: string | null;
    datesheetPublishedAt: string | null;
  };
  classes: ClassOption[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  rooms: RoomOption[];
  slots: Slot[];
}

export function DatesheetBuilder({ schoolId, exam, classes, subjects, teachers, rooms, slots }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [editing, setEditing] = useState<Slot | "new" | null>(null);
  const [publishing, setPublishing] = useState(false);

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);

  const dirtyCount = slots.filter((s) => s.is_dirty).length;
  const isPublished = exam.datesheetPublishedAt !== null;

  const slotsByClass = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      if (!map.has(s.class_id)) map.set(s.class_id, []);
      map.get(s.class_id)!.push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.exam_date.localeCompare(b.exam_date));
    return map;
  }, [slots]);

  const visibleClassIds =
    classFilter === "all" ? [...slotsByClass.keys()] : slotsByClass.has(classFilter) ? [classFilter] : [];

  async function handleDelete(slot: Slot) {
    if (!confirm(`Remove ${subjectById.get(slot.subject_id)?.name ?? "this paper"} from the datesheet?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("exam_schedule_slots").delete().eq("id", slot.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Paper removed.");
    router.refresh();
  }

  async function handleSaved() {
    setEditing(null);
    router.refresh();
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/publish-exam-datesheet`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({ exam_id: exam.id }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to publish");
      toast.success(isPublished ? "Changes published — affected classes notified." : "Datesheet published — parents notified.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  }

  function handleExportPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rowsHtml = slots
      .slice()
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
      .map((s) => {
        const cls = classById.get(s.class_id)?.name ?? "";
        const subj = subjectById.get(s.subject_id)?.name ?? "";
        const room = s.room_id ? roomById.get(s.room_id)?.name ?? "" : "Not set";
        const invigilator = s.invigilator_id ? teacherById.get(s.invigilator_id)?.name ?? "" : "Not assigned";
        return `<tr>
          <td style="border:1px solid #e5e7eb;padding:8px;">${cls}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${subj}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${s.exam_date}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${s.start_time}–${s.end_time}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${room}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${invigilator}</td>
        </tr>`;
      })
      .join("");
    printWindow.document.write(`
      <html><head><title>Datesheet — ${exam.name}</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;}
      table{width:100%;border-collapse:collapse;} th{border:1px solid #e5e7eb;padding:8px;background:#f8fafc;text-align:left;}
      @page{size:landscape;margin:12mm;}</style></head>
      <body><h1>${exam.name}</h1><p>${exam.academicYearName}</p>
      <table><thead><tr><th>Class</th><th>Subject</th><th>Date</th><th>Time</th><th>Room</th><th>Invigilator</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Exams › Schedule</p>
        <h1 className="text-2xl font-bold text-foreground">Exam datesheet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build the paper-by-paper schedule, catch clashes as you go, then publish to students & parents.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
            <CalendarDays className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{exam.name}</span>
              {isPublished ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">PUBLISHED</span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-500">DRAFT</span>
              )}
              {dirtyCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {dirtyCount} unpublished {dirtyCount === 1 ? "change" : "changes"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {exam.startDate ?? "—"}–{exam.endDate ?? "—"} · {classes.length} classes · {slots.length} papers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Download className="h-3.5 w-3.5" />
            Export PDF
          </Button>
          {(!isPublished || dirtyCount > 0) && (
            <Button onClick={handlePublish} disabled={publishing || slots.length === 0}>
              <Send className="h-3.5 w-3.5" />
              {publishing ? "Publishing…" : isPublished ? "Publish changes" : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => setView("list")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", view === "list" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
          >
            <List className="h-3.5 w-3.5" /> Slot list
          </button>
          <button
            onClick={() => setView("calendar")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold", view === "calendar" ? "bg-card text-primary shadow-sm" : "text-muted-foreground")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendar preview
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setClassFilter(c.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                classFilter === c.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {c.name}
            </button>
          ))}
          <button
            onClick={() => setClassFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              classFilter === "all" ? "border-indigo-600 bg-indigo-600 text-white" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            All classes
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {view === "calendar" ? (
            <CalendarPreview
              slots={slots}
              classById={classById}
              subjectById={subjectById}
              roomById={roomById}
              teacherById={teacherById}
            />
          ) : visibleClassIds.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              No papers scheduled yet for this filter. Use "Add paper" to get started.
            </div>
          ) : (
            visibleClassIds.map((classId) => {
              const cls = classById.get(classId);
              const classSlots = slotsByClass.get(classId) ?? [];
              return (
                <div key={classId} className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
                        CLASS {cls?.name ?? ""}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{exam.name} datesheet</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{classSlots.length} papers</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2">Subject</th>
                        <th className="px-4 py-2">Date</th>
                        <th className="px-4 py-2">Time</th>
                        <th className="px-4 py-2">Room</th>
                        <th className="px-4 py-2">Invigilator</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {classSlots.map((s) => (
                        <tr key={s.id}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{subjectById.get(s.subject_id)?.name ?? "—"}</span>
                              {s.is_dirty && (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">EDITED</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{s.exam_date}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.start_time}–{s.end_time}</td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {s.room_id ? roomById.get(s.room_id)?.name : <span className="italic">Not set</span>}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {s.invigilator_id ? teacherById.get(s.invigilator_id)?.name : <span className="italic">Not assigned</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => setEditing(s)} className="text-xs font-semibold text-indigo-600 hover:underline">Edit</button>
                            <span className="mx-1.5 text-muted-foreground">·</span>
                            <button onClick={() => handleDelete(s)} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="sticky top-4 rounded-xl border border-border bg-card p-4">
            {editing ? (
              <AddPaperForm
                schoolId={schoolId}
                examId={exam.id}
                classes={classes}
                subjects={subjects}
                teachers={teachers}
                rooms={rooms}
                defaultClassId={classFilter !== "all" ? classFilter : classes[0]?.id ?? ""}
                editingSlot={editing === "new" ? null : editing}
                onSaved={handleSaved}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">Add a paper, or click "Edit" on a row to change it.</p>
                <Button onClick={() => setEditing("new")}>+ Add paper</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type { SlotFormValues };