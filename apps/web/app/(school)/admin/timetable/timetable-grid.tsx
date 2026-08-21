"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ClassOption {
  id: string;
  name: string;
  order: number;
}

interface SectionOption {
  id: string;
  name: string;
  class_id: string;
}

interface SubjectOption {
  id: string;
  name: string;
  class_id: string;
}

interface TeacherOption {
  id: string;
  name: string;
}

interface Slot {
  id: string;
  section_id: string;
  day_of_week: number;
  period: number;
  subject_id: string;
  teacher_id: string;
  is_elective: boolean;
}

interface TimetableGridProps {
  schoolId: string;
  academicYearId: string;
  classes: ClassOption[];
  sections: SectionOption[];
  subjects: SubjectOption[];
  teachers: TeacherOption[];
  slots: Slot[];
  initialClassId?: string;
  initialSectionId?: string;
}

interface PopupState {
  day: number;
  period: number;
  subjectId: string;
  teacherId: string;
  isElective: boolean;
  existingId: string | null;
}

const DAYS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const PERIODS = Array.from({ length: 8 }, (_, i) => i + 1);

const SUBJECT_PALETTE = [
  { bg: "#ede9fe", fg: "#6d28d9" },
  { bg: "#dcfce7", fg: "#15803d" },
  { bg: "#dbeafe", fg: "#1d4ed8" },
  { bg: "#ffedd5", fg: "#c2410c" },
  { bg: "#ffe4e6", fg: "#be123c" },
  { bg: "#cffafe", fg: "#0e7490" },
  { bg: "#fef9c3", fg: "#a16207" },
  { bg: "#fce7f3", fg: "#be185d" },
];

function colorForSubject(subjectId: string) {
  let hash = 0;
  for (let i = 0; i < subjectId.length; i++) hash = (hash * 31 + subjectId.charCodeAt(i)) | 0;
  return SUBJECT_PALETTE[Math.abs(hash) % SUBJECT_PALETTE.length];
}

function slotKey(sectionId: string, day: number, period: number) {
  return `${sectionId}|${day}|${period}`;
}

function teacherKey(teacherId: string, day: number, period: number) {
  return `${teacherId}|${day}|${period}`;
}

export function TimetableGrid({
  schoolId,
  academicYearId,
  classes,
  sections,
  subjects,
  teachers,
  slots,
  initialClassId,
  initialSectionId,
}: TimetableGridProps) {
  const router = useRouter();
  const [view, setView] = useState<"class" | "teacher">("class");
  // "View Timetable" from Classes deep-links here with a class+section; fall
  // back to the original default-to-first-class behavior otherwise (or if
  // the section doesn't actually belong to that class).
  const resolvedInitialSection =
    initialClassId && initialSectionId
      ? sections.find((s) => s.id === initialSectionId && s.class_id === initialClassId)
      : undefined;
  const [selClassId, setSelClassId] = useState(
    resolvedInitialSection ? initialClassId! : classes[0]?.id ?? ""
  );
  const [selSectionId, setSelSectionId] = useState(
    resolvedInitialSection ? resolvedInitialSection.id : sections.find((s) => s.class_id === classes[0]?.id)?.id ?? ""
  );
  const [selTeacherId, setSelTeacherId] = useState(teachers[0]?.id ?? "");
  const [popup, setPopup] = useState<PopupState | null>(null);
  const [saving, setSaving] = useState(false);

  const sectionsForClass = sections.filter((s) => s.class_id === selClassId);
  const subjectsForClass = subjects.filter((s) => s.class_id === selClassId);

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const teacherById = useMemo(() => new Map(teachers.map((t) => [t.id, t])), [teachers]);
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const slotByKey = useMemo(() => {
    const map = new Map<string, Slot>();
    slots.forEach((s) => map.set(slotKey(s.section_id, s.day_of_week, s.period), s));
    return map;
  }, [slots]);

  const teacherBusyCount = useMemo(() => {
    const map = new Map<string, number>();
    slots.forEach((s) => {
      const k = teacherKey(s.teacher_id, s.day_of_week, s.period);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return map;
  }, [slots]);

  const slotsForTeacherAt = (teacherId: string, day: number, period: number) =>
    slots.filter((s) => s.teacher_id === teacherId && s.day_of_week === day && s.period === period);

  function sectionLabel(sectionId: string) {
    const section = sectionById.get(sectionId);
    if (!section) return "";
    const cls = classById.get(section.class_id);
    return `${cls?.name ?? ""}-${section.name}`;
  }

  function handleClassChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const classId = e.target.value;
    setSelClassId(classId);
    setSelSectionId(sections.find((s) => s.class_id === classId)?.id ?? "");
  }

  function openAssign(day: number, period: number) {
    if (!selSectionId) return;
    const existing = slotByKey.get(slotKey(selSectionId, day, period));
    setPopup({
      day,
      period,
      subjectId: existing?.subject_id ?? "",
      teacherId: existing?.teacher_id ?? "",
      isElective: existing?.is_elective ?? false,
      existingId: existing?.id ?? null,
    });
  }

  function popupWarning(): string | null {
    if (!popup?.teacherId) return null;
    const usedBy = slotsForTeacherAt(popup.teacherId, popup.day, popup.period).filter(
      (s) => s.id !== popup.existingId
    );
    if (usedBy.length === 0) return null;
    const labels = usedBy.map((s) => sectionLabel(s.section_id));
    return `Already teaching ${labels.join(", ")} at this time.`;
  }

  async function savePopup() {
    if (!popup || !popup.subjectId || !popup.teacherId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = popup.existingId
      ? await supabase
          .from("timetable")
          .update({ subject_id: popup.subjectId, teacher_id: popup.teacherId, is_elective: popup.isElective })
          .eq("id", popup.existingId)
      : await supabase.from("timetable").insert({
          school_id: schoolId,
          academic_year_id: academicYearId,
          section_id: selSectionId,
          day_of_week: popup.day,
          period: popup.period,
          subject_id: popup.subjectId,
          teacher_id: popup.teacherId,
          is_elective: popup.isElective,
        });
    setSaving(false);

    if (error) {
      toast.error(error.code === "23505" ? "This slot was just taken. Refresh and try again." : error.message);
      return;
    }

    toast.success("Timetable slot saved.");
    setPopup(null);
    router.refresh();
  }

  async function clearSlot() {
    if (!popup?.existingId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("timetable").delete().eq("id", popup.existingId);
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Timetable slot cleared.");
    setPopup(null);
    router.refresh();
  }

  // ---- class view stats + rows ----
  let filled = 0;
  let conflicts = 0;
  DAYS.forEach((d) => {
    PERIODS.forEach((p) => {
      const slot = slotByKey.get(slotKey(selSectionId, d.value, p));
      if (slot) {
        filled++;
        if ((teacherBusyCount.get(teacherKey(slot.teacher_id, d.value, p)) ?? 0) > 1) conflicts++;
      }
    });
  });
  const totalCells = DAYS.length * PERIODS.length;
  const empty = totalCells - filled;

  // ---- teacher view stats ----
  let taught = 0;
  let free = 0;
  let teacherConflicts = 0;
  DAYS.forEach((d) => {
    PERIODS.forEach((p) => {
      const at = slotsForTeacherAt(selTeacherId, d.value, p);
      if (at.length > 0) {
        taught++;
        if (at.length > 1) teacherConflicts++;
      } else {
        free++;
      }
    });
  });

  const stats =
    view === "class"
      ? [
          { value: `${filled}/${totalCells}`, label: "Slots filled", dot: "#22c55e" },
          { value: empty, label: "Empty periods", dot: "#f59e0b" },
          { value: conflicts, label: "Teacher clashes", dot: "#ef4444" },
        ]
      : [
          { value: taught, label: "Periods / week", dot: "#6366f1" },
          { value: free, label: "Free periods", dot: "#22c55e" },
          { value: teacherConflicts, label: "Clashes", dot: "#ef4444" },
        ];

  const gridTitle =
    view === "class"
      ? `${classById.get(selClassId)?.name ?? ""} · Section ${sectionById.get(selSectionId)?.name ?? ""}`
      : `${teacherById.get(selTeacherId)?.name ?? ""}`;

  const warning = popupWarning();

  function handlePrint() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const headerHtml = PERIODS.map(
      (p) => `<th style="border:1px solid #e5e7eb; padding:8px; background:#f8fafc; font-size:11px;">P${p}</th>`
    ).join("");

    const rowsHtml = DAYS.map((day) => {
      const cellsHtml = PERIODS.map((period) => {
        if (view === "class") {
          const slot = slotByKey.get(slotKey(selSectionId, day.value, period));
          if (!slot) {
            return `<td style="border:1px solid #e5e7eb; padding:8px; text-align:center; color:#94a3b8; font-size:11px;">—</td>`;
          }
          const subj = subjectById.get(slot.subject_id);
          const teacher = teacherById.get(slot.teacher_id);
          const color = colorForSubject(slot.subject_id);
          const isConflict = (teacherBusyCount.get(teacherKey(slot.teacher_id, day.value, period)) ?? 0) > 1;
          return `<td style="border:1px solid ${isConflict ? "#ef4444" : "#e5e7eb"}; padding:8px; background:${color.bg}; color:${color.fg};">
            <div style="font-weight:700; font-size:12px;">${subj?.name ?? ""}</div>
            <div style="font-size:11px; opacity:.85;">${teacher?.name ?? ""}</div>
            ${slot.is_elective ? `<div style="margin-top:3px; font-size:10px; font-weight:700; color:#4338ca;">ELECTIVE</div>` : ""}
          </td>`;
        }
        const at = slotsForTeacherAt(selTeacherId, day.value, period);
        if (at.length === 0) {
          return `<td style="border:1px solid #dcfce7; padding:8px; text-align:center; background:#f0fdf4; color:#16a34a; font-size:11px; font-weight:600;">Free</td>`;
        }
        const conflict = at.length > 1;
        const firstSubj = subjectById.get(at[0].subject_id);
        const color = firstSubj ? colorForSubject(firstSubj.id) : { bg: "#eef2ff", fg: "#4338ca" };
        return `<td style="border:1px solid ${conflict ? "#ef4444" : "#e5e7eb"}; padding:8px; background:${color.bg}; color:${color.fg};">
          <div style="font-weight:700; font-size:12px;">${at.map((s) => sectionLabel(s.section_id)).join(" + ")}</div>
          <div style="font-size:11px; opacity:.85;">${firstSubj?.name ?? ""}</div>
          ${at[0].is_elective ? `<div style="margin-top:3px; font-size:10px; font-weight:700; color:#4338ca;">ELECTIVE</div>` : ""}
        </td>`;
      }).join("");
      return `<tr><td style="border:1px solid #e5e7eb; padding:8px; font-weight:600; white-space:nowrap; font-size:12px;">${day.label}</td>${cellsHtml}</tr>`;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Timetable — ${gridTitle}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #0f172a; }
            h1 { font-size: 18px; margin: 0 0 2px; }
            p { font-size: 12px; color: #64748b; margin: 0 0 16px; }
            table { width: 100%; border-collapse: collapse; }
            @page { size: landscape; margin: 12mm; }
          </style>
        </head>
        <body>
          <h1>Timetable — ${gridTitle}</h1>
          <p>${view === "class" ? "Class timetable" : "Teacher timetable"}</p>
          <table>
            <thead>
              <tr>
                <th style="border:1px solid #e5e7eb; padding:8px; background:#f8fafc; font-size:11px;">Day / Period</th>
                ${headerHtml}
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A week-at-a-glance schedule. Click any slot to assign or change a period.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" />
          Print / PDF
        </Button>
      </div>

      {/* Control bar */}
      <div className="flex flex-wrap items-end gap-5">
        <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => setView("class")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              view === "class" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            )}
          >
            Class timetable
          </button>
          <button
            onClick={() => setView("teacher")}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              view === "teacher" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            )}
          >
            Teacher timetable
          </button>
        </div>

        {view === "class" ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Class</label>
              <NativeSelect
                options={classes.map((c) => ({ value: c.id, label: c.name }))}
                value={selClassId}
                onChange={handleClassChange}
                className="min-w-[130px]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Section</label>
              <NativeSelect
                options={sectionsForClass.map((s) => ({ value: s.id, label: s.name }))}
                value={selSectionId}
                onChange={(e) => setSelSectionId(e.target.value)}
                className="min-w-[110px]"
                disabled={sectionsForClass.length === 0}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Teacher</label>
            <NativeSelect
              options={teachers.map((t) => ({ value: t.id, label: t.name }))}
              value={selTeacherId}
              onChange={(e) => setSelTeacherId(e.target.value)}
              className="min-w-[230px]"
            />
          </div>
        )}
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3">
        {stats.map((st) => (
          <div
            key={st.label}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.dot }} />
            <span className="text-lg font-bold text-foreground">{st.value}</span>
            <span className="text-sm font-medium text-muted-foreground">{st.label}</span>
          </div>
        ))}
      </div>

      {/* Grid card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {view === "class" ? "Class timetable" : "Teacher timetable"}
            </div>
            <div className="mt-0.5 text-lg font-bold text-foreground">{gridTitle}</div>
          </div>
          {view === "class" && subjectsForClass.length > 0 && (
            <div className="flex flex-wrap items-center gap-3.5">
              {subjectsForClass.map((subj) => {
                const c = colorForSubject(subj.id);
                return (
                  <span key={subj.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-3 w-3 rounded" style={{ background: c.bg, border: `1px solid ${c.fg}` }} />
                    {subj.name}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-x-auto p-3.5">
          <div className="flex min-w-[940px] flex-col gap-2">
            <div className="grid gap-2" style={{ gridTemplateColumns: "118px repeat(8, 1fr)" }}>
              <div className="flex items-center pl-1.5 text-xs font-bold text-muted-foreground">DAY / PERIOD</div>
              {PERIODS.map((p) => (
                <div key={p} className="rounded-lg bg-muted/50 py-2 text-center">
                  <div className="text-sm font-bold text-foreground">P{p}</div>
                </div>
              ))}
            </div>

            {DAYS.map((day) => (
              <div key={day.value} className="grid gap-2" style={{ gridTemplateColumns: "118px repeat(8, 1fr)" }}>
                <div className="flex items-center pl-1.5 text-sm font-semibold text-foreground">{day.label}</div>
                {PERIODS.map((period) => {
                  if (view === "class") {
                    const slot = slotByKey.get(slotKey(selSectionId, day.value, period));
                    if (slot) {
                      const subj = subjectById.get(slot.subject_id);
                      const teacher = teacherById.get(slot.teacher_id);
                      const isConflict =
                        (teacherBusyCount.get(teacherKey(slot.teacher_id, day.value, period)) ?? 0) > 1;
                      const color = colorForSubject(slot.subject_id);
                      return (
                        <button
                          key={period}
                          onClick={() => openAssign(day.value, period)}
                          className="flex min-h-[66px] flex-col justify-center rounded-lg px-2.5 py-2 text-left transition-transform hover:-translate-y-0.5"
                          style={{
                            background: color.bg,
                            color: color.fg,
                            border: isConflict ? "1px solid #ef4444" : "1px solid rgba(15,23,42,.05)",
                            boxShadow: isConflict ? "inset 0 0 0 1px #ef4444" : "none",
                          }}
                        >
                          <div className="text-[13.5px] font-bold leading-tight">{subj?.name ?? ""}</div>
                          <div className="mt-0.5 text-[11.5px] leading-tight opacity-85">{teacher?.name ?? ""}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {slot.is_elective && (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700">
                                Elective
                              </span>
                            )}
                            {isConflict && (
                              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-red-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                Double-booked
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={period}
                        onClick={() => openAssign(day.value, period)}
                        className="flex min-h-[66px] items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-border text-xs font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                      >
                        <Plus className="h-3 w-3" />
                        Assign
                      </button>
                    );
                  }

                  const at = slotsForTeacherAt(selTeacherId, day.value, period);
                  if (at.length > 0) {
                    const conflict = at.length > 1;
                    const firstSubj = subjectById.get(at[0].subject_id);
                    const color = firstSubj
                      ? colorForSubject(firstSubj.id)
                      : { bg: "#eef2ff", fg: "#4338ca" };
                    return (
                      <div
                        key={period}
                        className="flex min-h-[66px] flex-col justify-center rounded-lg px-2.5 py-2"
                        style={{
                          background: color.bg,
                          color: color.fg,
                          border: conflict ? "1px solid #ef4444" : "1px solid rgba(15,23,42,.05)",
                          boxShadow: conflict ? "inset 0 0 0 1px #ef4444" : "none",
                        }}
                      >
                        <div className="text-[13.5px] font-bold leading-tight">
                          {at.map((s) => sectionLabel(s.section_id)).join("  +  ")}
                        </div>
                        <div className="mt-0.5 text-[11.5px] leading-tight opacity-85">{firstSubj?.name ?? ""}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {at[0].is_elective && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700">
                              Elective
                            </span>
                          )}
                          {conflict && (
                            <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-200 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-red-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                              Same time, 2 classes
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={period}
                      className="flex min-h-[66px] items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-xs font-semibold text-emerald-600"
                    >
                      Free
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assign popup */}
      <Dialog open={!!popup} onOpenChange={(open) => { if (!open) setPopup(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{popup?.existingId ? "Edit period" : "Assign period"}</DialogTitle>
            <DialogDescription>
              {popup &&
                `${classById.get(selClassId)?.name ?? ""} · Section ${sectionById.get(selSectionId)?.name ?? ""} · ${DAYS.find((d) => d.value === popup.day)?.label} · P${popup.period}`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Subject</label>
              <NativeSelect
                options={subjectsForClass.map((s) => ({ value: s.id, label: s.name }))}
                value={popup?.subjectId ?? ""}
                onChange={(e) => setPopup((p) => (p ? { ...p, subjectId: e.target.value } : p))}
                placeholder="Select subject…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Teacher</label>
              <NativeSelect
                options={teachers.map((t) => ({ value: t.id, label: t.name }))}
                value={popup?.teacherId ?? ""}
                onChange={(e) => setPopup((p) => (p ? { ...p, teacherId: e.target.value } : p))}
                placeholder="Select teacher…"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Period type</label>
              <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setPopup((p) => (p ? { ...p, isElective: false } : p))}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
                    !popup?.isElective ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  )}
                >
                  Regular
                </button>
                <button
                  type="button"
                  onClick={() => setPopup((p) => (p ? { ...p, isElective: true } : p))}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors",
                    popup?.isElective ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
                  )}
                >
                  Elective
                </button>
              </div>
            </div>
            {warning && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                {warning}
              </div>
            )}
          </div>

          <DialogFooter className="justify-between sm:justify-between">
            {popup?.existingId ? (
              <Button variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={clearSlot} disabled={saving}>
                Clear slot
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPopup(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={savePopup} disabled={saving || !popup?.subjectId || !popup?.teacherId}>
                {saving ? "Saving…" : "Save slot"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
