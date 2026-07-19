"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Phone, Users, Venus, GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { avatarColor, initialsOf } from "@/lib/student-avatar";

export interface TeacherStudentRow {
  id: string;
  full_name: string | null;
  roll_number: string | null;
  admission_number: string | null;
  photo_url: string | null;
  parent_phone: string | null;
  gender?: string | null;
}

function Avatar({ row }: { row: TeacherStudentRow }) {
  const av = avatarColor(row.full_name || row.id);
  if (row.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={row.photo_url}
        alt={row.full_name ?? ""}
        className="h-[38px] w-[38px] shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      style={{ background: av.bg, color: av.fg }}
    >
      {initialsOf(row.full_name ?? "")}
    </span>
  );
}

export function TeacherStudentsBoard({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: TeacherStudentRow[];
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(q) ||
        (r.roll_number ?? "").toLowerCase().includes(q) ||
        (r.admission_number ?? "").toLowerCase().includes(q) ||
        (r.parent_phone ?? "").includes(q)
    );
  }, [rows, search]);

  const boys = useMemo(() => rows.filter((r) => r.gender === "male").length, [rows]);
  const girls = useMemo(() => rows.filter((r) => r.gender === "female").length, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
        {(boys > 0 || girls > 0) && (
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
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-[18px] py-3.5">
          <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-2 rounded-[10px] border border-border px-3.5 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              name="student-search"
              autoComplete="off"
              data-lpignore="true"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, roll no or admission no…"
              className="w-full border-none bg-transparent text-sm outline-none"
            />
          </div>
          <span className="ml-auto text-[13px] text-muted-foreground">
            {filtered.length} of {rows.length} students
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={rows.length === 0 ? "No students in this section" : "No students found"}
            description={
              rows.length === 0
                ? "Students enrolled in the selected section will appear here."
                : "No students match your search."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-[2.5fr_1fr_1.2fr_1.7fr] items-center gap-3 border-b border-border px-[18px] py-3 text-[11px] font-bold tracking-wide text-muted-foreground">
                <div>STUDENT</div>
                <div>ROLL NO</div>
                <div>ADMISSION NO</div>
                <div>PARENT PHONE</div>
              </div>
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/teacher/students/${r.id}`}
                  className="grid grid-cols-[2.5fr_1fr_1.2fr_1.7fr] items-center gap-3 border-b border-border/70 px-[18px] py-2.5 hover:bg-muted/20"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar row={r} />
                    <span className="truncate text-[14.5px] font-semibold text-foreground">{r.full_name || "—"}</span>
                  </div>
                  <div className="text-[13.5px] font-semibold text-slate-600">{r.roll_number || "—"}</div>
                  <div className="text-[13.5px] tabular-nums text-slate-600">{r.admission_number || "—"}</div>
                  <div className="min-w-0">
                    {r.parent_phone ? (
                      <span className="flex items-center gap-1.5 text-[13.5px] text-slate-700">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {r.parent_phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
