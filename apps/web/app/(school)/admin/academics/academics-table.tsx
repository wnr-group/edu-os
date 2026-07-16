"use client";
import { Calendar } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

interface YearRow {
  id: string;
  name: string;
  start: string;
  end: string;
  status: "draft" | "active" | "archived";
}

interface ExamRow {
  id: string;
  name: string;
  academic_year: string;
  start: string;
  end: string;
}

function StatusBadge({ status }: { status: YearRow["status"] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
      status === "active"
        ? "bg-emerald-100 text-emerald-700"
        : status === "draft"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-500"
    }`}>
      {status}
    </span>
  );
}

export function AcademicYearsTable({
  yearRows,
  schoolId,
  headerAction,
  stats,
}: {
  yearRows: YearRow[];
  schoolId: string;
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  void schoolId;
  return (
    <ListPageTemplate<YearRow>
      title="Academic Years"
      description="Manage academic years for your school."
      headerAction={headerAction}
      stats={stats}
      data={yearRows}
      columns={[
        { header: "Name", accessor: "name" },
        { header: "Start", accessor: "start" },
        { header: "End", accessor: "end" },
        { header: "Status", accessor: (row) => <StatusBadge status={row.status} /> },
      ]}
      searchKeys={["name"]}
      searchPlaceholder="Search academic years…"
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.name}</p>
              <p className="text-xs text-muted-foreground">{row.start} – {row.end}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Calendar}
          title="No academic years yet"
          description="Add your first academic year to get started."
        />
      }
    />
  );
}

export function ExamsTable({
  examRows,
  headerAction,
}: {
  examRows: ExamRow[];
  headerAction?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<ExamRow>
      title="Exams"
      description="Track all exams across academic years."
      headerAction={headerAction}
      data={examRows}
      columns={[
        { header: "Exam Name", accessor: "name" },
        { header: "Academic Year", accessor: "academic_year" },
        { header: "Start", accessor: "start" },
        { header: "End", accessor: "end" },
      ]}
      searchKeys={["name"]}
      searchPlaceholder="Search exams…"
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="font-medium text-foreground">{row.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.academic_year}</p>
          <p className="mt-2 text-xs text-muted-foreground">{row.start} – {row.end}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Calendar}
          title="No exams yet"
          description="Add your first exam to get started."
        />
      }
    />
  );
}