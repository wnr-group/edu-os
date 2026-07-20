import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { SubjectsMatrix } from "./subjects-matrix";

export default async function SubjectsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const [{ data: classes }, { data: subjects }] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, order")
      .eq("school_id", schoolId)
      .order("order"),
    supabase
      .from("subjects")
      .select("id, name, code, class_id")
      .eq("school_id", schoolId)
      .order("name"),
  ]);

  return (
    <SubjectsMatrix
      schoolId={schoolId}
      classes={classes ?? []}
      subjects={subjects ?? []}
    />
  );
}
