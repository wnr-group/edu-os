export const dynamic = "force-dynamic";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: school } = await supabase
    .from("schools")
    .select("name, contact_email, address, logo_url")
    .eq("id", schoolId)
    .single();

  return (
    <div>
      <PageHeader title="School Settings" description="Update your school's information." />
      <SettingsForm
        schoolId={schoolId}
        initialName={school?.name ?? ""}
        initialContactEmail={(school as any)?.contact_email ?? ""}
        initialAddress={(school as any)?.address ?? ""}
        initialLogoUrl={(school as any)?.logo_url ?? null}
      />
    </div>
  );
}