"use client";

import { CalendarClock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

export interface ExamScheduleRow {
  id: string;
  name: string;
  isQuiz?: boolean;
  academic_year: string;
  start_date: string;
  end_date: string;
}

export function ExamScheduleTable({ rows }: { rows: ExamScheduleRow[] }) {
  return (
    <ListPageTemplate<ExamScheduleRow>
      title="Exam Schedule"
      data={rows}
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
        { header: "Start Date", accessor: "start_date" },
        { header: "End Date", accessor: "end_date" },
      ]}
      searchKeys={["name", "academic_year"]}
      searchPlaceholder="Search exams..."
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{row.name}</p>
            <Badge variant={row.isQuiz ? "outline" : "secondary"}>{row.isQuiz ? "Quiz" : "Exam"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.academic_year}</p>
          <p className="mt-2 text-xs text-muted-foreground">{row.start_date} – {row.end_date}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={CalendarClock}
          title="No exams scheduled yet"
          description="Exams created in Academics will appear here."
        />
      }
    />
  );
}