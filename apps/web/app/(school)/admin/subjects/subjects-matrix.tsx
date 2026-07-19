"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ClassOption {
  id: string;
  name: string;
  order: number;
}

interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  class_id: string;
}

interface SubjectsMatrixProps {
  schoolId: string;
  classes: ClassOption[];
  subjects: SubjectRow[];
}

const PRESET_SUBJECTS = [
  "English",
  "Hindi",
  "Mathematics",
  "Science",
  "Social Science",
  "Environmental Studies",
  "Computer Science",
  "Physical Education",
  "Art & Craft",
  "Music",
  "Moral Science",
  "General Knowledge",
];

function makeCode(name: string) {
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
}

function priorityIndex(name: string) {
  const i = PRESET_SUBJECTS.indexOf(name);
  return i === -1 ? PRESET_SUBJECTS.length : i;
}

export function SubjectsMatrix({ schoolId, classes, subjects }: SubjectsMatrixProps) {
  const router = useRouter();
  const [quickSubjects, setQuickSubjects] = useState<Set<string>>(new Set());
  const [quickClasses, setQuickClasses] = useState<Set<string>>(new Set());
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");
  const [busy, setBusy] = useState(false);

  const master = useMemo(() => {
    const map = new Map<string, { code: string; cells: Map<string, string> }>();
    for (const s of subjects) {
      let entry = map.get(s.name);
      if (!entry) {
        entry = { code: s.code || makeCode(s.name), cells: new Map() };
        map.set(s.name, entry);
      }
      entry.cells.set(s.class_id, s.id);
    }
    return map;
  }, [subjects]);

  const chipNames = useMemo(() => {
    const names = new Set<string>([...PRESET_SUBJECTS, ...master.keys(), ...customSubjects]);
    return Array.from(names).sort((a, b) => {
      const pa = priorityIndex(a);
      const pb = priorityIndex(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [master, customSubjects]);

  const rowNames = useMemo(() => {
    const names = new Set<string>([...master.keys(), ...customSubjects]);
    return Array.from(names).sort((a, b) => {
      const pa = priorityIndex(a);
      const pb = priorityIndex(b);
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [master, customSubjects]);

  async function mutate(fn: (supabase: ReturnType<typeof createClient>) => Promise<{ error: { message: string; code?: string } | null }>) {
    if (busy) return false;
    setBusy(true);
    const supabase = createClient();
    const { error } = await fn(supabase);
    setBusy(false);
    if (error) {
      toast.error(
        error.code === "23503"
          ? "Can't remove this — it's already used in the timetable. Clear those periods first."
          : error.message
      );
      return false;
    }
    router.refresh();
    return true;
  }

  function toggleCell(name: string, classId: string) {
    const existingId = master.get(name)?.cells.get(classId);
    mutate(async (supabase) => {
      if (existingId) {
        return supabase.from("subjects").delete().eq("id", existingId);
      }
      const code = master.get(name)?.code ?? makeCode(name);
      return supabase.from("subjects").insert({ school_id: schoolId, class_id: classId, name, code });
    });
  }

  function toggleRow(name: string) {
    const entry = master.get(name);
    const cells = entry?.cells ?? new Map<string, string>();
    const allOn = classes.length > 0 && classes.every((c) => cells.has(c.id));
    mutate(async (supabase) => {
      if (allOn) {
        return supabase.from("subjects").delete().in("id", Array.from(cells.values()));
      }
      const code = entry?.code ?? makeCode(name);
      const rows = classes
        .filter((c) => !cells.has(c.id))
        .map((c) => ({ school_id: schoolId, class_id: c.id, name, code }));
      return supabase.from("subjects").insert(rows);
    });
  }

  function toggleColumn(classId: string) {
    const allOn = rowNames.length > 0 && rowNames.every((name) => master.get(name)?.cells.has(classId));
    mutate(async (supabase) => {
      if (allOn) {
        const ids = rowNames.flatMap((name) => {
          const id = master.get(name)?.cells.get(classId);
          return id ? [id] : [];
        });
        return supabase.from("subjects").delete().in("id", ids);
      }
      const rows = rowNames
        .filter((name) => !master.get(name)?.cells.has(classId))
        .map((name) => ({ school_id: schoolId, class_id: classId, name, code: master.get(name)?.code ?? makeCode(name) }));
      return supabase.from("subjects").insert(rows);
    });
  }

  function toggleQuickSubject(name: string) {
    setQuickSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleQuickClass(classId: string) {
    setQuickClasses((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  function addCustomSubject() {
    const name = customInput.trim();
    if (!name) return;
    if (!chipNames.includes(name)) setCustomSubjects((prev) => [...prev, name]);
    setQuickSubjects((prev) => new Set([...prev, name]));
    setCustomInput("");
  }

  const ready = quickSubjects.size > 0 && quickClasses.size > 0;
  const quickSummary = ready
    ? `${quickSubjects.size} subject${quickSubjects.size > 1 ? "s" : ""} × ${quickClasses.size} class${quickClasses.size > 1 ? "es" : ""} = ${quickSubjects.size * quickClasses.size} links`
    : "Tick subjects and classes above";

  async function createAll() {
    if (!ready) return;
    const rows: { school_id: string; class_id: string; name: string; code: string }[] = [];
    quickSubjects.forEach((name) => {
      const entry = master.get(name);
      const code = entry?.code ?? makeCode(name);
      quickClasses.forEach((classId) => {
        if (!entry?.cells.has(classId)) rows.push({ school_id: schoolId, class_id: classId, name, code });
      });
    });
    if (rows.length === 0) {
      toast.error("All selected pairs already exist.");
      return;
    }
    const success = await mutate(async (supabase) => supabase.from("subjects").insert(rows));
    if (success) {
      setQuickSubjects(new Set());
      setQuickClasses(new Set());
      setCustomSubjects([]);
    }
  }

  const totalLinks = subjects.length;
  const totalSubjects = rowNames.length;
  const classesCovered = classes.filter((c) => rowNames.some((name) => master.get(name)?.cells.has(c.id))).length;

  const stats = [
    { value: totalLinks, label: "Subject–class links", dot: "#6366f1" },
    { value: totalSubjects, label: "Subjects", dot: "#22c55e" },
    { value: `${classesCovered}/${classes.length}`, label: "Classes covered", dot: "#f59e0b" },
  ];

  const gridMinWidth = 240 + classes.length * 90;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subjects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See at a glance which subjects each class covers. Click any cell to add or remove a subject.
        </p>
      </div>

      {/* Quick setup */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="text-base font-bold text-foreground">Quick Setup</div>
        <p className="mt-0.5 text-sm text-muted-foreground">Tick subjects and classes, then apply them all at once.</p>

        <div className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Subjects</div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {chipNames.map((name) => {
            const selected = quickSubjects.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleQuickSubject(name)}
                className={cn(
                  "rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            placeholder="Custom subject name…"
            className="max-w-[260px]"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomSubject();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCustomSubject}>
            + Add
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assign to classes</div>
          <div className="flex gap-3.5 text-sm font-semibold">
            <button type="button" onClick={() => setQuickClasses(new Set(classes.map((c) => c.id)))} className="text-primary hover:underline">
              Select all
            </button>
            <button type="button" onClick={() => setQuickClasses(new Set())} className="text-muted-foreground hover:underline">
              Clear
            </button>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {classes.map((c) => {
            const selected = quickClasses.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleQuickClass(c.id)}
                className={cn(
                  "rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                )}
              >
                {c.name}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3.5">
          <div className="text-sm text-muted-foreground">{quickSummary}</div>
          <Button onClick={createAll} disabled={busy || !ready}>
            Assign selected
          </Button>
        </div>
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

      {/* Matrix card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Coverage matrix</div>
            <div className="mt-0.5 text-lg font-bold text-foreground">Subjects × Classes</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-indigo-200 bg-indigo-50">
                <Check className="h-2.5 w-2.5 text-indigo-600" strokeWidth={3.5} />
              </span>
              Taught
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-4 w-4 rounded border-[1.5px] border-dashed border-slate-300" />
              Not offered
            </span>
          </div>
        </div>

        {classes.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No classes created yet. Go to Classes first.
          </div>
        ) : (
          <div className="overflow-x-auto p-3.5">
            <div className="flex flex-col gap-1.5" style={{ minWidth: gridMinWidth }}>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `240px repeat(${classes.length}, 1fr)` }}>
                <div className="flex items-center pl-2 text-xs font-bold text-muted-foreground">SUBJECT</div>
                {classes.map((c) => {
                  const count = rowNames.filter((name) => master.get(name)?.cells.has(c.id)).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleColumn(c.id)}
                      title="Toggle whole class"
                      disabled={busy}
                      className="rounded-lg bg-muted/50 px-1 py-2 text-center transition-colors hover:bg-primary/10"
                    >
                      <div className="truncate text-[12.5px] font-bold text-foreground">{c.name}</div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground">{count} subj</div>
                    </button>
                  );
                })}
              </div>

              {rowNames.map((name) => {
                const entry = master.get(name);
                const cells = entry?.cells ?? new Map<string, string>();
                return (
                  <div key={name} className="grid gap-1.5" style={{ gridTemplateColumns: `240px repeat(${classes.length}, 1fr)` }}>
                    <button
                      type="button"
                      onClick={() => toggleRow(name)}
                      title="Toggle all classes"
                      disabled={busy}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold leading-tight text-foreground">{name}</span>
                        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">{entry?.code ?? makeCode(name)}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11.5px] font-bold text-primary">
                        {cells.size}/{classes.length}
                      </span>
                    </button>
                    {classes.map((c) => {
                      const on = cells.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCell(name, c.id)}
                          disabled={busy}
                          className={cn(
                            "flex min-h-[44px] items-center justify-center rounded-lg border transition-colors",
                            on
                              ? "border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
                              : "border-dashed border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50"
                          )}
                        >
                          {on && <Check className="h-4 w-4 text-indigo-600" strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
