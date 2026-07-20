export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeeTypesClient } from "./fee-types-client";
import type { FeeType } from "@/components/fee-type-select";

export default async function FeeTypesPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data } = await supabase
    .from("fee_types")
    .select("id, name, category, is_predefined, is_one_time, is_refundable, is_optional")
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .order("name");

  const all = (data ?? []) as (FeeType & { is_one_time: boolean; is_refundable: boolean; is_optional: boolean })[];
  const predefined = all.filter((ft) => ft.is_predefined);
  const custom = all.filter((ft) => !ft.is_predefined);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href="/admin/settings"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Settings
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Fee Types</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage the fee types available when creating fee line items.
        </p>
      </div>

      <FeeTypesClient predefined={predefined} custom={custom} />
    </div>
  );
}