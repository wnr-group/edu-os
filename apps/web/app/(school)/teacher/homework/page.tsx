import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { getAcademicYearId } from "@/lib/academic-year";
import { DataTable } from "@/components/data-table";
import { CreateHomeworkForm } from "./create-homework-form";
import { NoSectionPrompt } from "../no-section-prompt";

export default async function HomeworkPage() {
  const sectionId = await getActiveSection();
  if (!sectionId) return <NoSectionPrompt />;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const schoolId = (await getSchoolId())!;
  const yearId = await getAcademicYearId(schoolId);

  // A teacher may only assign homework to sections they actually teach
  // (homeroom via section_assignments, or subject via timetable, in the active
  // year) — this mirrors the mobile app and the send-homework-notification
  // authorization, so the create form can't offer a section the notification
  // would then reject.
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
  const taughtSectionIds = Array.from(
    new Set([
      ...(homeroomRows ?? []).map((r) => r.section_id as string),
      ...(timetableRows ?? []).map((r) => r.section_id as string),
    ])
  );

  const [{ data: homework }, { data: activeSection }, { data: taughtSections }] = await Promise.all([
    supabase
      .from("homework")
      .select(
        "id, title, description, due_date, subject:subjects(name), section:sections(name, class:classes(name))"
      )
      .eq("section_id", sectionId)
      .order("due_date", { ascending: false }),
    supabase
      .from("sections")
      .select("class_id")
      .eq("id", sectionId)
      .single(),
    taughtSectionIds.length > 0
      ? supabase
          .from("sections")
          .select("id, name, class_id")
          .in("id", taughtSectionIds)
          .order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string }[] }),
  ]);

  // Classes + subjects are derived from the taught sections' classes only.
  const taughtClassIds = Array.from(new Set((taughtSections ?? []).map((s) => s.class_id)));
  const [{ data: classes }, { data: allSubjects }] = await Promise.all([
    taughtClassIds.length > 0
      ? supabase.from("classes").select("id, name").in("id", taughtClassIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    taughtClassIds.length > 0
      ? supabase.from("subjects").select("id, name, class_id").in("class_id", taughtClassIds).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string; class_id: string }[] }),
  ]);
  const allSections = taughtSections;

  const homeworkIds = (homework ?? []).map((h) => h.id);
  const [{ count: totalStudents }, { data: doneStatuses }] = await Promise.all([
    supabase.from("student_enrollments").select("id", { count: "exact", head: true })
      .eq("section_id", sectionId).eq("is_active", true),
    homeworkIds.length > 0
      ? supabase.from("homework_status").select("homework_id, state")
          .in("homework_id", homeworkIds).eq("state", "done")
      : Promise.resolve({ data: [] as { homework_id: string; state: string }[] }),
  ]);
  const doneByHw: Record<string, number> = {};
  for (const s of (doneStatuses ?? []) as any[]) doneByHw[s.homework_id] = (doneByHw[s.homework_id] ?? 0) + 1;

  const rows = (homework ?? []).map((h) => {
    const subject = h.subject as unknown as { name: string } | null;
    const section = h.section as unknown as {
      name: string;
      class: { name: string } | null;
    } | null;
    return {
      id: h.id,
      title: h.title ?? "—",
      subject: subject?.name ?? "—",
      section: section ? `${section.class?.name ?? ""} – ${section.name}` : "—",
      due_date: h.due_date ? new Date(h.due_date).toLocaleDateString() : "—",
      done: `${doneByHw[h.id] ?? 0}/${totalStudents ?? 0}`,
      description: h.description ?? "—",
    };
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Homework</h1>

      <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">
          Assign New Homework
        </h2>
        <CreateHomeworkForm
          teacherId={user!.id}
          schoolId={schoolId}
          classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name }))}
          sections={(allSections ?? []).map((s) => ({ id: s.id, name: s.name, classId: s.class_id }))}
          subjects={(allSubjects ?? []).map((s) => ({ id: s.id, name: s.name, classId: s.class_id }))}
          activeSectionId={sectionId}
          activeSectionClassId={activeSection?.class_id ?? undefined}
        />
      </div>

      <DataTable
        data={rows}
        columns={[
          { header: "Title", accessor: (row) => (
              <a href={`/teacher/homework/${row.id}`} className="font-medium text-primary hover:underline">{row.title}</a>
          ) },
          { header: "Subject", accessor: "subject" },
          { header: "Section", accessor: "section" },
          { header: "Due Date", accessor: "due_date" },
          { header: "Done", accessor: "done" },
          { header: "Description", accessor: "description" },
        ]}
        emptyMessage="No homework assigned yet."
      />
    </div>
  );
}
