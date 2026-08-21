import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { LiveHost } from "./live-host";

export default async function QuizLivePage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.testing !== true) return <ModuleUnavailable module="Testing" />;

  const supabase = await createServerSupabaseClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select(
      "id, title, mode, status, section_id, live_status, live_current_question_index, live_question_started_at, live_late_join_allowed, section:sections(name, class:classes(name))"
    )
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) notFound();
  if (quiz.mode !== "live" || quiz.status === "draft") redirect(`/teacher/testing/${quizId}/edit`);
  // A quiz closed by any path other than a completed live session (e.g. the
  // generic "Cancel quiz" button) has nothing left to host here.
  if (quiz.status === "closed" && quiz.live_status !== "ended") redirect(`/teacher/testing/${quizId}/results`);

  const [{ data: questions }, { data: participants }, { data: blockers }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, prompt, points, order_index, time_limit_seconds, options:quiz_options(id, option_text, is_correct, order_index)")
      .eq("quiz_id", quizId)
      .order("order_index"),
    supabase
      .from("quiz_live_participants")
      .select("id, student_id, status, joined_at, student:student_profiles(full_name)")
      .eq("quiz_id", quizId)
      .order("joined_at"),
    supabase
      .from("quiz_blocker_reports")
      .select("id, student_id, reason, message, status, reported_at, student:student_profiles(full_name)")
      .eq("quiz_id", quizId)
      .order("reported_at", { ascending: false }),
  ]);

  const section = quiz.section as unknown as { name: string; class: { name: string } | null } | null;
  const sectionLabel = section ? `${section.class?.name ?? ""} – Section ${section.name}` : "";

  return (
    <LiveHost
      quiz={quiz}
      sectionLabel={sectionLabel}
      questions={(questions ?? []).map((q) => ({
        ...q,
        options: (q.options ?? []).sort((a, b) => a.order_index - b.order_index),
      }))}
      initialParticipants={(participants ?? []).map((p) => ({
        id: p.id,
        student_id: p.student_id,
        status: p.status,
        joined_at: p.joined_at,
        name: (p.student as unknown as { full_name: string | null } | null)?.full_name ?? "—",
      }))}
      initialBlockers={(blockers ?? []).map((b) => ({
        id: b.id,
        student_id: b.student_id,
        reason: b.reason,
        message: b.message,
        status: b.status,
        reported_at: b.reported_at,
        name: (b.student as unknown as { full_name: string | null } | null)?.full_name ?? "—",
      }))}
    />
  );
}
