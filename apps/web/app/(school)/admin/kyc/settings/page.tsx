import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { DocumentTypeSettings } from "./document-type-settings";

export default async function KycSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: types } = await supabase
    .from("document_types")
    .select("id, name, description, is_required, is_active, expires, default_validity_months, is_custom")
    .eq("school_id", schoolId)
    .order("sort_order");

  return <DocumentTypeSettings schoolId={schoolId} types={types ?? []} />;
}