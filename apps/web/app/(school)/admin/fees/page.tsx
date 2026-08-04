import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { PushFeeForm } from "./push-fee-form";
import { FeeLineItemsTable } from "./fee-line-items-table";
import type { FeeType } from "@/components/fee-type-select";
import Link from "next/link";

export default async function FeesPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;
  void schoolId; // (existing usage below unaffected — see link addition)

  const [classesRes, academicYearsRes, lineItemsRes, feeTypesRes] = await Promise.all([
    supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
    supabase.from("academic_years").select("id, name").eq("school_id", schoolId).order("start_date", { ascending: false }),
    supabase
      .from("fee_line_items")
      .select("id, fee_type:fee_types(name), total_amount, due_date, status, student:student_profiles(full_name), class:classes(name), academic_year:academic_years(name)")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("fee_types")
      .select("id, name, category, is_predefined")
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .order("is_predefined", { ascending: false })
      .order("name"),
  ]);

  const lineItemRows = (lineItemsRes.data ?? []).map((li) => ({
    id: li.id as string,
    student: (li.student as { full_name?: string } | null)?.full_name ?? "—",
    fee_type: (li.fee_type as { name?: string } | null)?.name ?? "—",
    amount: `₹${Number(li.total_amount).toLocaleString("en-IN")}`,
    class_name: (li.class as { name?: string } | null)?.name ?? "—",
    academic_year: (li.academic_year as { name?: string } | null)?.name ?? "—",
    due_date: (li.due_date as string | null) ?? "—",
    status: li.status as string,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Fees</h1>
        <Link href="/admin/fees/status" className="text-sm font-semibold text-indigo-600 hover:underline">
          View Fee Status →
        </Link>
      </div>

      <h2 className="mb-4 text-xl font-semibold text-gray-800">Push Fee to Class</h2>
      <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
        <p className="mb-4 text-sm text-muted-foreground">Creates a fee line item for every student in the selected class.</p>
        <PushFeeForm
          classes={(classesRes.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          academicYears={(academicYearsRes.data ?? []).map((y) => ({ id: y.id, name: y.name }))}
          feeTypes={(feeTypesRes.data ?? []) as FeeType[]}
        />
      </div>

      <div className="mt-10">
        <FeeLineItemsTable rows={lineItemRows} />
      </div>
    </div>
  );
}