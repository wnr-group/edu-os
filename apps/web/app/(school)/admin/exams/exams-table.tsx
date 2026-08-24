"use client";
import Link from "next/link";
import { Calendar, CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

interface ExamRow {
  id: string;
  name: string;
  isQuiz?: boolean;
  academic_year: string;
  start: string;
  end: string;
  published: boolean;
}

export function ExamsTable({
  examRows,
  headerAction,
  stats,
}: {
  examRows: ExamRow[];
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<ExamRow>
      title="Exams"
      description="Track all exams across academic years."
      headerAction={headerAction}
      stats={stats}
      data={examRows}
      columns={[
        {
          header: "Exam Name",
          accessor: (row) => (
            <span className="inline-flex items-center gap-2">
              {row.name}
              <Badge variant={row.isQuiz ? "outline" : "secondary"}>{row.isQuiz ? "Quiz" : "Exam"}</Badge>
            </span>
          ),
        },
        { header: "Academic Year", accessor: "academic_year" },
        { header: "Start", accessor: "start" },
        { header: "End", accessor: "end" },
        {
          header: "Datesheet",
          accessor: (row) =>
            row.isQuiz ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Pushed Quiz</span>
            ) : row.published ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Published</span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Draft</span>
            ),
        },
        {
          header: "",
          accessor: (row) =>
            row.isQuiz ? null : (
              <Link
                href={`/admin/exams/${row.id}/schedule`}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                <CalendarClock className="h-3.5 w-3.5" />
                Schedule
              </Link>
            ),
        },
      ]}
      searchKeys={["name"]}
      searchPlaceholder="Search exams…"
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">{row.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.academic_year}</p>
              <p className="mt-2 text-xs text-muted-foreground">{row.start} – {row.end}</p>
            </div>
            {!row.isQuiz && (
              <Link href={`/admin/exams/${row.id}/schedule`} className="text-xs font-semibold text-indigo-600">
                Schedule →
              </Link>
            )}
          </div>
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