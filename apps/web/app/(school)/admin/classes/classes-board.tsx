"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { School, GripVertical, ChevronDown, Trash2, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

interface ClassOption {
  id: string;
  name: string;
  order: number;
}

interface SectionInfo {
  id: string;
  class_id: string;
  name: string;
  teacherId: string;
  students: number;
}

interface TeacherOption {
  id: string;
  name: string;
}

interface ClassesBoardProps {
  schoolId: string;
  academicYearId: string;
  classes: ClassOption[];
  sections: SectionInfo[];
  teacherOptions: TeacherOption[];
}

const QUICK_CLASSES = ["LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const QUICK_SECTIONS = ["A", "B", "C", "D", "E"];
const UNASSIGNED = "__none__";

function quickClassName(raw: string) {
  return /^\d+$/.test(raw) ? `Class ${raw}` : raw;
}

function nextSectionLetter(usedLabels: Set<string>) {
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    if (!usedLabels.has(letter)) return letter;
  }
  return "?";
}

export function ClassesBoard({ schoolId, academicYearId, classes, sections, teacherOptions }: ClassesBoardProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickClasses, setQuickClasses] = useState<Set<string>>(new Set());
  const [quickSections, setQuickSections] = useState<Set<string>>(new Set(["A", "B"]));
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [renamingClassId, setRenamingClassId] = useState<string | null>(null);
  const [renamingClassName, setRenamingClassName] = useState("");
  const [renamingSectionId, setRenamingSectionId] = useState<string | null>(null);
  const [renamingSectionName, setRenamingSectionName] = useState("");

  const orderedClasses = useMemo(() => [...classes].sort((a, b) => a.order - b.order), [classes]);

  const sectionsByClass = useMemo(() => {
    const map = new Map<string, SectionInfo[]>();
    sections.forEach((s) => {
      const list = map.get(s.class_id) ?? [];
      list.push(s);
      map.set(s.class_id, list);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [sections]);

  const teacherById = useMemo(() => new Map(teacherOptions.map((t) => [t.id, t.name])), [teacherOptions]);

  async function mutate(fn: (supabase: ReturnType<typeof createClient>) => Promise<{ error: { message: string; code?: string } | null }>) {
    if (busy) return false;
    setBusy(true);
    const supabase = createClient();
    const { error } = await fn(supabase);
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "Can't remove this — it's still referenced elsewhere (students, timetable, etc.)."
          : error.message
      );
      return false;
    }
    router.refresh();
    return true;
  }

  // ---- class reordering ----
  function handleDrop(targetId: string) {
    setOverId(null);
    if (!dragId || dragId === targetId) {
      setDragId(null);
      return;
    }
    const fromIdx = orderedClasses.findIndex((c) => c.id === dragId);
    const toIdx = orderedClasses.findIndex((c) => c.id === targetId);
    setDragId(null);
    if (fromIdx < 0 || toIdx < 0) return;

    const reordered = [...orderedClasses];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    mutate(async (supabase) => {
      const results = await Promise.all(
        reordered.map((c, i) => supabase.from("classes").update({ order: i + 1 }).eq("id", c.id))
      );
      return results.find((r) => r.error) ?? { error: null };
    });
  }

  // ---- class actions ----
  async function addClass() {
    if (busy) return;
    setBusy(true);
    const supabase = createClient();
    const nextOrder = (orderedClasses.at(-1)?.order ?? 0) + 1;
    const { data: created, error } = await supabase
      .from("classes")
      .insert({ school_id: schoolId, name: "New Class", order: nextOrder })
      .select("id")
      .single();
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    if (academicYearId && created) {
      await supabase.from("sections").insert({ school_id: schoolId, class_id: created.id, name: "A", academic_year_id: academicYearId });
    }
    setBusy(false);
    if (created) setExpanded((e) => ({ ...e, [created.id]: true }));
    toast.success("Class added.");
    router.refresh();
  }

  async function deleteClass(cls: ClassOption) {
    if (busy) return;
    setBusy(true);
    const precheck = createClient();
    const { count: studentCount } = await precheck
      .from("student_profiles")
      .select("id", { count: "exact", head: true })
      .eq("class_id", cls.id);
    setBusy(false);
    if ((studentCount ?? 0) > 0) {
      toast.error(
        `"${cls.name}" still has ${studentCount} student${studentCount === 1 ? "" : "s"} assigned. Move or remove them first (Admin → Students), then try again.`
      );
      return;
    }

    if (
      !confirm(
        `Delete "${cls.name}"?\n\nThis will also delete all associated:\n• Sections\n• Subjects\n• Homework posts\n• Attendance records\n• Exam results\n• Timetable entries\n• Syllabus entries\n• Fee structures & payments\n\nThis cannot be undone.`
      )
    )
      return;

    const classSections = sectionsByClass.get(cls.id) ?? [];
    const sectionIds = classSections.map((s) => s.id);

    const success = await mutate(async (supabase) => {
      const [{ data: classSubjects }, { data: classFeeStructures }] = await Promise.all([
        supabase.from("subjects").select("id").eq("class_id", cls.id),
        supabase.from("fee_structures").select("id").eq("class_id", cls.id),
      ]);
      const subjectIds = (classSubjects ?? []).map((s) => s.id);
      const feeStructureIds = (classFeeStructures ?? []).map((f) => f.id);

      const cleanups = [
        supabase.from("student_enrollments").delete().eq("class_id", cls.id),
        supabase.from("syllabus").delete().eq("class_id", cls.id),
        supabase.from("fee_line_items").delete().eq("class_id", cls.id),
        supabase.from("homework").delete().eq("class_id", cls.id),
      ];
      if (sectionIds.length > 0) {
        cleanups.push(supabase.from("timetable").delete().in("section_id", sectionIds));
        cleanups.push(supabase.from("attendance_records").delete().in("section_id", sectionIds));
      }
      if (subjectIds.length > 0) {
        cleanups.push(supabase.from("exam_results").delete().in("subject_id", subjectIds));
      }
      if (feeStructureIds.length > 0) {
        cleanups.push(supabase.from("fee_payments").delete().in("fee_structure_id", feeStructureIds));
      }
      await Promise.all(cleanups);
      if (feeStructureIds.length > 0) {
        await supabase.from("fee_structures").delete().in("id", feeStructureIds);
      }
      return supabase.from("classes").delete().eq("id", cls.id);
    });
    if (success) toast.success(`"${cls.name}" and all associations deleted.`);
  }

  function startRenameClass(cls: ClassOption, e: React.MouseEvent) {
    e.stopPropagation();
    setRenamingClassId(cls.id);
    setRenamingClassName(cls.name);
  }

  async function saveRenameClass() {
    const id = renamingClassId;
    const name = renamingClassName.trim();
    setRenamingClassId(null);
    if (!id || !name) return;
    await mutate(async (supabase) => supabase.from("classes").update({ name }).eq("id", id));
  }

  // ---- section actions ----
  async function addSection(cls: ClassOption) {
    if (!academicYearId) {
      toast.error("No active academic year. Set one up under Academics first.");
      return;
    }
    const used = new Set((sectionsByClass.get(cls.id) ?? []).map((s) => s.name));
    const label = nextSectionLetter(used);
    const success = await mutate(async (supabase) =>
      supabase.from("sections").insert({ school_id: schoolId, class_id: cls.id, name: label, academic_year_id: academicYearId })
    );
    if (success) setExpanded((e) => ({ ...e, [cls.id]: true }));
  }

  async function deleteSection(section: SectionInfo, className: string) {
    if (busy) return;
    setBusy(true);
    const precheck = createClient();
    const { count: studentCount } = await precheck
      .from("student_profiles")
      .select("id", { count: "exact", head: true })
      .eq("section_id", section.id);
    setBusy(false);
    if ((studentCount ?? 0) > 0) {
      toast.error(
        `Section "${section.name}" still has ${studentCount} student${studentCount === 1 ? "" : "s"} assigned. Move or remove them first, then try again.`
      );
      return;
    }

    if (
      !confirm(
        `Delete section "${section.name}" from ${className}?\n\nThis will also delete its timetable entries, homework posts, and attendance records.`
      )
    )
      return;

    const success = await mutate(async (supabase) => {
      await Promise.all([
        supabase.from("timetable").delete().eq("section_id", section.id),
        supabase.from("attendance_records").delete().eq("section_id", section.id),
        supabase.from("homework").delete().eq("section_id", section.id),
      ]);
      return supabase.from("sections").delete().eq("id", section.id);
    });
    if (success) toast.success(`Section "${section.name}" deleted.`);
  }

  function startRenameSection(section: SectionInfo) {
    setRenamingSectionId(section.id);
    setRenamingSectionName(section.name);
  }

  async function saveRenameSection() {
    const id = renamingSectionId;
    const name = renamingSectionName.trim();
    setRenamingSectionId(null);
    if (!id || !name) return;
    await mutate(async (supabase) => supabase.from("sections").update({ name }).eq("id", id));
  }

  async function handleTeacherChange(sectionId: string, teacherId: string) {
    if (!academicYearId) {
      toast.error("No active academic year. Set one up under Academics first.");
      return;
    }
    await mutate(async (supabase) =>
      teacherId
        ? supabase.from("section_assignments").upsert(
            { section_id: sectionId, academic_year_id: academicYearId, class_teacher_id: teacherId, school_id: schoolId },
            { onConflict: "section_id,academic_year_id" }
          )
        : supabase.from("section_assignments").delete().eq("section_id", sectionId).eq("academic_year_id", academicYearId)
    );
  }

  // ---- quick setup ----
  function toggleQuickClass(name: string) {
    setQuickClasses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleQuickSection(name: string) {
    setQuickSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const quickReady = quickClasses.size > 0 && quickSections.size > 0;
  const quickSummary = quickReady
    ? `${quickClasses.size} class${quickClasses.size > 1 ? "es" : ""} × ${quickSections.size} section${quickSections.size > 1 ? "s" : ""} = ${quickClasses.size * quickSections.size} to create`
    : "Pick classes and sections to create them together.";

  async function createAllQuick() {
    if (!quickReady || busy) return;
    if (!academicYearId) {
      toast.error("No active academic year. Set one up under Academics first.");
      return;
    }
    setBusy(true);
    const supabase = createClient();

    const wantedNames = Array.from(quickClasses).map(quickClassName);
    const existingByName = new Map(orderedClasses.map((c) => [c.name, c]));
    const toCreateNames = wantedNames.filter((n) => !existingByName.has(n));

    let newlyCreated: { id: string; name: string }[] = [];
    if (toCreateNames.length > 0) {
      const startOrder = (orderedClasses.at(-1)?.order ?? 0) + 1;
      const rows = toCreateNames.map((name, i) => ({ school_id: schoolId, name, order: startOrder + i }));
      const { data, error } = await supabase.from("classes").insert(rows).select("id, name");
      if (error) {
        setBusy(false);
        toast.error(error.message);
        return;
      }
      newlyCreated = data ?? [];
    }

    const classByName = new Map<string, { id: string; name: string }>([
      ...orderedClasses.map((c) => [c.name, c] as const),
      ...newlyCreated.map((c) => [c.name, c] as const),
    ]);

    const sectionNamesByClass = new Map<string, Set<string>>();
    sections.forEach((s) => {
      const cls = orderedClasses.find((c) => c.id === s.class_id);
      if (!cls) return;
      if (!sectionNamesByClass.has(cls.name)) sectionNamesByClass.set(cls.name, new Set());
      sectionNamesByClass.get(cls.name)!.add(s.name);
    });

    const sectionRows: { school_id: string; class_id: string; name: string; academic_year_id: string }[] = [];
    wantedNames.forEach((name) => {
      const cls = classByName.get(name);
      if (!cls) return;
      const existing = sectionNamesByClass.get(name) ?? new Set();
      quickSections.forEach((letter) => {
        if (!existing.has(letter)) sectionRows.push({ school_id: schoolId, class_id: cls.id, name: letter, academic_year_id: academicYearId });
      });
    });

    if (sectionRows.length > 0) {
      const { error: sectionError } = await supabase.from("sections").insert(sectionRows);
      if (sectionError) {
        setBusy(false);
        toast.error("Classes created but sections failed: " + sectionError.message);
        router.refresh();
        return;
      }
    }

    setBusy(false);
    toast.success(`Created ${toCreateNames.length} classes and ${sectionRows.length} sections.`);
    setQuickClasses(new Set());
    setQuickOpen(false);
    router.refresh();
  }

  // ---- derived ----
  const totalSections = sections.length;
  const totalStudents = sections.reduce((n, s) => n + s.students, 0);
  const needTeacher = sections.filter((s) => !s.teacherId).length;

  const stats = [
    { value: orderedClasses.length, label: "Classes", dot: "#6366f1" },
    { value: totalSections, label: "Sections", dot: "#22c55e" },
    { value: needTeacher, label: "Need a class teacher", dot: "#f59e0b" },
    { value: totalStudents.toLocaleString(), label: "Students", dot: "#0ea5e9" },
  ];

  const q = search.trim().toLowerCase();
  const filtered = q ? orderedClasses.filter((c) => c.name.toLowerCase().includes(q)) : orderedClasses;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classes &amp; sections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every class, its sections, and their class teachers — all on one page.
          </p>
        </div>
        <Button onClick={addClass} disabled={busy}>
          <Plus className="h-3.5 w-3.5" />
          Add class
        </Button>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3">
        {stats.map((st) => (
          <div key={st.label} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.dot }} />
            <span className="text-lg font-bold text-foreground">{st.value}</span>
            <span className="text-sm font-medium text-muted-foreground">{st.label}</span>
          </div>
        ))}
      </div>

      {/* Quick setup (collapsible) */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <button
          type="button"
          onClick={() => setQuickOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <span>
              <span className="block text-[15px] font-bold text-foreground">Quick setup</span>
              <span className="text-[13px] text-muted-foreground">Create several classes and sections at once.</span>
            </span>
          </div>
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", quickOpen && "rotate-180")} />
        </button>
        {quickOpen && (
          <div className="px-5 pb-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Classes</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_CLASSES.map((name) => {
                    const selected = quickClasses.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleQuickClass(name)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted/50"
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="mb-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">Sections per class</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SECTIONS.map((name) => {
                    const selected = quickSections.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleQuickSection(name)}
                        className={cn(
                          "flex h-[38px] w-10 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted/50"
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3.5">
              <div className="text-sm text-muted-foreground">{quickSummary}</div>
              <Button onClick={createAllQuick} disabled={busy || !quickReady}>
                Create all
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search classes…"
        className="max-w-[420px]"
      />

      {orderedClasses.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5" />
            Drag the handle to reorder how classes appear across the app.
          </div>
          <div className="flex gap-3.5 text-sm font-semibold">
            <button type="button" onClick={() => setExpanded(Object.fromEntries(orderedClasses.map((c) => [c.id, true])))} className="text-primary hover:underline">
              Expand all
            </button>
            <button type="button" onClick={() => setExpanded({})} className="text-muted-foreground hover:underline">
              Collapse all
            </button>
          </div>
        </div>
      )}

      {/* Class list */}
      {orderedClasses.length === 0 ? (
        <EmptyState icon={School} title="No classes yet" description="Use Quick Setup above to create classes and sections." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((cls) => {
            const idx = orderedClasses.findIndex((c) => c.id === cls.id);
            const classSections = sectionsByClass.get(cls.id) ?? [];
            const isExpanded = !!expanded[cls.id];
            const withTeacher = classSections.filter((s) => s.teacherId).length;

            return (
              <div
                key={cls.id}
                draggable={!search}
                onDragStart={() => setDragId(cls.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== cls.id) setOverId(cls.id);
                }}
                onDragLeave={() => setOverId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(cls.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "rounded-2xl border border-border bg-card shadow-sm transition-opacity",
                  dragId === cls.id && "opacity-40",
                  overId === cls.id && dragId !== cls.id && "outline outline-2 outline-offset-[-2px] outline-primary"
                )}
              >
                <div className="flex items-center gap-3.5 px-[18px] py-3.5">
                  {!search && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing" />}
                  <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-sm font-bold text-muted-foreground">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [cls.id]: !isExpanded }))}
                    className="flex min-w-0 flex-1 items-center gap-3.5 bg-transparent text-left"
                  >
                    {renamingClassId === cls.id ? (
                      <input
                        autoFocus
                        value={renamingClassName}
                        onChange={(e) => setRenamingClassName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={saveRenameClass}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveRenameClass(); }
                          if (e.key === "Escape") setRenamingClassId(null);
                        }}
                        className="w-40 shrink-0 rounded border border-primary bg-card px-1.5 py-0.5 text-[15px] font-bold text-foreground outline-none"
                      />
                    ) : (
                      <span
                        onClick={(e) => startRenameClass(cls, e)}
                        title="Click to rename"
                        className="shrink-0 text-[15px] font-bold text-foreground hover:underline"
                      >
                        {cls.name}
                      </span>
                    )}
                    <span className="flex flex-wrap gap-1.5">
                      {classSections.map((s) => {
                        const has = !!s.teacherId;
                        return (
                          <span
                            key={s.id}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                              has ? "border-indigo-100 bg-indigo-50 text-indigo-700" : "border-amber-200 bg-amber-50 text-amber-700"
                            )}
                          >
                            <span className="font-bold">{s.name}</span>
                            <span className="opacity-70">{has ? teacherById.get(s.teacherId) ?? "—" : "unassigned"}</span>
                          </span>
                        );
                      })}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-4">
                      <span className="text-xs text-muted-foreground">
                        {classSections.length} section{classSections.length === 1 ? "" : "s"} · {withTeacher}/{classSections.length} teachers
                      </span>
                      <ChevronDown className={cn("h-[18px] w-[18px] text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteClass(cls)}
                    title="Delete class"
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-border/60 py-2 pl-[70px] pr-[18px]">
                    <div className="grid grid-cols-[80px_1fr_240px_36px] items-center gap-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <div>Section</div>
                      <div>Students</div>
                      <div>Class teacher</div>
                      <div />
                    </div>
                    {classSections.map((sec) => (
                      <div key={sec.id} className="grid grid-cols-[80px_1fr_240px_36px] items-center gap-3 border-t border-border/40 py-2">
                        {renamingSectionId === sec.id ? (
                          <input
                            autoFocus
                            value={renamingSectionName}
                            onChange={(e) => setRenamingSectionName(e.target.value)}
                            onBlur={saveRenameSection}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); saveRenameSection(); }
                              if (e.key === "Escape") setRenamingSectionId(null);
                            }}
                            className="w-16 rounded border border-primary bg-card px-1.5 py-0.5 text-sm font-bold text-foreground outline-none"
                          />
                        ) : (
                          <span
                            onClick={() => startRenameSection(sec)}
                            title="Click to rename"
                            className="cursor-pointer text-sm font-bold text-foreground hover:underline"
                          >
                            {sec.name}
                          </span>
                        )}
                        <span className="text-sm text-muted-foreground">{sec.students} students</span>
                        <NativeSelect
                          options={[{ value: UNASSIGNED, label: "— No class teacher —" }, ...teacherOptions.map((t) => ({ value: t.id, label: t.name }))]}
                          value={sec.teacherId || UNASSIGNED}
                          disabled={busy}
                          onChange={(e) => handleTeacherChange(sec.id, e.target.value === UNASSIGNED ? "" : e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => deleteSection(sec, cls.name)}
                          title="Remove section"
                          className="flex justify-center rounded p-1 text-muted-foreground/40 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addSection(cls)}
                      disabled={busy}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-border px-3.5 py-2 text-[13.5px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      + Add section {nextSectionLetter(new Set(classSections.map((s) => s.name)))}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              No classes match &ldquo;{search}&rdquo;.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
