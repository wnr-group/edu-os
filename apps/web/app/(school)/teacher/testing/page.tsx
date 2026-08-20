import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { getAcademicYearId } from "@/lib/academic-year";
import { NoSectionPrompt } from "../no-section-prompt";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { CreateQuizForm } from "./create-quiz-form";
import { QuizListTable, type QuizRow } from "./quiz-list-table";

export default async function TestingPage() {
  const sectionId = await getActiveSection();
  if (!sectionId) return <NoSectionPrompt />;

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.testing !== true) return <ModuleUnavailable module="Testing" />;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const yearId = await getAcademicYearId(schoolId);

  // A teacher's own taught sections (section_assignments homeroom OR
  // timetable, active year only) — the base candidate list for the
  // class/section/subject pickers.
  const [{ data: homeroomRows }, { data: timetableRows }] = await Promise.all([
    supabase
      .from("section_assignments")
      .select("section_id")
      .eq("class_teacher_id", user!.id)
      .eq("academic_year_id", yearId ?? ""),
    supabase
      .from("timetable")
      .select("section_id")
      .eq("teacher_id", user!.id)
      .eq("academic_year_id", yearId ?? ""),
  ]);
  // Union in the *active* section itself. A school_admin/principal viewing
  // this teacher-portal page via the SectionSwitcher ((school)/layout.tsx)
  // is not personally in section_assignments/timetable for it, so without
  // this the one section they're actually looking at — and its class and
  // subjects — would be missing from every dropdown below. Write
  // authorization is unaffected: quizzes_insert/quizzes_write already permit
  // school_admin/principal regardless of teaches_section(); this only fixes
  // what the UI *offers* to pick, not who is allowed to submit it.
  const taughtSectionIds = Array.from(
    new Set([
      ...(homeroomRows ?? []).map((r) => r.section_id as string),
      ...(timetableRows ?? []).map((r) => r.section_id as string),
      sectionId,
    ])
  );

  const [{ data: quizzes }, { data: activeSectionRow }, { data: taughtSections }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("id, title, mode, status, opens_at, closes_at, question_count, total_points, subject:subjects(name)")
      .eq("section_id", sectionId)
      .order("created_at", { ascending: false }),
    supabase.from("sections").select("class_id").eq("id", sectionId).single(),
    taughtSectionIds.length > 0
      ? supabase.from("sections").select("id, name, class_id").in("id", taughtSectionIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string }[] }),
  ]);

  const taughtClassIds = Array.from(new Set((taughtSections ?? []).map((s) => s.class_id)));
  const [{ data: classes }, { data: allSubjects }] = await Promise.all([
    taughtClassIds.length > 0
      ? supabase.from("classes").select("id, name").in("id", taughtClassIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    taughtClassIds.length > 0
      ? supabase.from("subjects").select("id, name, class_id").in("class_id", taughtClassIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string }[] }),
  ]);

  const quizIds = (quizzes ?? []).map((q) => q.id);
  const [{ data: attempts }, { count: totalStudents }] = await Promise.all([
    quizIds.length > 0
      ? supabase.from("quiz_attempts").select("quiz_id, status").in("quiz_id", quizIds)
      : Promise.resolve({ data: [] as { quiz_id: string; status: string }[] }),
    supabase
      .from("student_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("section_id", sectionId)
      .eq("is_active", true),
  ]);
  const submittedByQuiz: Record<string, number> = {};
  for (const a of attempts ?? []) {
    if (a.status !== "in_progress") {
      submittedByQuiz[a.quiz_id] = (submittedByQuiz[a.quiz_id] ?? 0) + 1;
    }
  }

  const rows: QuizRow[] = (quizzes ?? []).map((q) => {
    const subject = q.subject as unknown as { name: string } | null;
    return {
      id: q.id,
      title: q.title,
      subject: subject?.name ?? "—",
      mode: q.mode === "live" ? "Live" : "Async",
      status: q.status,
      questions: q.question_count,
      points: q.total_points,
      opensAt: q.opens_at,
      closesAt: q.closes_at,
      submitted: `${submittedByQuiz[q.id] ?? 0}/${totalStudents ?? 0}`,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Testing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create, schedule and grade quizzes for your section.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Create a quiz</h2>
        <CreateQuizForm
          teacherId={user!.id}
          schoolId={schoolId}
          academicYearId={yearId ?? ""}
          classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
          sections={(taughtSections ?? []).map((s) => ({ id: s.id, name: s.name, classId: s.class_id }))}
          subjects={(allSubjects ?? []).map((s) => ({ id: s.id, name: s.name, classId: s.class_id }))}
          activeSectionId={sectionId}
          activeSectionClassId={activeSectionRow?.class_id ?? undefined}
        />
      </div>

      <QuizListTable rows={rows} />
    </div>
  );
}
