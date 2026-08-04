import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { FeeStatusDashboard, type RawLineItem, type FeeTypeOption, type ClassOption } from "./fee-status-dashboard";

export default async function FeeStatusPage() {
  const supabase = await createServerSupabaseClient();
  const schoolId = (await getSchoolId())!;

  const { data: activeYear } = await supabase
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .maybeSingle();

  // Scope to the active academic year (or year-less rows) — a student with
  // fee_line_items spanning two academic years otherwise produces two rows
  // for the same student_id on this "right now" dashboard.
  let lineItemsQuery = supabase
    .from("fee_line_items")
    .select("id, student_id, class_id, fee_type_id, total_amount, due_date, status, student:student_profiles(full_name), class:classes(name)")
    .eq("school_id", schoolId);

  lineItemsQuery = activeYear
    ? lineItemsQuery.or(`academic_year_id.eq.${activeYear.id},academic_year_id.is.null`)
    : lineItemsQuery;

  const [
    { data: lineItems },
    { data: classes },
    { data: feeTypes },
    { data: paymentsLast7d },
    { data: recentReminders },
    { data: allPayments },
  ] = await Promise.all([
    lineItemsQuery,
    supabase.from("classes").select("id, name").eq("school_id", schoolId).order("name"),
    supabase
      .from("fee_types")
      .select("id, name")
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .order("name"),
    supabase
      .from("payments")
      .select("total_amount")
      .eq("school_id", schoolId)
      .gte("payment_date", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase
      .from("notifications")
      .select("student_id, created_at")
      .eq("school_id", schoolId)
      .eq("type", "fee_reminder")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("student_id, payment_date")
      .eq("school_id", schoolId)
      .gte("payment_date", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);

  const lineItemIds = (lineItems ?? []).map((li) => li.id);
  const { data: lineItemPayments } = lineItemIds.length
    ? await supabase.from("line_item_payments").select("line_item_id, amount_applied").in("line_item_id", lineItemIds)
    : { data: [] as { line_item_id: string; amount_applied: number }[] };

  const paidByLineItem = new Map<string, number>();
  for (const p of lineItemPayments ?? []) {
    paidByLineItem.set(p.line_item_id, (paidByLineItem.get(p.line_item_id) ?? 0) + Number(p.amount_applied));
  }

  const rawLineItems: RawLineItem[] = (lineItems ?? []).map((li) => {
    const student = li.student as unknown as { full_name?: string } | null;
    const cls = li.class as unknown as { name?: string } | null;
    return {
      id: li.id,
      studentId: li.student_id,
      studentName: student?.full_name ?? "—",
      classId: li.class_id,
      className: cls?.name ?? "—",
      feeTypeId: li.fee_type_id,
      totalAmount: Number(li.total_amount),
      paidAmount: paidByLineItem.get(li.id) ?? 0,
      dueDate: li.due_date,
      status: li.status,
    };
  });

  const collected7d = (paymentsLast7d ?? []).reduce((s, p) => s + Number(p.total_amount), 0);

  const lastReminderByStudent = new Map<string, string>();
  for (const n of recentReminders ?? []) {
    if (!lastReminderByStudent.has(n.student_id)) lastReminderByStudent.set(n.student_id, n.created_at);
  }

  const remindersThisWeek = (recentReminders ?? []).filter(
    (n) => new Date(n.created_at).getTime() >= Date.now() - 7 * 86400000
  ).length;

  const paymentsByStudent = new Map<string, string[]>();
  for (const p of allPayments ?? []) {
    if (!paymentsByStudent.has(p.student_id)) paymentsByStudent.set(p.student_id, []);
    paymentsByStudent.get(p.student_id)!.push(p.payment_date);
  }
  let paidWithin48h = 0;
  const seenForMetric = new Set<string>();
  for (const n of recentReminders ?? []) {
    if (seenForMetric.has(n.student_id)) continue;
    const reminderTime = new Date(n.created_at).getTime();
    const windowEnd = reminderTime + 48 * 60 * 60 * 1000;
    const matched = (paymentsByStudent.get(n.student_id) ?? []).some((d) => {
      const t = new Date(d).getTime();
      return t >= reminderTime && t <= windowEnd;
    });
    if (matched) { paidWithin48h++; seenForMetric.add(n.student_id); }
  }

  return (
    <FeeStatusDashboard
      schoolId={schoolId}
      rawLineItems={rawLineItems}
      lastReminderByStudent={Object.fromEntries(lastReminderByStudent)}
      outcome={{ collected7d, remindersThisWeek, paidWithin48h }}
      classes={(classes ?? []).map((c) => ({ id: c.id, name: c.name })) as ClassOption[]}
      feeTypes={(feeTypes ?? []).map((f) => ({ id: f.id, name: f.name })) as FeeTypeOption[]}
    />
  );
}