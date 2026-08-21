import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { QuizBuilder } from "./quiz-builder";

export default async function QuizEditPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.testing !== true) return <ModuleUnavailable module="Testing" />;

  const supabase = await createServerSupabaseClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select(
      "id, title, instructions, mode, status, subject_id, class_id, section_id, opens_at, closes_at, duration_seconds, attempts_allowed, shuffle_questions, pass_mark_pct, show_answers_after_close, question_count, total_points, pushed_to_gradebook_at, section:sections(name, class:classes(name))"
    )
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz) notFound();

  const [{ data: questions }, { data: subjects }, { count: studentCount }] = await Promise.all([
    supabase
      .from("quiz_questions")
      .select("id, type, prompt, points, order_index, short_answer_rubric, time_limit_seconds, options:quiz_options(id, option_text, is_correct, order_index)")
      .eq("quiz_id", quizId)
      .order("order_index"),
    supabase.from("subjects").select("id, name").eq("class_id", quiz.class_id).order("name"),
    supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("section_id", quiz.section_id)
      .eq("is_active", true),
  ]);

  const section = quiz.section as unknown as { name: string; class: { name: string } | null } | null;
  const sectionLabel = section ? `${section.class?.name ?? ""} – Section ${section.name}` : "";

  return (
    <QuizBuilder
      quiz={quiz}
      schoolId={schoolId}
      questions={(questions ?? []).map((q) => ({
        ...q,
        options: (q.options ?? []).sort((a, b) => a.order_index - b.order_index),
      }))}
      subjects={subjects ?? []}
      sectionLabel={sectionLabel}
      studentCount={studentCount ?? 0}
    />
  );
}
