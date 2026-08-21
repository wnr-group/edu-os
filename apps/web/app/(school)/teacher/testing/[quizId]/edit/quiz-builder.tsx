"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { QuizDetail, QuizQuestion, SubjectOption } from "./types";
import { DetailsTab } from "./details-tab";
import { QuestionsTab } from "./questions-tab";
import { AvailabilityTab } from "./availability-tab";
import { AssignTab } from "./assign-tab";
import { PreviewPublishTab } from "./preview-publish-tab";

const TABS = [
  { key: "details", label: "Details" },
  { key: "questions", label: "Questions" },
  { key: "availability", label: "Availability & Scoring" },
  { key: "assign", label: "Assign" },
  { key: "preview", label: "Preview & Publish" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-600",
};

export function QuizBuilder({
  quiz,
  schoolId,
  questions,
  subjects,
  sectionLabel,
  studentCount,
}: {
  quiz: QuizDetail;
  schoolId: string;
  questions: QuizQuestion[];
  subjects: SubjectOption[];
  sectionLabel: string;
  studentCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("details");
  const locked = quiz.status !== "draft";

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Link
        href="/teacher/testing"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Testing
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{quiz.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sectionLabel}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLE[quiz.status] ?? "bg-gray-100 text-gray-600"}`}>
          {quiz.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === t.key ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "questions" && (
              <span className="ml-1.5 rounded-full bg-muted-foreground/10 px-1.5 text-xs">{questions.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {tab === "details" && <DetailsTab quiz={quiz} subjects={subjects} />}
        {tab === "questions" && <QuestionsTab quizId={quiz.id} schoolId={schoolId} questions={questions} locked={locked} mode={quiz.mode} />}
        {tab === "availability" && <AvailabilityTab quiz={quiz} />}
        {tab === "assign" && <AssignTab sectionLabel={sectionLabel} studentCount={studentCount} />}
        {tab === "preview" && <PreviewPublishTab quiz={quiz} questions={questions} />}
      </div>
    </div>
  );
}
