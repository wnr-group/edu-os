import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { DataTable } from "@/components/data-table";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import Link from "next/link";

export default async function ResultsPage() {
  const sectionId = await getActiveSection();

  if (!sectionId) {
    return <NoSectionPrompt />;
  }

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exams !== true) {
    return <ModuleUnavailable module="Exams" />;
  }

  const supabase = await createServerSupabaseClient();
  const { data: exams } = await supabase
    .from("exams")
    .select("id, name, start_date, end_date, academic_year:academic_years(name)")
    .eq("school_id", schoolId)
    .order("start_date", { ascending: false });

  const rows = (exams ?? []).map((e) => {
    const ay = e.academic_year as unknown as { name: string } | null;
    return {
      id: e.id,
      name: e.name ?? "—",
      academic_year: ay?.name ?? "—",
      start_date: e.start_date ?? "—",
      end_date: e.end_date ?? "—",
    };
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Results / Exam Marks</h1>
      <DataTable
        data={rows}
        columns={[
          { header: "Exam", accessor: "name" },
          { header: "Academic Year", accessor: "academic_year" },
          { header: "Start", accessor: "start_date" },
          { header: "End", accessor: "end_date" },
          {
            header: "Actions",
            accessor: (row) => (
              <div className="flex gap-3">
                <Link
                  href={`/teacher/results/${row.id}?sectionId=${sectionId}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  Enter Marks
                </Link>
                <Link
                  href={`/teacher/results/${row.id}/rankings?sectionId=${sectionId}`}
                  className="text-sm font-medium text-indigo-600 hover:underline"
                >
                  View Rankings
                </Link>
              </div>
            ),
          },
        ]}
        emptyMessage="No exams found."
      />
    </div>
  );
}
