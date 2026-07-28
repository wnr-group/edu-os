export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { fetchFlaggedGroups } from "@/lib/geo-attendance";
import { FlagReviewList } from "../../../admin/settings/geo-attendance/flag-review-list";

export default async function PrincipalGeoReviewPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  const { data: { user } } = await supabase.auth.getUser();

  const sinceDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const flags = await fetchFlaggedGroups(supabase, schoolId, sinceDate);

  return (
    <div>
      <PageHeader title="Geo Review" description="Off-campus and no-GPS attendance submissions awaiting review." />
      <FlagReviewList groups={flags} reviewerId={user!.id} />
    </div>
  );
}
