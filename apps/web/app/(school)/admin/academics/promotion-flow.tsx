"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface StudentRow {
  studentProfileId: string;
  name: string;
  currentClass: string;
  currentSection: string;
  suggestedClassId: string;
  suggestedClassName: string;
  suggestedSectionId: string;
  suggestedSectionName: string;
  hasPendingResults: boolean;
}

interface ClassOption {
  id: string;
  name: string;
}

interface SectionOption {
  id: string;
  name: string;
  classId: string;
}

interface Props {
  students: StudentRow[];
  draftYearId: string;
  classes: ClassOption[];
  sections: SectionOption[];
}

export function PromotionFlow({ students, draftYearId, classes, sections }: Props) {
  const router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, { classId: string; sectionId: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(students.map((s) => s.studentProfileId))
  );
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "ready">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filtered = students.filter((s) => {
    if (filter === "pending") return s.hasPendingResults;
    if (filter === "ready") return !s.hasPendingResults;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const pagedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.studentProfileId));
  const someFilteredSelected = filtered.some((s) => selected.has(s.studentProfileId));

  function toggleAllFiltered() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const s of filtered) next.delete(s.studentProfileId);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        for (const s of filtered) next.add(s.studentProfileId);
        return next;
      });
    }
  }

  function getEffective(s: StudentRow) {
    return overrides[s.studentProfileId] ?? {
      classId: s.suggestedClassId,
      sectionId: s.suggestedSectionId,
    };
  }

  async function handlePromote() {
    const toPromote = students.filter((s) => selected.has(s.studentProfileId));
    if (toPromote.length === 0) return;

    const promotions = toPromote.map((s) => {
      const eff = getEffective(s);
      return { studentProfileId: s.studentProfileId, targetClassId: eff.classId, targetSectionId: eff.sectionId };
    });

    setLoading(true);
    const res = await fetch("/api/academics/promote-students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftYearId, promotions }),
    });
    setLoading(false);

    if (!res.ok) {
      toast.error("Promotion failed");
      return;
    }
    const data = await res.json();
    toast.success(`${data.promoted} students promoted to draft year.`);
    router.push("/admin/academics");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(["all", "ready", "pending"] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`rounded-full px-3 py-1 text-sm font-medium ${filter === f ? "bg-indigo-600 text-white" : "bg-muted text-foreground"}`}
          >
            {f === "all" ? `All (${students.length})` : f === "ready" ? `Ready (${students.filter((s) => !s.hasPendingResults).length})` : `Pending results (${students.filter((s) => s.hasPendingResults).length})`}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">
          {selected.size} of {students.length} will be promoted
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected;
                  }}
                  onChange={toggleAllFiltered}
                  aria-label="Select or deselect all visible students"
                />
              </th>
              <th className="px-4 py-2 text-left">Student</th>
              <th className="px-4 py-2 text-left">Current</th>
              <th className="px-4 py-2 text-left">Target Class</th>
              <th className="px-4 py-2 text-left">Target Section</th>
              <th className="px-4 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagedRows.map((s) => {
              const eff = getEffective(s);
              const filteredSections = sections.filter((sec) => sec.classId === eff.classId);
              const isSelected = selected.has(s.studentProfileId);
              return (
                <tr key={s.studentProfileId} className={!isSelected ? "opacity-40" : ""}>
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.studentProfileId)) next.delete(s.studentProfileId); else next.add(s.studentProfileId);
                        return next;
                      })}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium">{s.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">{s.currentClass} {s.currentSection}</td>
                  <td className="px-4 py-2">
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={eff.classId}
                      onChange={(e) => setOverrides((prev) => ({
                        ...prev,
                        [s.studentProfileId]: { classId: e.target.value, sectionId: sections.find((sec) => sec.classId === e.target.value)?.id ?? "" },
                      }))}
                    >
                      {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <select
                      className="rounded border px-2 py-1 text-sm"
                      value={eff.sectionId}
                      onChange={(e) => setOverrides((prev) => ({
                        ...prev,
                        [s.studentProfileId]: { ...getEffective(s), sectionId: e.target.value },
                      }))}
                    >
                      {filteredSections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {s.hasPendingResults ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pending results</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col items-center justify-between gap-4 rounded-lg  p-3 text-xs text-muted-foreground sm:flex-row">
        <div>
          Showing {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="rounded border border-input bg-background px-2 py-1 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[13.5px] font-semibold text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-600 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.push("/admin/academics")}>Cancel</Button>
        <Button onClick={handlePromote} disabled={loading || selected.size === 0}>
          {loading ? "Promoting…" : `Promote ${selected.size} Student${selected.size === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}
