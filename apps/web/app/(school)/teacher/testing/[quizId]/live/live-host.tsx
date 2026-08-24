"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, BellRing, RefreshCw, Radio, ShieldCheck, Square } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useLiveQuestionTimer } from "./use-live-question-timer";
import { ParticipantPanel, type Participant } from "./participant-panel";
import { BlockerPanel, type BlockerReport } from "./blocker-panel";
import { LiveSummary } from "./live-summary";
import { notifyLiveQuizReminder, notifyLiveQuizResultsReady } from "./notify";

interface LiveOption {
  id: string;
  option_text: string;
  is_correct: boolean;
  order_index: number;
}
interface LiveQuestion {
  id: string;
  prompt: string;
  points: number;
  order_index: number;
  time_limit_seconds: number | null;
  options: LiveOption[];
}
interface LiveQuiz {
  id: string;
  title: string;
  section_id: string;
  live_status: "not_started" | "in_progress" | "ended" | null;
  live_current_question_index: number | null;
  live_question_started_at: string | null;
  live_late_join_allowed: boolean;
}

// A "time_not_elapsed" rejection means our clock ran ahead of the server's —
// advance_live_question is the actual authority, so we just wait and retry
// rather than treating it as a real error.
const TIME_NOT_ELAPSED_RETRY_MS = 750;
const TIME_NOT_ELAPSED_MAX_RETRIES = 6;

export function LiveHost({
  quiz, sectionLabel, questions, initialParticipants, initialBlockers,
}: {
  quiz: LiveQuiz; sectionLabel: string; questions: LiveQuestion[];
  initialParticipants: Participant[]; initialBlockers: BlockerReport[];
}) {
  const [liveStatus, setLiveStatus] = useState(quiz.live_status);
  const [currentIndex, setCurrentIndex] = useState(quiz.live_current_question_index);
  const [questionStartedAt, setQuestionStartedAt] = useState(quiz.live_question_started_at);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  // Fires the results-ready notification exactly once, only on a genuine
  // not-ended -> ended transition observed while this screen is open — never
  // on mount (so revisiting an already-ended session doesn't re-notify).
  const prevLiveStatusRef = useRef(liveStatus);
  const resultsNotifiedRef = useRef(false);
  useEffect(() => {
    const prev = prevLiveStatusRef.current;
    prevLiveStatusRef.current = liveStatus;
    if (prev !== "ended" && liveStatus === "ended" && !resultsNotifiedRef.current) {
      resultsNotifiedRef.current = true;
      notifyLiveQuizResultsReady(quiz.id).then((result) => {
        if (!result.ok) console.error("results_ready notification failed:", result.error);
      });
    }
  }, [liveStatus, quiz.id]);

  const missingTimeLimits = questions.filter((q) => q.time_limit_seconds == null);
  const currentQuestion = currentIndex != null ? questions.find((q) => q.order_index === currentIndex) ?? null : null;
  const questionNumber = currentQuestion ? questions.findIndex((q) => q.id === currentQuestion.id) + 1 : 0;
  const isLastQuestion = questionNumber > 0 && questionNumber >= questions.length;

  // Belt-and-suspenders alongside the refetch-after-own-action calls below:
  // this also picks up state changes from OTHER sources — another tab, or
  // the cron safety net ending a stalled session while this one sits idle.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-quiz-state-${quiz.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "quizzes", filter: `id=eq.${quiz.id}` },
        (payload) => {
          const row = payload.new as {
            live_status: LiveQuiz["live_status"];
            live_current_question_index: number | null;
            live_question_started_at: string | null;
          };
          setLiveStatus(row.live_status);
          setCurrentIndex(row.live_current_question_index);
          setQuestionStartedAt(row.live_question_started_at);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [quiz.id]);

  async function refetchLiveState() {
    const supabase = createClient();
    const { data } = await supabase
      .from("quizzes")
      .select("live_status, live_current_question_index, live_question_started_at")
      .eq("id", quiz.id)
      .single();
    if (data) {
      setLiveStatus(data.live_status);
      setCurrentIndex(data.live_current_question_index);
      setQuestionStartedAt(data.live_question_started_at);
    }
  }

  async function handleSendReminder() {
    setSendingReminder(true);
    const result = await notifyLiveQuizReminder(quiz.id);
    setSendingReminder(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not send the reminder.");
      return;
    }
    setReminderSent(true);
    toast.success(
      result.notified != null ? `Reminder sent to ${result.notified} parent${result.notified === 1 ? "" : "s"}.` : "Reminder sent."
    );
  }

  async function handleStart() {
    setStarting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("start_live_quiz", { p_quiz_id: quiz.id });
    setStarting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refetchLiveState();
  }

  async function callAdvance(attempt = 0) {
    const supabase = createClient();
    const { error } = await supabase.rpc("advance_live_question", { p_quiz_id: quiz.id });
    if (!error) {
      await refetchLiveState();
      return;
    }
    if (error.message === "time_not_elapsed" && attempt < TIME_NOT_ELAPSED_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, TIME_NOT_ELAPSED_RETRY_MS));
      await callAdvance(attempt + 1);
      return;
    }
    if (error.message === "not_in_progress") {
      // Session already ended elsewhere — another tab, or the cron safety
      // net after a disconnect. Resync instead of surfacing an error.
      await refetchLiveState();
      return;
    }
    toast.error(error.message);
  }

  async function handleAdvance() {
    if (advancing) return;
    setAdvancing(true);
    await callAdvance();
    setAdvancing(false);
  }

  async function handleEnd() {
    if (!window.confirm("End the live quiz now? Everyone still answering will be submitted as-is.")) return;
    setEnding(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("end_live_quiz", { p_quiz_id: quiz.id });
    setEnding(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refetchLiveState();
  }

  const { secondsRemaining } = useLiveQuestionTimer({
    questionStartedAt,
    timeLimitSeconds: currentQuestion?.time_limit_seconds ?? null,
    active: liveStatus === "in_progress" && currentQuestion !== null,
    onExpire: handleAdvance,
  });

  const timeUp = secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4 animate-fade-in-up">
      <Link
        href={`/teacher/testing/${quiz.id}/edit`}
        className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to quiz
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{quiz.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{sectionLabel} · Live session</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {(liveStatus === "not_started" || liveStatus === null) && (
            <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-foreground">
                <Radio className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Students already in the waiting room move to question 1 the moment you start.</p>
              </div>
              {missingTimeLimits.length > 0 && (
                <p className="text-sm text-red-600">
                  {missingTimeLimits.length} question{missingTimeLimits.length === 1 ? "" : "s"} still need a time limit —
                  set it on the Questions tab before starting.
                </p>
              )}
              {questions.length === 0 && <p className="text-sm text-muted-foreground">Add at least one question first.</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleStart} disabled={starting || missingTimeLimits.length > 0 || questions.length === 0}>
                  {starting ? "Starting…" : "Start live quiz"}
                </Button>
                <Button variant="outline" onClick={handleSendReminder} disabled={sendingReminder}>
                  <BellRing className="h-3.5 w-3.5" />
                  {sendingReminder ? "Sending…" : reminderSent ? "Send reminder again" : "Send reminder"}
                </Button>
              </div>
            </div>
          )}

          {liveStatus === "in_progress" && currentQuestion && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Question {questionNumber} of {questions.length}
                  </p>
                  <p className="text-xs text-muted-foreground">{currentQuestion.points} points</p>
                </div>
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full border-4 text-lg font-bold tabular-nums ${
                    timeUp ? "border-red-400 text-red-600" : "border-primary/30 text-foreground"
                  }`}
                >
                  {secondsRemaining ?? "—"}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  Only visible to you — students never see which option is correct.
                </div>
                <p className="mb-3 text-sm font-medium text-foreground">{currentQuestion.prompt}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentQuestion.options.map((o, i) => (
                    <div
                      key={o.id}
                      className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
                        o.is_correct ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-border"
                      }`}
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {o.option_text}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleAdvance} disabled={advancing || !timeUp}>
                    {advancing ? "Advancing…" : isLastQuestion ? "Finish quiz now" : "Advance now"}
                  </Button>
                  <Button variant="destructive" onClick={handleEnd} disabled={ending}>
                    <Square className="h-3.5 w-3.5" />
                    {ending ? "Ending…" : "End quiz now"}
                  </Button>
                </div>
                {!timeUp && (
                  <p className="text-xs text-muted-foreground">
                    Advances automatically when time's up — this button becomes a manual fallback then.
                  </p>
                )}
              </div>
            </div>
          )}

          {liveStatus === "in_progress" && !currentQuestion && (
            <div className="space-y-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">Syncing session state…</p>
              <Button variant="outline" onClick={refetchLiveState}>
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          )}

          {liveStatus === "ended" && <LiveSummary quizId={quiz.id} sectionId={quiz.section_id} />}
        </div>

        <div className="space-y-4">
          <ParticipantPanel quizId={quiz.id} initialParticipants={initialParticipants} lateJoinAllowed={quiz.live_late_join_allowed} />
          <BlockerPanel quizId={quiz.id} initialBlockers={initialBlockers} />
        </div>
      </div>
    </div>
  );
}
