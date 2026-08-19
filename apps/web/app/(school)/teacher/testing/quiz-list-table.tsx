"use client";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

export interface QuizRow {
  id: string;
  title: string;
  subject: string;
  mode: string;
  status: string;
  questions: number;
  points: number;
  opensAt: string | null;
  closesAt: string | null;
  submitted: string;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-600",
};

function windowLabel(row: QuizRow): string {
  if (!row.opensAt && !row.closesAt) return "Not scheduled";
  const opens = row.opensAt ? new Date(row.opensAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "now";
  const closes = row.closesAt ? new Date(row.closesAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
  return `${opens} – ${closes}`;
}

function hrefFor(row: QuizRow): string {
  if (row.status === "draft" || row.status === "scheduled") {
    return `/teacher/testing/${row.id}/edit`;
  }
  if (row.mode === "Live" && row.status === "open") {
    return `/teacher/testing/${row.id}/live`;
  }
  return `/teacher/testing/${row.id}/results`;
}

export function QuizListTable({ rows }: { rows: QuizRow[] }) {
  return (
    <ListPageTemplate<QuizRow>
      title="Quizzes"
      description={`${rows.length} quiz${rows.length === 1 ? "" : "zes"} for this section.`}
      data={rows}
      columns={[
        {
          header: "Quiz",
          accessor: (row) => (
            <Link href={hrefFor(row)} className="font-medium text-primary hover:underline">
              {row.title}
            </Link>
          ),
        },
        { header: "Subject", accessor: "subject" },
        { header: "Mode", accessor: "mode" },
        {
          header: "Status",
          accessor: (row) => (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[row.status] ?? "bg-gray-100 text-gray-600"}`}>
              {row.status}
            </span>
          ),
        },
        { header: "Questions", accessor: (row) => `${row.questions} · ${row.points} pts` },
        { header: "Window", accessor: (row) => windowLabel(row) },
        { header: "Submitted", accessor: "submitted" },
      ]}
      searchKeys={["title", "subject"]}
      searchPlaceholder="Search quizzes…"
      renderMobileCard={(row) => (
        <Link href={hrefFor(row)} className="block rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">{row.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.subject} · {row.mode}</p>
              <p className="mt-2 text-xs text-muted-foreground">{row.questions} questions · {row.points} pts · {row.submitted} submitted</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[row.status] ?? "bg-gray-100 text-gray-600"}`}>
              {row.status}
            </span>
          </div>
        </Link>
      )}
      emptyState={
        <EmptyState
          icon={ListChecks}
          title="No quizzes yet"
          description="Create your first quiz above to get started."
        />
      }
    />
  );
}
