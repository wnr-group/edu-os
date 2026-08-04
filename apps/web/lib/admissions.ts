import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Count of applications sitting in the Enquiry stage — the signal for the
 * Admissions nav badge. Admissions has no in-app notifications by design
 * (per D17); this badge is the only surface telling admin/principal that
 * something needs attention.
 *
 * Excludes payment_status = 'pending' to match the board itself, which
 * hides unpaid applications until payment clears.
 */
export async function fetchAdmissionEnquiryCount(supabase: SupabaseClient, schoolId: string): Promise<number> {
  const { count } = await supabase
    .from("admission_applications")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("stage", "enquiry")
    .neq("payment_status", "pending");
  return count ?? 0;
}