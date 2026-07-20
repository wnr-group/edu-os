"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/ui/native-select";

interface StudentRow {
  id: string;
  name: string;
  roll: string;
  class_name: string;
  section: string;
}

interface Option {
  label: string;
  value: string;
}

export function ReportCardTable({
  rows,
  classOptions,
  examOptions,
  stats,
}: {
  rows: StudentRow[];
  classOptions: Option[];
  examOptions: Option[];
  stats?: React.ReactNode;
}) {
  const [examId, setExamId] = useState(examOptions[0]?.value ?? "");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Exam:</label>
        <NativeSelect
          options={examOptions}
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          placeholder="Select exam"
          className="w-56"
        />
      </div>
      <ListPageTemplate<StudentRow>
        title="Report Cards"
        description="View and download student report cards."
        stats={stats}
        data={rows}
        columns={[
          { header: "Name", accessor: "name" },
          { header: "Roll No.", accessor: "roll" },
          { header: "Class", accessor: "class_name" },
          { header: "Section", accessor: "section" },
        ]}
        searchKeys={["name", "roll"]}
        searchPlaceholder="Search by name or roll number..."
        filters={
          classOptions.length > 0
            ? [
                {
                  label: "All Classes",
                  options: classOptions,
                  filterFn: (row: StudentRow, value: string) => row.class_name === value,
                },
              ]
            : []
        }
        renderActions={(row) => (
          <Link
            href={`/admin/report-cards/${row.id}?examId=${examId}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
          >
            <FileText className="h-3.5 w-3.5" />
            View
          </Link>
        )}
        renderMobileCard={(row) => (
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  Roll {row.roll || "—"} · {row.class_name}{row.section ? ` · ${row.section}` : ""}
                </p>
              </div>
              <Link
                href={`/admin/report-cards/${row.id}?examId=${examId}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700"
              >
                <FileText className="h-3.5 w-3.5" />
                View
              </Link>
            </div>
          </div>
        )}
        emptyState={
          <EmptyState
            icon={FileText}
            title="No students found"
            description="Add students to generate report cards."
          />
        }
      />
    </div>
  );
}