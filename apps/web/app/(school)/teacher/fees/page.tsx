import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../no-section-prompt";
import { PageHeader } from "@/components/page-header";
import { FeesTable, type FeeRow } from "./fees-table";

export default async function TeacherFeesPage() {
  const sectionId = await getActiveSection();
  if (!sectionId) return <NoSectionPrompt />;

  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: sectionRow } = await supabase
    .from("sections")
    .select("id, name, class_id, class:classes(name)")
    .eq("id", sectionId)
    .single();

  const sec = sectionRow as unknown as {
    name: string;
    class_id: string;
    class: { name: string } | null;
  } | null;
  const sectionLabel = sec ? `${sec.class?.name ?? ""} – Section ${sec.name}` : "";

  const { data: enrollments } = await supabase
    .from("student_enrollments")
    .select("student_profile_id, student_profiles(id, full_name)")
    .eq("section_id", sectionId)
    .eq("is_active", true);

  const students = (enrollments ?? []).map((e) => {
    const sp = e.student_profiles as unknown as { id: string; full_name: string | null };
    return { id: sp.id, full_name: sp.full_name };
  });

  const studentIds = (students ?? []).map((s) => s.id);
  const studentMap = new Map((students ?? []).map((s) => [s.id, s.full_name ?? "—"]));

  const { data: lineItems } = studentIds.length > 0
    ? await supabase
        .from("fee_line_items")
        .select("id, student_id, fee_type:fee_types(name), total_amount, due_date, status")
        .eq("school_id", schoolId)
        .in("student_id", studentIds)
    : { data: [] };

  const lineItemIds = (lineItems ?? []).map((li) => li.id);
  const { data: lips } = lineItemIds.length > 0
    ? await supabase
        .from("line_item_payments")
        .select("line_item_id, amount_applied")
        .in("line_item_id", lineItemIds)
    : { data: [] };

  const paidMap = new Map<string, number>();
  for (const lip of lips ?? []) {
    paidMap.set(lip.line_item_id, (paidMap.get(lip.line_item_id) ?? 0) + (lip.amount_applied as number));
  }

  const rows: FeeRow[] = (lineItems ?? []).map((li) => ({
    lineItemId: li.id as string,
    studentId: li.student_id as string,
    studentName: studentMap.get(li.student_id as string) ?? "—",
    feeTypeName: (li.fee_type as { name?: string } | null)?.name ?? "—",
    totalAmount: Number(li.total_amount),
    amountPaid: paidMap.get(li.id as string) ?? 0,
    status: li.status as string,
    dueDate: (li.due_date as string | null) ?? null,
  }));

  rows.sort((a, b) =>
    a.studentName.localeCompare(b.studentName) || a.feeTypeName.localeCompare(b.feeTypeName)
  );

  return (
    <div>
      <PageHeader title="Fees" description={sectionLabel || undefined} />
      <FeesTable rows={rows} schoolId={schoolId} />
    </div>
  );
}