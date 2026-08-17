"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Radio, Send, ShieldCheck, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { QuizDetail, QuizQuestion } from "./types";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  open: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-100 text-gray-600",
};

export function PreviewPublishTab({ quiz, questions }: { quiz: QuizDetail; questions: QuizQuestion[] }) {
  const router = useRouter();
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handlePublish() {
    setPublishing(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("publish_quiz", { p_quiz_id: quiz.id });
    setPublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Quiz published.");
    router.refresh();
  }

  async function handleCancel() {
    if (!window.confirm("Cancel this quiz? Students will no longer be able to start or continue it.")) return;
    setCancelling(true);
    const supabase = createClient();
    // Cancelling reuses close_quiz — there's no separate "cancelled" state;
    // closing early (before its window naturally ends) is exactly what
    // withdrawing an already-published quiz means here.
    const { error } = await supabase.rpc("close_quiz", { p_quiz_id: quiz.id });
    setCancelling(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Quiz cancelled.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          This is exactly what a student sees. Correct answers are never sent to a student&rsquo;s device before they
          submit — only you, as the quiz owner, can see which option is marked correct.
        </p>
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add at least one question before publishing.</p>
      ) : (
        <div className="max-w-lg space-y-4">
          {questions.map((q, qi) => (
            <div key={q.id} className="rounded-lg border border-border">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold text-foreground">Question {qi + 1} of {questions.length}</p>
                <p className="text-xs text-muted-foreground">{q.points} points</p>
              </div>
              <div className="p-4">
                <p className="mb-3 text-sm font-medium text-foreground">{q.prompt}</p>
                {q.type === "short_answer" ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Student types a free-text answer here.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {q.options.map((o, i) => (
                      <div key={o.id} className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {o.option_text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${STATUS_STYLE[quiz.status]}`}>
          {quiz.status === "draft" ? "Draft · not visible to students" : quiz.status}
        </span>
        <div className="flex-1" />
        {quiz.status === "draft" && (
          <Button onClick={handlePublish} disabled={publishing || questions.length === 0}>
            <Send className="h-3.5 w-3.5" />
            {publishing ? "Publishing…" : "Publish quiz"}
          </Button>
        )}
        {quiz.mode === "live" && (quiz.status === "open" || quiz.status === "scheduled") && (
          <Link href={`/teacher/testing/${quiz.id}/live`} className={cn(buttonVariants({ variant: "default" }))}>
            <Radio className="h-3.5 w-3.5" />
            Host live quiz
          </Link>
        )}
        {(quiz.status === "open" || quiz.status === "scheduled") && (
          <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
            <XCircle className="h-3.5 w-3.5" />
            {cancelling ? "Cancelling…" : "Cancel quiz"}
          </Button>
        )}
      </div>
    </div>
  );
}
