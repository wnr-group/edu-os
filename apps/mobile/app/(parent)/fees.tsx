import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, Modal, Alert, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import RazorpayCheckout from "react-native-razorpay";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import { useActiveContext } from "../../lib/active-context";
import { useTheme, useFeature } from "../../lib/theme";
import { PrimaryButton } from "../../components/PrimaryButton";
import { StatusBadge } from "../../components/StatusBadge";
import { SectionHeader } from "../../components/SectionHeader";
import { SkeletonCard } from "../../components/Skeleton";

function DonutChart({ paid, total }: { paid: number; total: number }) {
  const size = 120;
  const strokeWidth = 14;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const paidPct = total > 0 ? Math.max(0, Math.min(1, paid / total)) : 0;
  const paidDash = paidPct * circumference;

  return (
    <View style={{ alignItems: "center", marginVertical: 8 }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G rotation="-90" origin={`${size / 2},${size / 2}`}>
          <Circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={strokeWidth}
          />
          {paidDash > 0 && (
            <Circle
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke="#fff" strokeWidth={strokeWidth}
              strokeDasharray={`${paidDash} ${circumference}`}
              strokeLinecap={paidPct >= 1 ? "butt" : "round"}
            />
          )}
        </G>
        <SvgText
          x={size / 2} y={size / 2 - 6}
          textAnchor="middle" fill="#fff"
          fontSize="14" fontWeight="700"
        >
          {total > 0 ? `${Math.round(paidPct * 100)}%` : "0%"}
        </SvgText>
        <SvgText
          x={size / 2} y={size / 2 + 12}
          textAnchor="middle" fill="rgba(255,255,255,0.7)"
          fontSize="10"
        >
          paid
        </SvgText>
      </Svg>
    </View>
  );
}

const PIE_COLORS = ["#6366F1", "#10B981", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#8B5CF6", "#14B8A6"];

function FeeTypePieChart({ lineItems }: { lineItems: FeeLineItem[] }) {
  if (lineItems.length === 0) return null;

  // Group by fee_type
  const grouped: Record<string, { total: number; paid: number }> = {};
  for (const li of lineItems) {
    if (!grouped[li.fee_type]) grouped[li.fee_type] = { total: 0, paid: 0 };
    grouped[li.fee_type].total += li.total_amount;
    grouped[li.fee_type].paid += li.amount_paid;
  }
  const entries = Object.entries(grouped);
  const grandTotal = entries.reduce((s, [, v]) => s + v.total, 0);
  if (grandTotal === 0) return null;

  const size = 160;
  const strokeWidth = 18;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // Build arc segments
  let offset = 0;
  const segments = entries.map(([type, { total }], i) => {
    const pct = total / grandTotal;
    const dash = pct * circumference;
    const seg = { type, total, pct, dash, offset, color: PIE_COLORS[i % PIE_COLORS.length] };
    offset += dash;
    return seg;
  });

  return (
    <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 16 }}>
      <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#111827" }}>Fee Breakdown by Type</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        {/* Pie chart */}
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <G rotation="-90" origin={`${size / 2},${size / 2}`}>
            {segments.map((seg) => (
              <Circle
                key={seg.type}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${seg.dash - 2} ${circumference - seg.dash + 2}`}
                strokeDashoffset={-seg.offset}
              />
            ))}
          </G>
        </Svg>
        {/* Legend */}
        <View style={{ flex: 1, gap: 8 }}>
          {segments.map((seg) => (
            <View key={seg.type} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: seg.color }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" }}>{seg.type}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" }}>
                  ₹{seg.total.toLocaleString("en-IN")} · {Math.round(seg.pct * 100)}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      {/* Paid vs Outstanding per type */}
      <View style={{ gap: 8 }}>
        {entries.map(([type, { total, paid }], i) => {
          const outstanding = total - paid;
          const paidPct = total > 0 ? paid / total : 0;
          return (
            <View key={type} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#374151" }}>{type}</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: outstanding > 0 ? "#EF4444" : "#10B981" }}>
                  {outstanding > 0 ? `₹${outstanding.toLocaleString("en-IN")} due` : "Paid"}
                </Text>
              </View>
              <View style={{ height: 4, backgroundColor: "#F3F4F6", borderRadius: 2 }}>
                <View style={{ height: 4, width: `${Math.round(paidPct * 100)}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 2 }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface FeeLineItem {
  id: string;
  fee_type: string;
  total_amount: number;
  amount_paid: number;
  outstanding: number;
  due_date: string;
  status: "paid" | "pending" | "partial";
  yearName: string;
  yearStart: string;
}

interface PaymentHistoryRow {
  id: string;
  total_amount: number;
  paid_at: string | null;
  payment_method: string;
  mode: string;
  transaction_id: string | null;
  line_items_covered: { fee_type: string; amount_applied: number }[];
  yearName: string;
  yearStart: string;
}

// Group year-tagged rows, most recent academic year first; untagged rows last.
function groupByYear<T extends { yearName: string; yearStart: string }>(rows: T[]) {
  const map = new Map<string, { name: string; start: string; rows: T[] }>();
  for (const r of rows) {
    if (!map.has(r.yearName)) map.set(r.yearName, { name: r.yearName, start: r.yearStart, rows: [] });
    map.get(r.yearName)!.rows.push(r);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return b.start.localeCompare(a.start);
  });
}

export default function ParentFees() {
  const theme = useTheme();
  const paymentsEnabled = useFeature("online_payments");
  const feesEnabled = useFeature("fees");
  const { studentId: activeStudentId } = useActiveContext();
  const [lineItems, setLineItems] = useState<FeeLineItem[]>([]);
  const [history, setHistory] = useState<PaymentHistoryRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [receipt, setReceipt] = useState<PaymentHistoryRow | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  useEffect(() => { loadFees(); }, [activeStudentId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFees();
    setRefreshing(false);
  }, [activeStudentId]);

  async function loadFees() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    if (!activeStudentId) { setLineItems([]); setHistory([]); setLoading(false); return; }

    const { data: sp } = await supabase
      .from("student_profiles")
      .select("id, school_id")
      .eq("id", activeStudentId)
      .maybeSingle();

    if (!sp) { setLineItems([]); setHistory([]); setLoading(false); return; }

    const [{ data: lineItemsData }, { data: paymentsData }] = await Promise.all([
      supabase
        .from("fee_line_items")
        .select("id, fee_type:fee_types(name), total_amount, due_date, status, academic_year_id, academic_years(name, start_date)")
        .eq("student_id", sp.id)
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("payments")
        .select("id, payment_date, total_amount, payment_method, mode, transaction_id, razorpay_payment_id, line_item_payments(amount_applied, line_item_id, fee_line_items!line_item_id(fee_type:fee_types(name), academic_years(name, start_date)))")
        .eq("student_id", sp.id)
        .order("payment_date", { ascending: false }),
    ]);

    const paidMap: Record<string, number> = {};
    for (const p of paymentsData ?? []) {
      for (const lip of (p as any).line_item_payments ?? []) {
        const liId: string = lip.line_item_id ?? "";
        paidMap[liId] = (paidMap[liId] ?? 0) + (lip.amount_applied ?? 0);
      }
    }

    const items: FeeLineItem[] = (lineItemsData ?? []).map((li: any) => {
      const paid = paidMap[li.id] ?? 0;
      const outstanding = Math.max(0, li.total_amount - paid);
      return {
        id: li.id,
        fee_type: (li.fee_type as { name?: string } | null)?.name ?? "Unknown",
        total_amount: li.total_amount ?? 0,
        amount_paid: paid,
        outstanding,
        due_date: li.due_date ?? "",
        status: li.status ?? "pending",
        yearName: (li.academic_years as { name?: string } | null)?.name ?? "Other",
        yearStart: (li.academic_years as { start_date?: string } | null)?.start_date ?? "",
      };
    });

    setLineItems(items);
    setHistory(
      (paymentsData ?? []).map((p: any) => {
        // A payment inherits its year from the line items it covers (payments
        // themselves aren't year-tagged). Use the first covered item's year.
        const firstYear = ((p.line_item_payments ?? [])
          .map((lip: any) => lip.fee_line_items?.academic_years)
          .find(Boolean)) as { name?: string; start_date?: string } | undefined;
        return {
          id: p.id,
          total_amount: p.total_amount ?? 0,
          paid_at: p.payment_date ?? null,
          payment_method: p.payment_method ?? "",
          mode: p.mode ?? "",
          transaction_id: p.transaction_id ?? p.razorpay_payment_id ?? null,
          line_items_covered: ((p.line_item_payments ?? []) as any[]).map((lip: any) => ({
            fee_type: (lip.fee_line_items as { fee_type?: { name?: string } } | null)?.fee_type?.name ?? "—",
            amount_applied: lip.amount_applied ?? 0,
          })),
          yearName: firstYear?.name ?? "Other",
          yearStart: firstYear?.start_date ?? "",
        };
      })
    );
    setLoading(false);
  }

  const totalFeeAmount = lineItems.reduce((s, li) => s + li.total_amount, 0);
  const totalPaid = lineItems.reduce((s, li) => s + li.amount_paid, 0);
  const totalDue = lineItems.reduce((s, li) => s + li.outstanding, 0);
  const nextDue = lineItems.filter((li) => li.status !== "paid").sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];

  const unpaidByYear = groupByYear(lineItems.filter((li) => li.status !== "paid"));
  const historyByYear = groupByYear(history);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePaySelected() {
    const selected = lineItems.filter((li) => selectedIds.has(li.id) && li.status !== "paid");
    if (selected.length === 0) return;

    const totalOutstanding = selected.reduce((s, li) => s + li.outstanding, 0);
    const amountPaise = Math.round(totalOutstanding * 100);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!activeStudentId) return;

    const { data: sp } = await supabase
      .from("student_profiles")
      .select("id")
      .eq("id", activeStudentId)
      .maybeSingle();
    if (!sp) return;

    setPayingId("selected");
    try {
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      if (!supabaseUrl) throw new Error("EXPO_PUBLIC_SUPABASE_URL is not set");

      let orderData: any;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const orderRes = await fetch(`${supabaseUrl}/functions/v1/create-razorpay-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? ""}`,
          },
          body: JSON.stringify({
            amount_paise: amountPaise,
            student_id: sp.id,
            line_item_ids: selected.map((li) => li.id),
          }),
        });
        orderData = await orderRes.json();
        if (!orderRes.ok) throw new Error(`Order API error (${orderRes.status}): ${orderData.error ?? "unknown"}`);
      } catch (fetchErr: any) {
        throw new Error(`Cannot reach payment server: ${fetchErr?.message ?? fetchErr}`);
      }

      if (!orderData.order_id) throw new Error("No order ID returned from server");

      // ERP-63: key_id now comes from the order response (per-school), not a
      // build-time env var that couldn't vary between schools.
      const razorpayKey = orderData.key_id ?? "";
      if (!razorpayKey) throw new Error("Payments are not set up for this school yet");

      const options = {
        description: selected.map((li) => li.fee_type).join(", "),
        currency: "INR",
        key: razorpayKey,
        amount: amountPaise,
        name: "School Fees",
        order_id: orderData.order_id,
        prefill: { email: user.email ?? "", contact: "", name: "" },
        theme: { color: "#4F46E5" },
      };

      await RazorpayCheckout.open(options as any);
      // Webhook handles DB write; refresh after short delay
      await new Promise((r) => setTimeout(r, 2000));
      setSelectedIds(new Set());
      await loadFees();
    } catch (e: any) {
      if (e?.code !== "PAYMENT_CANCELLED") {
        Alert.alert("Payment failed", e?.description ?? e?.message ?? "Try again");
        console.error("Payment error:", e);
      }
    } finally {
      setPayingId(null);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Fees</Text>

        {!loading && !feesEnabled ? (
          <View style={{ alignItems: "center", paddingVertical: 60, gap: 12 }}>
            <Ionicons name="wallet-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_500Medium", color: theme.textMuted, textAlign: "center", paddingHorizontal: 32 }}>
              Fees aren't available for your school right now.
            </Text>
          </View>
        ) : (<>

        {/* Balance card */}
        {loading ? <SkeletonCard /> : (<>
          <View style={{ backgroundColor: theme.primary, borderRadius: 20, padding: 24, gap: 8 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.5 }}>Total Outstanding</Text>
            <DonutChart paid={totalPaid} total={totalFeeAmount} />
            <Text style={{ fontSize: 36, fontFamily: "Inter_700Bold", color: "#fff" }}>₹{totalDue.toLocaleString("en-IN")}</Text>
            {nextDue && (
              <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)" }}>
                Next due: {nextDue.due_date ? new Date(nextDue.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </Text>
            )}
            {totalDue > 0 && paymentsEnabled && (
              <TouchableOpacity activeOpacity={0.85} onPress={() => {
                const pendingIds = lineItems.filter((li) => li.status !== "paid").map((li) => li.id);
                setSelectedIds(new Set(pendingIds));
              }} style={{ backgroundColor: "#fff", borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 8 }}>
                <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.primary }}>Select All & Pay</Text>
              </TouchableOpacity>
            )}
          </View>
          <FeeTypePieChart lineItems={lineItems} />
        </>)}

        {/* Fee breakdown */}
        <View>
          <SectionHeader title="Fee Breakdown" />
          {loading ? (
            <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
          ) : unpaidByYear.length === 0 ? (
            <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 20 }}>All fees paid!</Text>
          ) : unpaidByYear.map((group) => (
            <View key={group.name} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{group.name}</Text>
              {group.rows.map((li) => (
                <TouchableOpacity
                  key={li.id}
                  onPress={paymentsEnabled ? () => toggleSelect(li.id) : undefined}
                  activeOpacity={paymentsEnabled ? 0.7 : 1}
                  style={{
                    backgroundColor: selectedIds.has(li.id) ? `${theme.primary}18` : theme.surface,
                    borderRadius: 16,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    borderWidth: 1.5,
                    borderColor: selectedIds.has(li.id) ? theme.primary : "transparent",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    {paymentsEnabled && (
                      <View style={{
                        width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
                        borderColor: selectedIds.has(li.id) ? theme.primary : theme.border,
                        backgroundColor: selectedIds.has(li.id) ? theme.primary : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {selectedIds.has(li.id) && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                    )}
                    <View>
                      <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{li.fee_type}</Text>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                        Due {li.due_date ? new Date(li.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>₹{li.outstanding.toLocaleString("en-IN")}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}

          {selectedIds.size > 0 && paymentsEnabled && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePaySelected}
              disabled={payingId === "selected"}
              style={{
                backgroundColor: theme.primary,
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: "center",
                marginTop: 8,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                {payingId === "selected" ? "Processing…" : `Pay ₹${lineItems.filter((li) => selectedIds.has(li.id)).reduce((s, li) => s + li.outstanding, 0).toLocaleString("en-IN")}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Payment history */}
        <View>
          <SectionHeader title="Payment History" />
          {loading ? (
            <View style={{ gap: 8 }}><SkeletonCard /><SkeletonCard /></View>
          ) : historyByYear.length === 0 ? (
            <Text style={{ textAlign: "center", color: theme.textMuted, fontFamily: "Inter_400Regular", paddingVertical: 20 }}>No payments yet</Text>
          ) : historyByYear.map((group) => (
            <View key={group.name} style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textMuted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>{group.name}</Text>
              {group.rows.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => setReceipt(p)} style={{ backgroundColor: theme.surface, borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }} activeOpacity={0.7}>
                  <View>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>
                      {p.line_items_covered.length > 0 ? p.line_items_covered.map((lic) => lic.fee_type).join(", ") : "Payment"}
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginTop: 2 }}>
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: theme.success }}>₹{p.total_amount.toLocaleString("en-IN")}</Text>
                    <StatusBadge variant="paid" />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        </>)}
      </ScrollView>

      {/* Receipt modal */}
      <Modal visible={!!receipt} transparent animationType="slide" onRequestClose={() => setReceipt(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: theme.textPrimary }}>Receipt</Text>
              <TouchableOpacity onPress={() => setReceipt(null)}>
                <Ionicons name="close" size={24} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            {receipt && (
              <View style={{ gap: 12 }}>
                {[
                  { label: "Amount Paid", value: `₹${receipt.total_amount.toLocaleString("en-IN")}` },
                  { label: "Date", value: receipt.paid_at ? new Date(receipt.paid_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—" },
                  { label: "Transaction ID", value: receipt.transaction_id ?? "—" },
                  { label: "Status", value: "Paid" },
                ].map((row) => (
                  <View key={row.label} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{row.label}</Text>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>{row.value}</Text>
                  </View>
                ))}
                {receipt.line_items_covered?.length > 0 && (
                  <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: theme.textSecondary, marginBottom: 4 }}>Applied to</Text>
                    {receipt.line_items_covered.map((lic: any, i: number) => (
                      <View key={i} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }}>{lic.fee_type}</Text>
                        <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: theme.textPrimary }}>₹{lic.amount_applied.toLocaleString("en-IN")}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            <PrimaryButton label="Close" onPress={() => setReceipt(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}