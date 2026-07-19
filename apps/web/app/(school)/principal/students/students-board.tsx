"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Phone, Users, School, GraduationCap } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { avatarColor, initialsOf } from "@/lib/student-avatar";

interface StudentRow {
  id: string;
  name: string;
  roll: string;
  class_name: string;
  section: string;
  parent_phone: string;
}

interface ClassOption {
  id: string;
  name: string;
}

export function PrincipalStudentsBoard({
  rows,
  classes,
}: {
  rows: StudentRow[];
  classes: ClassOption[];
}) {
  const [search, setSearch] = useState("");
  const [fClass, setFClass] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!fClass || r.class_name === fClass) &&
        (!q || r.name.toLowerCase().includes(q) || r.roll.toLowerCase().includes(q) || r.parent_phone.includes(q))
    );
  }, [rows, search, fClass]);

  const classesCovered = useMemo(() => new Set(rows.map((r) => r.class_name).filter(Boolean)).size, [rows]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View student enrollment and profiles across your school.
        </p>
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
              placeholder="Search by name, roll no or phone…"
              className="w-full border-none bg-transparent text-sm outline-none"
            />
          </div>
          <select
            value={fClass}
            onChange={(e) => setFClass(e.target.value)}
            className="rounded-[10px] border border-border bg-white px-3 py-2.5 text-[13.5px] text-slate-700"
          >
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[13px] text-muted-foreground">
            {filtered.length} of {rows.length} students
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No students found"
            description={rows.length === 0 ? "Students enrolled at your school will appear here." : "No students match your search or filters."}
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[2.5fr_1fr_1.2fr_1.7fr] items-center gap-3 border-b border-border px-[18px] py-3 text-[11px] font-bold tracking-wide text-muted-foreground">
                <div>STUDENT</div>
                <div>ROLL NO</div>
                <div>CLASS / SECTION</div>
                <div>PARENT PHONE</div>
              </div>
              {filtered.map((r) => {
                const av = avatarColor(r.name || r.id);
                return (
                  <Link
                    key={r.id}
                    href={`/principal/students/${r.id}`}
                    className="grid grid-cols-[2.5fr_1fr_1.2fr_1.7fr] items-center gap-3 border-b border-border/70 px-[18px] py-2.5 hover:bg-muted/20"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
                        style={{ background: av.bg, color: av.fg }}
                      >
                        {initialsOf(r.name)}
                      </span>
                      <span className="truncate text-[14.5px] font-semibold text-foreground">{r.name || "—"}</span>
                    </div>
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
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
