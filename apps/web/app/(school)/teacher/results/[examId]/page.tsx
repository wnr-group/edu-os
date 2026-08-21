import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../../no-section-prompt";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MarksEntryForm } from "./marks-entry-form";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";

export default async function ExamMarksPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ sectionId?: string }>;
}) {
  const { examId } = await params;
  const { sectionId: sectionIdParam } = await searchParams;

  // Prefer sectionId from query param, fallback to active section header
  const sectionId = sectionIdParam ?? (await getActiveSection());

  if (!sectionId) {
    return <NoSectionPrompt />;
  }

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exams !== true) {
    return <ModuleUnavailable module="Exams" />;
  }

  const supabase = await createServerSupabaseClient();

  // Look up the section to get its class_id
  const { data: sectionRow } = await supabase
    .from("sections")
    .select("id, name, class_id, class:classes(name)")
    .eq("id", sectionId)
    .single();

  const sec = sectionRow as unknown as {
    id: string;
    name: string;
    class_id: string;
    class: { name: string } | null;
  } | null;

  const sectionLabel = sec
    ? `${sec.class?.name ?? ""} – Section ${sec.name}`
    : sectionId;

  const [{ data: exam }, { data: subjects }, { data: students }, { data: existingResults }] =
    await Promise.all([
      supabase
        .from("exams")
        .select("id, name")
        .eq("id", examId)
        .single(),

      // Subjects scoped to the section's class
      sec?.class_id
        ? supabase
            .from("subjects")
            .select("id, name")
            .eq("school_id", schoolId)
            .eq("class_id", sec.class_id)
            .order("name")
        : supabase
            .from("subjects")
            .select("id, name")
            .eq("school_id", schoolId)
            .order("name"),

      // Students scoped to this section only
      supabase
        .from("student_enrollments")
        .select("student_profile_id, roll_number, student_profile:student_profiles(id, full_name)")
        .eq("section_id", sectionId)
        .eq("is_active", true)
        .order("roll_number"),

      // Existing results for this exam
      supabase
        .from("exam_results")
        .select("student_id, subject_id, marks_obtained, max_marks")
        .eq("exam_id", examId),
    ]);

  const studentRows = (students ?? []).map((s) => {
    const sp = s.student_profile as unknown as { id: string; full_name: string | null } | null;
    return {
      id: sp?.id ?? "",
      roll_number: s.roll_number ?? "",
      full_name: sp?.full_name ?? "—",
      section_label: sectionLabel,
    };
  }).filter((s) => s.id);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href="/teacher/results"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Results
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Enter Marks</h1>
          <p className="mt-1 text-sm text-muted-foreground">{exam?.name ?? examId}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/80">{sectionLabel}</p>
        </div>
        <Link
          href={`/teacher/results/${examId}/rankings?sectionId=${sectionId}`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          <Trophy className="mr-1.5 h-4 w-4" />
          View Rankings
        </Link>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <MarksEntryForm
          examId={examId}
          schoolId={schoolId}
          subjects={(subjects ?? []).map((s) => ({ id: s.id, name: s.name }))}
          students={studentRows}
          existingResults={existingResults ?? []}
        />
      </div>
    </div>
  );
}