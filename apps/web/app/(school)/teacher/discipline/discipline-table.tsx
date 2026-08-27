"use client";

import Link from "next/link";
import { AlertTriangle, MoreHorizontal } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type SeverityVariant = "default" | "secondary" | "destructive" | "outline";

function severityVariant(severity: string | null): SeverityVariant {
  if (severity === "suspension") return "destructive";
  if (severity === "written") return "secondary";
  return "outline";
}

export interface DisciplineRow {
  id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  category: string;
  severity: string | null;
  status: string;
  description: string;
  date: string;
}

function RowActions({ row }: { row: DisciplineRow }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={`/teacher/students/${row.student_id}`} />}>
          View Student
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DisciplineTable({
  rows,
  stats,
  categoryOptions,
}: {
  rows: DisciplineRow[];
  stats?: React.ReactNode;
  categoryOptions: { label: string; value: string }[];
}) {
  const severityOptions = [
    { label: "Verbal", value: "verbal" },
    { label: "Written", value: "written" },
    { label: "Suspension", value: "suspension" },
  ];

  return (
    <ListPageTemplate<DisciplineRow>
      title="Incident History"
      data={rows}
      stats={stats}
      columns={[
        {
          header: "Student",
          accessor: (row) => (
            <Link href={`/teacher/students/${row.student_id}`} className="font-medium text-indigo-600 hover:underline">
              {row.student_name}
            </Link>
          ),
        },
        { header: "Roll No.", accessor: "roll_number" },
        { header: "Category", accessor: (row) => <span className="capitalize">{row.category}</span> },
        {
          header: "Severity",
          accessor: (row) => <Badge variant={severityVariant(row.severity)}>{row.severity ?? "verbal"}</Badge>,
        },
        {
          header: "Status",
          accessor: (row) =>
            row.status === "reviewed" ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                ✓ Reviewed
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                Pending
              </Badge>
            ),
        },
        { header: "Description", accessor: (row) => <span className="line-clamp-1 max-w-xs">{row.description}</span> },
        { header: "Date", accessor: "date" },
      ]}
      searchKeys={["student_name", "roll_number", "description"]}
      searchPlaceholder="Search by student, roll no, or keyword..."
      filters={[
        ...(categoryOptions.length > 0 ? [{ label: "All Categories", options: categoryOptions, filterFn: (row: DisciplineRow, v: string) => row.category === v }] : []),
        { label: "All Severity", options: severityOptions, filterFn: (row: DisciplineRow, v: string) => (row.severity ?? "verbal") === v },
      ]}
      renderActions={(row) => <RowActions row={row} />}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/teacher/students/${row.student_id}`} className="block truncate font-medium text-indigo-600">
                {row.student_name}
              </Link>
              <p className="text-xs text-muted-foreground">Roll {row.roll_number} · <span className="capitalize">{row.category}</span></p>
            </div>
            <Badge variant={severityVariant(row.severity)}>{row.severity ?? "verbal"}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{row.description}</p>
          <p className="mt-2 text-xs text-muted-foreground/80">{row.date}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={AlertTriangle}
          title="No discipline records yet"
          description="Incidents you log for this section will appear here."
        />
      }
    />
  );
}