"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { FeesPieChart } from "./student-fees-pie-chart";
import { FeeTypeSelect, type FeeType } from "@/components/fee-type-select";

interface LineItem {
  id: string;
  fee_type: string;
  total_amount: number;
  amount_paid: number;
  due_date: string | null;
  status: string;
  created_at: string;
  added_by: string;
}

interface PaymentRecord {
  id: string;
  payment_date: string;
  total_amount: number;
  payment_method: string;
  mode: string;
  transaction_id: string | null;
  razorpay_payment_id: string | null;
  notes: string | null;
  paid_by: string;
  line_items_covered: { line_item_id: string; fee_type: string; amount_applied: number }[];
}

interface Props {
  lineItems: LineItem[];
  payments: PaymentRecord[];
  schoolId: string;
  studentId: string;
  studentName: string;
  feeTypes: FeeType[];
}

const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "cheque"] as const;
const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", upi: "UPI", bank_transfer: "Bank Transfer", cheque: "Cheque",
};

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "paid" ? "bg-emerald-100 text-emerald-800" :
    status === "partial" ? "bg-amber-100 text-amber-800" :
    "bg-rose-100 text-rose-800";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>;
}

function InlineFormRow({ colSpan, color, title, children }: {
  colSpan: number; color: string; title: string; children: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className={`px-6 py-4 ${color}`}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-current opacity-70">{title}</p>
        {children}
      </td>
    </tr>
  );
}

export function StudentFeesClient({ lineItems, payments, schoolId, studentId, feeTypes }: Props) {
  const router = useRouter();

  // Add Fee form
  const [addingFee, setAddingFee] = useState(false);
  const [feeForm, setFeeForm] = useState({ fee_type_id: "", total_amount: "", due_date: "" });
  const [feeLoading, setFeeLoading] = useState(false);

  // Record Payment form (per line item)
  const [recordingFor, setRecordingFor] = useState<LineItem | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "cash", transaction_id: "", notes: "" });
  const [payLoading, setPayLoading] = useState(false);

  // Add standalone Payment form
  const [addingPayment, setAddingPayment] = useState(false);
  const [standaloneForm, setStandaloneForm] = useState({
    amount: "", payment_method: "cash", transaction_id: "", notes: "",
    allocations: {} as Record<string, string>, // line_item_id → amount string
  });
  const [standaloneLoading, setStandaloneLoading] = useState(false);

  // Detail expansions
  const [expandedLi, setExpandedLi] = useState<string | null>(null);
  const [expandedPay, setExpandedPay] = useState<string | null>(null);

  const totalDue = lineItems.reduce((s, li) => s + li.total_amount, 0);
  const totalPaid = lineItems.reduce((s, li) => s + li.amount_paid, 0);
  const outstanding = Math.max(0, totalDue - totalPaid);

  // --- Add Fee ---
  async function handleAddFee() {
    const amount = parseFloat(feeForm.total_amount);
    if (!feeForm.fee_type_id) { toast.error("Fee type is required."); return; }
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount."); return; }
    setFeeLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("fee_line_items").insert({
      school_id: schoolId,
      student_id: studentId,
      fee_type_id: feeForm.fee_type_id,
      total_amount: amount,
      due_date: feeForm.due_date || null,
      status: "pending",
    });
    setFeeLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Fee added.");
    setFeeForm({ fee_type_id: "", total_amount: "", due_date: "" });
    setAddingFee(false);
    router.refresh();
  }

  // --- Record Payment per line item ---
  async function handleRecordPayment(li: LineItem) {
    const amount = parseFloat(payForm.amount);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid amount."); return; }
    const pending = li.total_amount - li.amount_paid;
    if (amount > pending) { toast.error(`Amount cannot exceed outstanding ₹${pending.toLocaleString("en-IN")}.`); return; }
    setPayLoading(true);
    const res = await fetch("/api/fees/record-offline-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        payment_method: payForm.payment_method,
        transaction_id: payForm.transaction_id || undefined,
        notes: payForm.notes || undefined,
        allocations: [{ line_item_id: li.id, amount_applied: amount }],
      }),
    });
    setPayLoading(false);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to record payment."); return; }
    toast.success("Payment recorded.");
    setRecordingFor(null);
    setPayForm({ amount: "", payment_method: "cash", transaction_id: "", notes: "" });
    router.refresh();
  }

  // --- Add standalone Payment ---
  async function handleAddPayment() {
    const total = parseFloat(standaloneForm.amount);
    if (isNaN(total) || total <= 0) { toast.error("Enter a valid total amount."); return; }
    const allocEntries = Object.entries(standaloneForm.allocations)
      .map(([id, v]) => ({ line_item_id: id, amount_applied: parseFloat(v) }))
      .filter((a) => !isNaN(a.amount_applied) && a.amount_applied > 0);
    if (allocEntries.length === 0) { toast.error("Allocate the amount to at least one fee line item."); return; }
    const allocTotal = allocEntries.reduce((s, a) => s + a.amount_applied, 0);
    if (Math.abs(allocTotal - total) > 0.01) {
      toast.error(`Allocated ₹${allocTotal.toLocaleString("en-IN")} must equal total ₹${total.toLocaleString("en-IN")}.`);
      return;
    }
    setStandaloneLoading(true);
    const res = await fetch("/api/fees/record-offline-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        payment_method: standaloneForm.payment_method,
        transaction_id: standaloneForm.transaction_id || undefined,
        notes: standaloneForm.notes || undefined,
        allocations: allocEntries,
      }),
    });
    setStandaloneLoading(false);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Failed to record payment."); return; }
    toast.success("Payment recorded.");
    setAddingPayment(false);
    setStandaloneForm({ amount: "", payment_method: "cash", transaction_id: "", notes: "", allocations: {} });
    router.refresh();
  }

  const pendingLineItems = lineItems.filter((li) => li.status !== "paid");

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Due", value: `₹${totalDue.toLocaleString("en-IN")}`, color: "text-foreground" },
          { label: "Paid", value: `₹${totalPaid.toLocaleString("en-IN")}`, color: "text-emerald-600" },
          { label: "Outstanding", value: `₹${outstanding.toLocaleString("en-IN")}`, color: outstanding > 0 ? "text-rose-600" : "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4 text-center shadow-sm">
            <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
        <FeesPieChart totalPaid={totalPaid} outstanding={outstanding} />
      </div>

      {/* Fee Line Items */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fee Line Items</h3>
          <button
            onClick={() => { setAddingFee(!addingFee); setFeeForm({ fee_type_id: "", total_amount: "", due_date: "" }); }}
            className="flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Fee
          </button>
        </div>

        {/* Add Fee inline form */}
        {addingFee && (
          <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-600">New Fee</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Fee Type *</label>
                <FeeTypeSelect
                  feeTypes={feeTypes}
                  value={feeForm.fee_type_id}
                  onChange={(v) => setFeeForm((f) => ({ ...f, fee_type_id: v }))}
                  required
                  className="mt-0.5 block w-56 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Amount (₹) *</label>
                <input
                  type="number" min={1}
                  value={feeForm.total_amount}
                  onChange={(e) => setFeeForm((f) => ({ ...f, total_amount: e.target.value }))}
                  placeholder="0"
                  className="mt-0.5 block w-28 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Due Date</label>
                <input
                  type="date"
                  value={feeForm.due_date}
                  onChange={(e) => setFeeForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="mt-0.5 block rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={handleAddFee}
                disabled={feeLoading}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {feeLoading ? "Saving…" : "Save"}
              </button>
              <button onClick={() => setAddingFee(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Fee Type", "Total (₹)", "Paid (₹)", "Due Date", "Status", "Added By", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lineItems.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No fee line items yet.</td></tr>
             ) : lineItems.map((li) => (
                <Fragment key={li.id}>
                  <tr className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button
                        className="font-medium text-indigo-600 hover:underline"
                        onClick={() => setExpandedLi(expandedLi === li.id ? null : li.id)}
                      >
                        {li.fee_type}
                      </button>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{li.total_amount.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-700">{li.amount_paid.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{li.due_date ? new Date(li.due_date).toLocaleDateString("en-IN") : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={li.status} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{li.added_by}</td>
                    <td className="px-4 py-3">
                      {li.status !== "paid" && (
                        <button
                          onClick={() => {
                            setRecordingFor(recordingFor?.id === li.id ? null : li);
                            setPayForm({ amount: "", payment_method: "cash", transaction_id: "", notes: "" });
                          }}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>

                  {expandedLi === li.id && (
                    <InlineFormRow key={`${li.id}-detail`} colSpan={7} color="bg-indigo-50" title="Line Item Details">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><span className="text-muted-foreground">Fee Type:</span> {li.fee_type}</div>
                        <div><span className="text-muted-foreground">Total:</span> ₹{li.total_amount.toLocaleString("en-IN")}</div>
                        <div><span className="text-muted-foreground">Paid:</span> ₹{li.amount_paid.toLocaleString("en-IN")}</div>
                        <div><span className="text-muted-foreground">Pending:</span> ₹{(li.total_amount - li.amount_paid).toLocaleString("en-IN")}</div>
                        <div><span className="text-muted-foreground">Due Date:</span> {li.due_date ?? "—"}</div>
                        <div><span className="text-muted-foreground">Added By:</span> {li.added_by}</div>
                      </div>
                    </InlineFormRow>
                  )}

                  {recordingFor?.id === li.id && (
                    <InlineFormRow key={`${li.id}-record`} colSpan={7} color="bg-blue-50" title="Record Payment">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Amount (₹) *</label>
                          <input
                            type="number" min={1} max={li.total_amount - li.amount_paid}
                            value={payForm.amount}
                            onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))}
                            placeholder={String(li.total_amount - li.amount_paid)}
                            className="mt-0.5 block w-28 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Method</label>
                          <select
                            value={payForm.payment_method}
                            onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                            className="mt-0.5 block rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                          >
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Receipt / Transaction ID</label>
                          <input
                            type="text"
                            value={payForm.transaction_id}
                            onChange={(e) => setPayForm((f) => ({ ...f, transaction_id: e.target.value }))}
                            placeholder="Optional"
                            className="mt-0.5 block w-36 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Notes</label>
                          <input
                            type="text"
                            value={payForm.notes}
                            onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                            placeholder="Optional"
                            className="mt-0.5 block w-36 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                          />
                        </div>
                        <button
                          onClick={() => handleRecordPayment(li)}
                          disabled={payLoading}
                          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {payLoading ? "Saving…" : "Save"}
                        </button>
                        <button onClick={() => setRecordingFor(null)} className="text-sm text-muted-foreground hover:text-foreground">
                          Cancel
                        </button>
                      </div>
                   </InlineFormRow>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Transactions */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payment Transactions</h3>
          {pendingLineItems.length > 0 && (
            <button
              onClick={() => { setAddingPayment(!addingPayment); setStandaloneForm({ amount: "", payment_method: "cash", transaction_id: "", notes: "", allocations: {} }); }}
              className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" /> Add Payment
            </button>
          )}
        </div>

        {/* Standalone Add Payment form */}
        {addingPayment && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-emerald-700">New Payment</p>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="text-xs text-muted-foreground">Total Amount (₹) *</label>
                <input
                  type="number" min={1}
                  value={standaloneForm.amount}
                  onChange={(e) => setStandaloneForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="mt-0.5 block w-28 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Method</label>
                <select
                  value={standaloneForm.payment_method}
                  onChange={(e) => setStandaloneForm((f) => ({ ...f, payment_method: e.target.value }))}
                  className="mt-0.5 block rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Receipt / Transaction ID</label>
                <input
                  type="text"
                  value={standaloneForm.transaction_id}
                  onChange={(e) => setStandaloneForm((f) => ({ ...f, transaction_id: e.target.value }))}
                  placeholder="Optional"
                  className="mt-0.5 block w-36 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <input
                  type="text"
                  value={standaloneForm.notes}
                  onChange={(e) => setStandaloneForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional"
                  className="mt-0.5 block w-36 rounded-md border border-input bg-white px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* Allocate per pending line item */}
            <p className="mb-2 text-xs font-medium text-muted-foreground">Allocate to fee line items *</p>
            <div className="space-y-2 mb-4">
              {pendingLineItems.map((li) => {
                const pending = li.total_amount - li.amount_paid;
                return (
                  <div key={li.id} className="flex items-center gap-3">
                    <span className="w-44 truncate text-sm">{li.fee_type}</span>
                    <span className="text-xs text-muted-foreground">pending ₹{pending.toLocaleString("en-IN")}</span>
                    <input
                      type="number" min={0} max={pending}
                      value={standaloneForm.allocations[li.id] ?? ""}
                      onChange={(e) => setStandaloneForm((f) => ({
                        ...f,
                        allocations: { ...f.allocations, [li.id]: e.target.value },
                      }))}
                      placeholder="0"
                      className="w-24 rounded-md border border-input bg-white px-3 py-1 text-sm"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddPayment}
                disabled={standaloneLoading}
                className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {standaloneLoading ? "Saving…" : "Save Payment"}
              </button>
              <button onClick={() => setAddingPayment(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Date", "Amount (₹)", "Method", "Mode", "Paid By", "Transaction ID", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payment transactions yet.</td></tr>
             ) : payments.map((p) => (
                <Fragment key={p.id}>
                  <tr className="hover:bg-muted/30">
                    <td className="px-4 py-3">{new Date(p.payment_date).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3 tabular-nums font-medium text-emerald-700">₹{p.total_amount.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">{METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.mode === "online" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-700"}`}>
                        {p.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3">{p.paid_by}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.transaction_id ?? p.razorpay_payment_id ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        className="text-sm font-medium text-indigo-600 hover:underline"
                        onClick={() => setExpandedPay(expandedPay === p.id ? null : p.id)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>

                  {expandedPay === p.id && (
                    <InlineFormRow key={`${p.id}-detail`} colSpan={7} color="bg-indigo-50" title="Payment Details">
                      <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div><span className="text-muted-foreground">Date:</span> {new Date(p.payment_date).toLocaleString("en-IN")}</div>
                        <div><span className="text-muted-foreground">Total Amount:</span> ₹{p.total_amount.toLocaleString("en-IN")}</div>
                        <div><span className="text-muted-foreground">Method:</span> {METHOD_LABELS[p.payment_method] ?? p.payment_method}</div>
                        <div><span className="text-muted-foreground">Mode:</span> {p.mode}</div>
                        <div><span className="text-muted-foreground">Paid By:</span> {p.paid_by}</div>
                        <div><span className="text-muted-foreground">Transaction ID:</span> {p.transaction_id ?? "—"}</div>
                        {p.razorpay_payment_id && (
                          <div><span className="text-muted-foreground">Razorpay ID:</span> {p.razorpay_payment_id}</div>
                        )}
                        {p.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {p.notes}</div>}
                      </div>
                      {p.line_items_covered.length > 0 && (
                        <>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">Applied to:</p>
                          <ul className="space-y-0.5">
                            {p.line_items_covered.map((lic, i) => (
                              <li key={i} className="flex max-w-xs justify-between text-sm">
                                <span>{lic.fee_type}</span>
                                <span className="font-medium text-emerald-700">₹{lic.amount_applied.toLocaleString("en-IN")}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </InlineFormRow>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
