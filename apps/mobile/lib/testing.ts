import { supabase } from "./supabase";

export type QuizMode = "async" | "live";
export type QuizStatus = "draft" | "scheduled" | "open" | "closed";
export type AttemptStatus = "in_progress" | "submitted" | "graded";
export type QuestionType = "mcq" | "true_false" | "short_answer";

export interface ParentQuizListItem {
  id: string;
  title: string;
  subject: string;
  mode: QuizMode;
  status: QuizStatus;
  questionCount: number;
  totalPoints: number;
  durationSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  attemptStatus: AttemptStatus | null;
  score: { total: number; max: number; percentage: number } | null;
}

// Quizzes assigned to this child's currently active section. RLS
// (quizzes_select_parent) already scopes visibility to published quizzes
// assigned to a section one of the parent's children is enrolled in — the
// explicit section_id filter here additionally scopes it to THIS child, so
// switching the active child re-queries rather than showing a merged list.
export async function loadQuizzesForChild(studentId: string): Promise<ParentQuizListItem[]> {
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("section_id")
    .eq("student_profile_id", studentId)
    .eq("is_active", true)
    .maybeSingle();
  const sectionId = enrollment?.section_id;
  if (!sectionId) return [];

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, mode, status, opens_at, closes_at, duration_seconds, question_count, total_points, subject:subjects(name)")
    .eq("section_id", sectionId)
    .order("opens_at", { ascending: true, nullsFirst: true });

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const { data: attempts } = quizIds.length > 0
    ? await supabase
        .from("quiz_attempts")
        .select("id, quiz_id, status")
        .eq("student_id", studentId)
        .in("quiz_id", quizIds)
        .order("attempt_number", { ascending: false })
    : { data: [] as { id: string; quiz_id: string; status: AttemptStatus }[] };

  const latestAttemptByQuiz: Record<string, { id: string; status: AttemptStatus }> = {};
  for (const a of attempts ?? []) {
    if (!latestAttemptByQuiz[a.quiz_id]) latestAttemptByQuiz[a.quiz_id] = a as { id: string; status: AttemptStatus };
  }

  const attemptIds = Object.values(latestAttemptByQuiz).map((a) => a.id);
  const { data: results } = attemptIds.length > 0
    ? await supabase.from("quiz_results").select("attempt_id, total_points, max_points, percentage").in("attempt_id", attemptIds)
    : { data: [] as { attempt_id: string; total_points: number; max_points: number; percentage: number }[] };
  const resultByAttempt: Record<string, { total_points: number; max_points: number; percentage: number }> = {};
  for (const r of results ?? []) resultByAttempt[r.attempt_id] = r;

  return (quizzes ?? []).map((q) => {
    const subject = q.subject as unknown as { name: string } | null;
    const attempt = latestAttemptByQuiz[q.id];
    const result = attempt ? resultByAttempt[attempt.id] : undefined;
    return {
      id: q.id,
      title: q.title,
      subject: subject?.name ?? "—",
      mode: q.mode as QuizMode,
      status: q.status as QuizStatus,
      questionCount: q.question_count,
      totalPoints: q.total_points,
      durationSeconds: q.duration_seconds,
      opensAt: q.opens_at,
      closesAt: q.closes_at,
      attemptStatus: attempt?.status ?? null,
      score: result ? { total: result.total_points, max: result.max_points, percentage: result.percentage } : null,
    };
  });
}

export interface QuizDetail {
  id: string;
  title: string;
  instructions: string | null;
  mode: QuizMode;
  status: QuizStatus;
  subject: string;
  questionCount: number;
  totalPoints: number;
  durationSeconds: number;
  opensAt: string | null;
  closesAt: string | null;
  attemptsAllowed: number;
  showAnswersAfterClose: boolean;
}

export async function loadQuizDetail(quizId: string): Promise<QuizDetail | null> {
  const { data } = await supabase
    .from("quizzes")
    .select(
      "id, title, instructions, mode, status, question_count, total_points, duration_seconds, opens_at, closes_at, attempts_allowed, show_answers_after_close, subject:subjects(name)"
    )
    .eq("id", quizId)
    .maybeSingle();
  if (!data) return null;
  const subject = data.subject as unknown as { name: string } | null;
  return {
    id: data.id,
    title: data.title,
    instructions: data.instructions,
    mode: data.mode as QuizMode,
    status: data.status as QuizStatus,
    subject: subject?.name ?? "—",
    questionCount: data.question_count,
    totalPoints: data.total_points,
    durationSeconds: data.duration_seconds,
    opensAt: data.opens_at,
    closesAt: data.closes_at,
    attemptsAllowed: data.attempts_allowed,
    showAnswersAfterClose: data.show_answers_after_close,
  };
}

// Latest attempt for this (quiz, student), if any — used to decide whether
// "Take quiz" should resume, show a result, offer a retake, or start fresh.
export async function loadExistingAttempt(
  quizId: string,
  studentId: string
): Promise<{ id: string; status: AttemptStatus; attemptNumber: number } | null> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("id, status, attempt_number")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, status: data.status as AttemptStatus, attemptNumber: data.attempt_number } : null;
}

export async function startAttempt(quizId: string, studentId: string): Promise<{ attemptId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc("start_quiz_attempt", { p_quiz_id: quizId, p_student_id: studentId });
  return { attemptId: (data as string) ?? null, error: error?.message ?? null };
}

export interface AttemptTiming {
  startedAt: string;
  durationSeconds: number;
  closesAt: string | null;
  status: AttemptStatus;
}

export async function loadAttemptTiming(attemptId: string): Promise<AttemptTiming | null> {
  const { data } = await supabase
    .from("quiz_attempts")
    .select("started_at, status, quiz:quizzes(duration_seconds, closes_at)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!data) return null;
  const quiz = data.quiz as unknown as { duration_seconds: number; closes_at: string | null };
  return {
    startedAt: data.started_at,
    durationSeconds: quiz.duration_seconds,
    closesAt: quiz.closes_at,
    status: data.status as AttemptStatus,
  };
}

export interface AttemptOption {
  id: string;
  text: string;
}
export interface AttemptQuestion {
  questionId: string;
  prompt: string;
  type: QuestionType;
  points: number;
  orderIndex: number;
  options: AttemptOption[];
}

// Question/option TEXT only — is_correct is never returned here (see
// get_quiz_for_attempt in the DB: it strips correctness server-side).
export async function loadAttemptQuestions(attemptId: string): Promise<AttemptQuestion[]> {
  const { data } = await supabase.rpc("get_quiz_for_attempt", { p_attempt_id: attemptId });
  const rows = (data ?? []) as {
    question_id: string; prompt: string; type: QuestionType; points: number; order_index: number;
    option_id: string | null; option_text: string | null; option_order: number | null;
  }[];
  const map = new Map<string, AttemptQuestion>();
  for (const row of rows) {
    if (!map.has(row.question_id)) {
      map.set(row.question_id, {
        questionId: row.question_id, prompt: row.prompt, type: row.type,
        points: row.points, orderIndex: row.order_index, options: [],
      });
    }
    if (row.option_id) {
      map.get(row.question_id)!.options.push({ id: row.option_id, text: row.option_text ?? "" });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function saveAnswer(
  attemptId: string, questionId: string, selectedOptionId: string | null, shortText: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("save_quiz_answer", {
    p_attempt_id: attemptId, p_question_id: questionId,
    p_selected_option_id: selectedOptionId, p_short_text: shortText,
  });
  return { error: error?.message ?? null };
}

export async function submitAttempt(attemptId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("submit_quiz_attempt", { p_attempt_id: attemptId });
  return { error: error?.message ?? null };
}

export interface QuizResultData {
  attemptId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  startedAt: string;
  totalPoints: number;
  maxPoints: number;
  percentage: number;
  passed: boolean | null;
  fullyGraded: boolean;
  showAnswersAfterClose: boolean;
  attemptNumber: number;
  attemptsAllowed: number;
  quizStatus: QuizStatus;
}

export async function loadResult(quizId: string, studentId: string): Promise<QuizResultData | null> {
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, status, started_at, submitted_at, attempt_number")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt) return null;

  const [{ data: result }, { data: quiz }] = await Promise.all([
    supabase.from("quiz_results").select("total_points, max_points, percentage, passed, fully_graded").eq("attempt_id", attempt.id).maybeSingle(),
    supabase.from("quizzes").select("show_answers_after_close, attempts_allowed, status").eq("id", quizId).maybeSingle(),
  ]);

  return {
    attemptId: attempt.id,
    status: attempt.status as AttemptStatus,
    submittedAt: attempt.submitted_at,
    startedAt: attempt.started_at,
    totalPoints: result?.total_points ?? 0,
    maxPoints: result?.max_points ?? 0,
    percentage: result?.percentage ?? 0,
    passed: result?.passed ?? null,
    fullyGraded: result?.fully_graded ?? false,
    showAnswersAfterClose: quiz?.show_answers_after_close ?? false,
    attemptNumber: attempt.attempt_number,
    attemptsAllowed: quiz?.attempts_allowed ?? 1,
    quizStatus: (quiz?.status as QuizStatus) ?? "closed",
  };
}

export interface ReviewQuestion {
  questionId: string;
  prompt: string;
  points: number;
  selectedText: string | null;
  isCorrect: boolean | null;
  pointsAwarded: number | null;
  correctText: string | null;
}

// Only returns data once graded AND the teacher enabled review — the RPC
// raises otherwise, which we treat as "no review available" here.
export async function loadReview(attemptId: string): Promise<ReviewQuestion[] | null> {
  const { data, error } = await supabase.rpc("get_quiz_review", { p_attempt_id: attemptId });
  if (error) return null;
  return (data ?? []).map((r: any) => ({
    questionId: r.question_id, prompt: r.prompt, points: r.points,
    selectedText: r.selected_text, isCorrect: r.is_correct,
    pointsAwarded: r.points_awarded, correctText: r.correct_text,
  }));
}

// ── Live Quiz — waiting room, blocker reports, host-paced attempt ─────────

export type LiveStatus = "not_started" | "in_progress" | "ended";
export type ParticipantStatus = "joined" | "excluded";
export type BlockerReason = "technical" | "connectivity" | "device" | "not_available" | "other";
export type BlockerStatus = "open" | "acknowledged" | "resolved";

export interface LiveQuizState {
  liveStatus: LiveStatus | null;
  currentQuestionIndex: number | null;
  questionStartedAt: string | null;
  lateJoinAllowed: boolean;
}

export async function loadLiveQuizState(quizId: string): Promise<LiveQuizState | null> {
  const { data } = await supabase
    .from("quizzes")
    .select("live_status, live_current_question_index, live_question_started_at, live_late_join_allowed")
    .eq("id", quizId)
    .maybeSingle();
  if (!data) return null;
  return {
    liveStatus: data.live_status as LiveStatus | null,
    currentQuestionIndex: data.live_current_question_index,
    questionStartedAt: data.live_question_started_at,
    lateJoinAllowed: data.live_late_join_allowed,
  };
}

export async function loadMyParticipantStatus(quizId: string, studentId: string): Promise<ParticipantStatus | null> {
  const { data } = await supabase
    .from("quiz_live_participants")
    .select("status")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();
  return (data?.status as ParticipantStatus | undefined) ?? null;
}

export interface MyBlockerReport {
  id: string;
  reason: BlockerReason;
  status: BlockerStatus;
  reportedAt: string;
}

// Latest report this student has filed for this quiz, if any — drives the
// waiting room's status banner (open -> acknowledged), kept live via a
// Realtime subscription in the waiting-room screen rather than polling.
export async function loadMyBlockerReport(quizId: string, studentId: string): Promise<MyBlockerReport | null> {
  const { data } = await supabase
    .from("quiz_blocker_reports")
    .select("id, reason, status, reported_at")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .order("reported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    reason: data.reason as BlockerReason,
    status: data.status as BlockerStatus,
    reportedAt: data.reported_at,
  };
}

export async function joinLiveQuiz(quizId: string, studentId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("join_live_quiz", { p_quiz_id: quizId, p_student_id: studentId });
  return { error: error?.message ?? null };
}

export async function reportQuizBlocker(
  quizId: string, studentId: string, reason: BlockerReason, message: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("report_quiz_blocker", {
    p_quiz_id: quizId, p_student_id: studentId, p_reason: reason, p_message: message,
  });
  return { error: error?.message ?? null };
}

export interface LiveQuestion {
  questionId: string;
  prompt: string;
  type: QuestionType;
  points: number;
  orderIndex: number;
  timeLimitSeconds: number;
  questionStartedAt: string;
  options: AttemptOption[];
}

// Question/option TEXT only, same contract as get_quiz_for_attempt — the
// server never returns is_correct here.
export async function loadLiveCurrentQuestion(quizId: string, studentId: string): Promise<LiveQuestion | null> {
  const { data, error } = await supabase.rpc("get_live_current_question", { p_quiz_id: quizId, p_student_id: studentId });
  if (error || !data || data.length === 0) return null;
  const rows = data as {
    question_id: string; prompt: string; type: QuestionType; points: number; order_index: number;
    time_limit_seconds: number; question_started_at: string;
    option_id: string | null; option_text: string | null; option_order: number | null;
  }[];
  const first = rows[0];
  return {
    questionId: first.question_id,
    prompt: first.prompt,
    type: first.type,
    points: first.points,
    orderIndex: first.order_index,
    timeLimitSeconds: first.time_limit_seconds,
    questionStartedAt: first.question_started_at,
    options: rows.filter((r) => r.option_id).map((r) => ({ id: r.option_id!, text: r.option_text ?? "" })),
  };
}
