"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Phone,
  MoreHorizontal,
  Users,
  School,
  Venus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { GraduationCap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { avatarColor, initialsOf } from "@/lib/student-avatar";
import { AddStudentDrawer } from "./add-student-drawer";
import { ImportDrawer } from "./import-drawer";

interface StudentRow {
  id: string;
  enrollmentId: string;
  name: string;
  email: string;
  roll: string;
  admission_number: string;
  class_id: string;
  class_name: string;
  section_id: string;
  section: string;
  parent_phone: string;
  parent_name: string;
  date_of_birth: string;
  gender: string;
}

interface ClassOption {
  id: string;
  name: string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function genderLabel(g: string) {
  if (!g) return "—";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function genderStyle(g: string) {
  if (g === "male") return { bg: "#dbeafe", fg: "#1d4ed8" };
  if (g === "female") return { bg: "#fce7f3", fg: "#be185d" };
  return { bg: "#f1f5f9", fg: "#64748b" };
}

function downloadCsv(filename: string, rows: StudentRow[]) {
  const headers = ["full_name", "email", "roll_number", "admission_number", "class_name", "section_name", "parent_phone", "parent_name", "date_of_birth", "gender"];
  const csvRows = rows.map((s) =>
    [s.name, s.email, s.roll, s.admission_number, s.class_name, s.section, s.parent_phone, s.parent_name, s.date_of_birth, s.gender]
      .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [headers.join(","), ...csvRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function StudentsBoard({
  schoolId,
  academicYearId,
  rows,
  classes,
}: {
  schoolId: string;
  academicYearId: string;
  rows: StudentRow[];
  classes: ClassOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [fClass, setFClass] = useState("");
  const [fSection, setFSection] = useState("");
  const [fGender, setFGender] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sectionOptions = useMemo(() => {
    const pool = fClass ? rows.filter((r) => r.class_name === fClass) : rows;
    return Array.from(new Set(pool.map((r) => r.section).filter(Boolean))).sort();
  }, [rows, fClass]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!fClass || r.class_name === fClass) &&
        (!fSection || r.section === fSection) &&
        (!fGender || r.gender === fGender) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          r.roll.toLowerCase().includes(q) ||
          r.admission_number.toLowerCase().includes(q) ||
          r.parent_phone.includes(q))
    );
  }, [rows, search, fClass, fSection, fGender]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetPage() {
    setPage(1);
  }

  const classesCovered = useMemo(() => new Set(rows.map((r) => r.class_id).filter(Boolean)).size, [rows]);
  const boys = useMemo(() => rows.filter((r) => r.gender === "male").length, [rows]);
  const girls = useMemo(() => rows.filter((r) => r.gender === "female").length, [rows]);

  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        pageRows.forEach((r) => next.delete(r.id));
      } else {
        pageRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  async function deleteStudents(ids: string[], label: string) {
    if (busy || ids.length === 0) return;
    if (!confirm(`Delete ${label}?\n\nThis permanently removes their profile, enrollment, attendance, exam results, and fee payment history.\n\nThis cannot be undone.`)) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("student_profiles").delete().in("id", ids);
      if (error) {
        toast.error(error.message);
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(`${ids.length} student${ids.length === 1 ? "" : "s"} deleted.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectedRows = rows.filter((r) => selected.has(r.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage enrollment, profiles, and bulk records across every class.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/students/uninstalled"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm hover:bg-muted"
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-700">!</span>
            App Not Installed
          </Link>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv("students.csv", rows)}>
            Export
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            + Add student
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-[170px] items-center gap-3 rounded-[13px] border border-border bg-white px-[18px] py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-100">
            <Users className="h-5 w-5 text-indigo-700" />
          </span>
          <span>
            <span className="block text-[22px] font-bold leading-tight text-foreground">{rows.length}</span>
            <span className="text-xs font-medium text-muted-foreground">Total students</span>
          </span>
        </div>
        <div className="flex min-w-[170px] items-center gap-3 rounded-[13px] border border-border bg-white px-[18px] py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-green-100">
            <School className="h-5 w-5 text-green-700" />
          </span>
          <span>
            <span className="block text-[22px] font-bold leading-tight text-foreground">{classesCovered}</span>
            <span className="text-xs font-medium text-muted-foreground">Classes covered</span>
          </span>
        </div>
        <div className="flex min-w-[170px] items-center gap-3 rounded-[13px] border border-border bg-white px-[18px] py-3.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-blue-100">
            <Venus className="h-5 w-5 text-blue-700" />
          </span>
          <span>
            <span className="block text-[22px] font-bold leading-tight text-foreground">
              {boys} / {girls}
            </span>
            <span className="text-xs font-medium text-muted-foreground">Boys / Girls</span>
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3.5 border-b border-indigo-100 bg-indigo-50 px-[18px] py-3">
            <span className="text-sm font-bold text-indigo-700">{selected.size} selected</span>
            <div className="h-5 w-px bg-indigo-200" />
            <button
              onClick={() => downloadCsv("students-selected.csv", selectedRows)}
              className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-[13.5px] font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              Export selected
            </button>
            <button
              onClick={() => deleteStudents(Array.from(selected), `${selected.size} student${selected.size === 1 ? "" : "s"}`)}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[13.5px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
            <button onClick={() => setSelected(new Set())} className="ml-auto text-[13.5px] font-semibold text-muted-foreground hover:text-foreground">
              Clear
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-[18px] py-3.5">
            <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-border px-3.5 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                name="student-list-search"
                autoComplete="off"
                data-lpignore="true"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Search name, roll no, admission no or phone…"
                className="w-full border-none bg-transparent text-sm outline-none"
              />
            </div>
            <select
              value={fClass}
              onChange={(e) => {
                setFClass(e.target.value);
                setFSection("");
                resetPage();
              }}
              className="rounded-[10px] border border-border bg-white px-3 py-2.5 text-[13.5px] text-slate-700"
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={fSection}
              onChange={(e) => {
                setFSection(e.target.value);
                resetPage();
              }}
              className="rounded-[10px] border border-border bg-white px-3 py-2.5 text-[13.5px] text-slate-700"
            >
              <option value="">All sections</option>
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  Section {s}
                </option>
              ))}
            </select>
            <select
              value={fGender}
              onChange={(e) => {
                setFGender(e.target.value);
                resetPage();
              }}
              className="rounded-[10px] border border-border bg-white px-3 py-2.5 text-[13.5px] text-slate-700"
            >
              <option value="">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            <span className="ml-auto text-[13px] text-muted-foreground">
              {filtered.length} of {rows.length} students
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students found"
            description={rows.length === 0 ? "Add your first student to get started with enrollment." : "No students match your search or filters."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[1080px]">
                <div className="grid grid-cols-[40px_2.5fr_1.2fr_1fr_1.2fr_0.9fr_1.7fr_40px] items-center gap-3 border-b border-border px-[18px] py-3 text-[11px] font-bold tracking-wide text-muted-foreground">
                  <button
                    onClick={toggleAllOnPage}
                    className={
                      "flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px] " +
                      (pageAllSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white")
                    }
                  >
                    {pageAllSelected && <CheckIcon />}
                  </button>
                  <div>STUDENT</div>
                  <div>ADMISSION NO</div>
                  <div>ROLL NO</div>
                  <div>CLASS / SECTION</div>
                  <div>GENDER</div>
                  <div>PARENT</div>
                  <div />
                </div>
                {pageRows.map((r) => {
                  const av = avatarColor(r.name || r.id);
                  const gs = genderStyle(r.gender);
                  const isSelected = selected.has(r.id);
                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-[40px_2.5fr_1.2fr_1fr_1.2fr_0.9fr_1.7fr_40px] items-center gap-3 border-b border-border/70 px-[18px] py-2.5 hover:bg-muted/20"
                    >
                      <button
                        onClick={() => toggleRow(r.id)}
                        className={
                          "flex h-5 w-5 items-center justify-center rounded-[6px] border-[1.5px] " +
                          (isSelected ? "border-indigo-600 bg-indigo-600" : "border-slate-300 bg-white")
                        }
                      >
                        {isSelected && <CheckIcon />}
                      </button>
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                          style={{ background: av.bg, color: av.fg }}
                        >
                          {initialsOf(r.name)}
                        </span>
                        <span className="min-w-0">
                          <Link href={`/admin/students/${r.id}`} className="block truncate text-[14.5px] font-semibold text-foreground hover:text-indigo-600 hover:underline">
                            {r.name || "—"}
                          </Link>
                          <span className="block truncate text-xs text-muted-foreground">{r.email || "—"}</span>
                        </span>
                      </div>
                      <div className="text-[13.5px] tabular-nums text-slate-600">{r.admission_number || "—"}</div>
                      <div className="text-[13.5px] font-semibold text-slate-600">{r.roll || "—"}</div>
                      <div>
                        {r.class_name ? (
                          <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                            {r.class_name}
                            {r.section ? ` · ${r.section}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ background: gs.bg, color: gs.fg }}
                        >
                          {genderLabel(r.gender)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-[13.5px] text-slate-700">{r.parent_name || "—"}</span>
                        {r.parent_phone && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {r.parent_phone}
                          </span>
                        )}
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem render={<Link href={`/admin/students/${r.id}`} />}>View Profile</DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => deleteStudents([r.id], r.name || "this student")}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3.5 px-[18px] py-3.5">
              <div className="text-[13.5px] text-muted-foreground">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div className="flex items-center gap-3.5">
                <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  Rows per page
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      resetPage();
                    }}
                    className="rounded-lg border border-border px-2 py-1.5 text-[13px]"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-600 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-[13.5px] font-semibold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-600 disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <AddStudentDrawer schoolId={schoolId} academicYearId={academicYearId} classes={classes} open={addOpen} onClose={() => setAddOpen(false)} />
      <ImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
