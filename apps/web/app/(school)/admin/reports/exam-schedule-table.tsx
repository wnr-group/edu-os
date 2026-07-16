"use client";

import { CalendarClock } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

export interface ExamScheduleRow {
  id: string;
  name: string;
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
        { header: "Exam Name", accessor: "name" },
        { header: "Academic Year", accessor: "academic_year" },
        { header: "Start Date", accessor: "start_date" },
        { header: "End Date", accessor: "end_date" },
      ]}
      searchKeys={["name", "academic_year"]}
      searchPlaceholder="Search exams..."
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="font-medium text-foreground">{row.name}</p>
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