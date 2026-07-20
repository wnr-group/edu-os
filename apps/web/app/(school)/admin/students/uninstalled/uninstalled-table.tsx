"use client";

import { useState } from "react";
import { Copy, Check, Smartphone } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Student {
  id: string;
  full_name: string;
  parent_phone: string;
  roll_number: string;
  class_name: string;
  section_name: string;
}

export function UninstalledStudentTable({ students }: { students: Student[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyPhone(id: string, phone: string) {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard write failed silently — button stays in default state
    }
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Smartphone}
        title="Everyone's set up"
        description="All parents in this view have installed and set up the app."
      />
    );
  }

  function CopyButton({ student }: { student: Student }) {
    return (
      <button
        onClick={() => copyPhone(student.id, student.parent_phone)}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
      >
        {copiedId === student.id ? (
          <><Check className="h-3 w-3 text-green-600" /> Copied</>
        ) : (
          <><Copy className="h-3 w-3" /> Copy Number</>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {["Student", "Class", "Section", "Roll No", "Parent Phone", ""].map((h, i) => (
                <TableHead
                  key={i}
                  className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s, i) => (
              <TableRow
                key={s.id}
                className={`transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
              >
                <TableCell className="px-4 py-3 text-sm font-medium text-foreground">{s.full_name}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{s.class_name}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{s.section_name}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">{s.roll_number || "—"}</TableCell>
                <TableCell className="px-4 py-3 font-mono text-sm text-foreground">{s.parent_phone}</TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <CopyButton student={s} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {students.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{s.full_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.class_name} · Section {s.section_name} · Roll {s.roll_number || "—"}
                </p>
                <p className="mt-1 font-mono text-sm text-foreground">{s.parent_phone}</p>
              </div>
              <CopyButton student={s} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}