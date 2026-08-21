import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X, Clock } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GradeAnswerForm } from "./grade-answer-form";

export default async function StudentResultPage({
  params,
}: {
  params: Promise<{ quizId: string; studentId: string }>;
}) {
  const { quizId, studentId } = await params;
  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.testing !== true) return <ModuleUnavailable module="Testing" />;

  const supabase = await createServerSupabaseClient();

  const { data: quiz } = await supabase.from("quizzes").select("id, title").eq("id", quizId).maybeSingle();
  if (!quiz) notFound();

  const { data: student } = await supabase.from("student_profiles").select("id, full_name").eq("id", studentId).maybeSingle();
  if (!student) notFound();

  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, status, started_at, submitted_at")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const backLink = (
    <Link href={`/teacher/testing/${quizId}/results`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
      <ArrowLeft className="mr-1.5 h-4 w-4" />
      Back to results
    </Link>
  );

  if (!attempt) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        {backLink}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{student.full_name ?? "Student"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{quiz.title}</p>
        </div>
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          This student hasn&rsquo;t started the quiz yet.
        </div>
      </div>
    );
  }

  const { data: result } = await supabase
    .from("quiz_results")
    .select("total_points, max_points, percentage, passed, fully_graded")
    .eq("attempt_id", attempt.id)
    .maybeSingle();

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, prompt, type, points, order_index, options:quiz_options(id, option_text, is_correct)")
    .eq("quiz_id", quizId)
    .order("order_index");

  interface AnswerRow {
    id: string;
    question_id: string;
    selected_option_id: string | null;
    short_answer_text: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
    grading_status: string;
  }
  const { data: answers } = await supabase
    .from("quiz_answers")
    .select("id, question_id, selected_option_id, short_answer_text, is_correct, points_awarded, grading_status")
    .eq("attempt_id", attempt.id);
  const answerByQuestion: Record<string, AnswerRow> = {};
  for (const a of (answers ?? []) as AnswerRow[]) answerByQuestion[a.question_id] = a;

  const timeTaken = attempt.submitted_at
    ? `${Math.round((new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 60000)}m`
    : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{student.full_name ?? "Student"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {quiz.title}
            {attempt.submitted_at && ` · submitted ${new Date(attempt.submitted_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}
            {timeTaken && ` · took ${timeTaken}`}
          </p>
        </div>
        {result && !result.fully_graded && (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">Grading in progress</span>
        )}
      </div>

      {result && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Score</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {result.total_points} / {result.max_points}
            </p>
            <p className="text-xs text-muted-foreground">{result.percentage}%</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1 text-xl font-bold text-foreground">{result.fully_graded ? "Graded" : "Pending"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Result</p>
            <p className="mt-1 text-xl font-bold text-foreground">
              {result.passed === null ? "—" : result.passed ? "Passed" : "Not passed"}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {(questions ?? []).map((q, i) => {
          const opts = (q.options ?? []) as { id: string; option_text: string; is_correct: boolean }[];
          const correctOpt = opts.find((o) => o.is_correct);
          const ans = answerByQuestion[q.id];
          const selectedOpt = ans?.selected_option_id ? opts.find((o) => o.id === ans.selected_option_id) : null;
          const pending = ans?.grading_status === "pending_manual_grade";
          const icon = pending ? (
            <Clock className="h-4 w-4" />
          ) : ans?.is_correct ? (
            <Check className="h-4 w-4" />
          ) : (
            <X className="h-4 w-4" />
          );
          const iconStyle = pending ? "bg-amber-100 text-amber-700" : ans?.is_correct ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700";

          return (
            <div key={q.id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconStyle}`}>{icon}</span>
                <p className="flex-1 text-sm font-medium text-foreground">
                  {i + 1}. {q.prompt}
                </p>
                <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                  {ans?.points_awarded ?? "—"} / {q.points}
                </span>
              </div>
              <div className="mt-2 pl-9 text-xs text-muted-foreground">
                {q.type === "short_answer" ? (
                  ans?.short_answer_text ? (
                    <p className="italic">&ldquo;{ans.short_answer_text}&rdquo;</p>
                  ) : (
                    <p>No answer submitted.</p>
                  )
                ) : (
                  <p>
                    Answered <span className={ans?.is_correct ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{selectedOpt?.option_text ?? "—"}</span>
                    {!ans?.is_correct && correctOpt && (
                      <>
                        {" "}
                        · correct answer was <span className="font-semibold text-emerald-700">{correctOpt.option_text}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
              {pending && ans && <GradeAnswerForm answerId={ans.id} maxPoints={q.points} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
