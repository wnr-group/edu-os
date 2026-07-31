"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Coins, CheckCircle2, AlertTriangle, TrendingUp, Send, Download } from "lucide-react";
import { createClient } from "@/lib/supabase";

export interface ClassOption { id: string; name: string }
export interface FeeTypeOption { id: string; name: string }
export interface RawLineItem {
  id: string;
  studentId: string;
  studentName: string;
  classId: string | null;
  className: string;
  feeTypeId: string;
  totalAmount: number;
  paidAmount: number;
  dueDate: string | null;
  status: string;
}

interface StudentStatus {
  studentId: string;
  studentName: string;
  className: string;
  classId: string | null;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  isOverdue: boolean;
  daysOverdue: number;
}

interface Props {
  schoolId: string;
  rawLineItems: RawLineItem[];
  lastReminderByStudent: Record<string, string>;
  outcome: { collected7d: number; remindersThisWeek: number; paidWithin48h: number };
  classes: ClassOption[];
  feeTypes: FeeTypeOption[];
}

function formatLakh(n: number): string {
  return `₹${(n / 100000).toFixed(1)}L`;
}

function daysAgoLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Reminded today";
  return `Reminded ${days}d ago`;
}

// Mirrors the student_fee_status VIEW's own formula exactly, so switching the
// fee-type filter recomputes client-side without a server round trip, while
// staying numerically consistent with the DB view used elsewhere (e.g. the
// reminder edge function, which always uses the unfiltered total).
function computeStudentStatus(items: RawLineItem[], feeTypeFilter: string): StudentStatus[] {
  const relevant = feeTypeFilter === "all" ? items : items.filter((i) => i.feeTypeId === feeTypeFilter);
  const byStudent = new Map<
    string,
    { studentName: string; className: string; classId: string | null; totalBilled: number; totalPaid: number; earliestUnpaidDue: string | null }
  >();

  for (const i of relevant) {
    if (!byStudent.has(i.studentId)) {
      byStudent.set(i.studentId, {
        studentName: i.studentName,
        className: i.className,
        classId: i.classId,
        totalBilled: 0,
        totalPaid: 0,
        earliestUnpaidDue: null,
      });
    }
    const acc = byStudent.get(i.studentId)!;
    // A student's fee_line_items can come from more than one source (bulk
    // "Push to Class" sets class_id; some entries may not) — prefer the
    // first NON-NULL class_id seen instead of whatever the first row
    // happened to have, so a specific-class filter doesn't silently drop a
    // student whose matching row wasn't the first one iterated.
    if (!acc.classId && i.classId) {
      acc.classId = i.classId;
      acc.className = i.className;
    }
    acc.totalBilled += i.totalAmount;
    acc.totalPaid += i.paidAmount;
    if (i.status !== "paid" && i.dueDate) {
      if (!acc.earliestUnpaidDue || i.dueDate < acc.earliestUnpaidDue) acc.earliestUnpaidDue = i.dueDate;
    }
  }

  const today = new Date().toLocaleDateString("en-CA");
  return [...byStudent.entries()].map(([studentId, acc]) => {
    const outstanding = acc.totalBilled - acc.totalPaid;
    const isOverdue = outstanding > 0 && !!acc.earliestUnpaidDue && acc.earliestUnpaidDue < today;
    const daysOverdue = acc.earliestUnpaidDue
      ? Math.max(0, Math.floor((new Date(today).getTime() - new Date(acc.earliestUnpaidDue).getTime()) / 86400000))
      : 0;
    return {
      studentId,
      studentName: acc.studentName,
      className: acc.className,
      classId: acc.classId,
      totalBilled: acc.totalBilled,
      totalPaid: acc.totalPaid,
      outstanding,
      isOverdue,
      daysOverdue,
    };
  });
}

export function FeeStatusDashboard({ schoolId, rawLineItems, lastReminderByStudent, outcome, classes, feeTypes }: Props) {
  const router = useRouter();
  const [classFilter, setClassFilter] = useState<string>("all");
  const [feeTypeFilter, setFeeTypeFilter] = useState<string>("all");
  const [view, setView] = useState<"overdue" | "all">("overdue");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendingBulk, setSendingBulk] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Optimistic overlay on top of the server-provided lastReminderByStudent —
  // flips a row to "Reminded today" the instant a send succeeds, rather than
  // waiting on router.refresh() to round-trip fresh data from the server.
  const [justSent, setJustSent] = useState<Record<string, string>>({});

  const effectiveLastReminder = { ...lastReminderByStudent, ...justSent };
  // Recomputed whenever the fee-type filter changes — this is what makes the
  // dropdown a real filter instead of a UI placeholder.
  const allStudentStatus = useMemo(
    () => computeStudentStatus(rawLineItems, feeTypeFilter),
    [rawLineItems, feeTypeFilter]
  );

  const kpis = useMemo(() => {
    const totalBilled = allStudentStatus.reduce((s, r) => s + r.totalBilled, 0);
    const totalPaid = allStudentStatus.reduce((s, r) => s + r.totalPaid, 0);
    const totalOutstanding = allStudentStatus.reduce((s, r) => s + r.outstanding, 0);
    const overdueCount = allStudentStatus.filter((r) => r.isOverdue).length;
    const notYetDueCount = allStudentStatus.filter((r) => r.outstanding > 0 && !r.isOverdue).length;
    const collectionRate = totalBilled > 0 ? Math.round((totalPaid / totalBilled) * 100) : 0;
    return { totalBilled, totalPaid, totalOutstanding, overdueCount, notYetDueCount, collectionRate };
  }, [allStudentStatus]);

  const defaulters = useMemo(
    () => allStudentStatus.filter((r) => r.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding),
    [allStudentStatus]
  );

  const filtered = useMemo(() => {
    let list = defaulters;
    if (classFilter !== "all") list = list.filter((d) => d.classId === classFilter);
    if (view === "overdue") list = list.filter((d) => d.isOverdue);
    return list;
  }, [defaulters, classFilter, view]);

  const overdueCount = defaulters.filter((d) => d.isOverdue).length;
  const allOutstandingCount = defaulters.length;

  function toggleOne(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  async function sendReminders(studentIds: string[]) {
    if (studentIds.length === 0) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-fee-reminder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ student_ids: studentIds }),
    });

    // The Functions gateway returns plain text (e.g. "Function not found")
    // for some failure modes, not JSON — guard the parse so that shows a
    // readable message instead of a raw "Unexpected token" error.
    let data: { error?: string } = {};
    try {
      data = await res.json();
    } catch {
      throw new Error(
        res.status === 404
          ? "send-fee-reminder isn't deployed yet — run `supabase functions deploy send-fee-reminder`."
          : `Unexpected response from the server (status ${res.status}).`
      );
    }
    if (!res.ok) throw new Error(data.error ?? "Failed to send reminders");
    return data;
  }

  async function handleBulkSend() {
    if (selected.size === 0) return;
    if (!confirm(`Send a payment reminder to ${selected.size} parent${selected.size !== 1 ? "s" : ""}?`)) return;
    setSendingBulk(true);
    try {
      await sendReminders([...selected]);
      const now = new Date().toISOString();
      setJustSent((prev) => {
        const next = { ...prev };
        for (const id of selected) next[id] = now;
        return next;
      });
      toast.success(`Reminder sent to ${selected.size} parent${selected.size !== 1 ? "s" : ""}.`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminders");
    } finally {
      setSendingBulk(false);
    }
  }

  async function handleSingleSend(studentId: string) {
    setSendingId(studentId);
    try {
      await sendReminders([studentId]);
      setJustSent((prev) => ({ ...prev, [studentId]: new Date().toISOString() }));
      toast.success("Reminder sent.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminder");
    } finally {
      setSendingId(null);
    }
  }

  function handleExport() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const rowsHtml = filtered
      .map(
        (d) => `<tr>
          <td style="border:1px solid #e5e7eb;padding:8px;">${d.studentName}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${d.className}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">₹${d.outstanding.toLocaleString("en-IN")}</td>
          <td style="border:1px solid #e5e7eb;padding:8px;">${d.isOverdue ? `${d.daysOverdue} days` : "—"}</td>
        </tr>`
      )
      .join("");
    printWindow.document.write(`
      <html><head><title>Fee Status</title>
      <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;}
      table{width:100%;border-collapse:collapse;} th{border:1px solid #e5e7eb;padding:8px;background:#f8fafc;text-align:left;}</style>
      </head><body><h1>Fee Status</h1>
      <table><thead><tr><th>Student</th><th>Class</th><th>Outstanding</th><th>Overdue</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  const selectClassName =
    "rounded-lg border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Fees › Status</p>
          <h1 className="text-2xl font-bold text-gray-900">Fee status</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Where collection stands right now — and a one-click nudge for the parents who owe.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={selectClassName}>
            <option value="all">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select value={feeTypeFilter} onChange={(e) => setFeeTypeFilter(e.target.value)} className={selectClassName}>
            <option value="all">Fee type: All</option>
            {feeTypes.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Coins className="h-4 w-4" /> Total billed
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{formatLakh(kpis.totalBilled)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Collected
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{formatLakh(kpis.totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Outstanding
          </div>
          <p className="mt-2 text-2xl font-bold text-red-600">{formatLakh(kpis.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{kpis.overdueCount} overdue · {kpis.notYetDueCount} not yet due</p>
        </div>
        <div className="rounded-xl bg-indigo-600 p-5 text-white">
          <div className="flex items-center gap-2 text-sm text-indigo-100">
            <TrendingUp className="h-4 w-4" /> Collection rate
          </div>
          <p className="mt-2 text-2xl font-bold">{kpis.collectionRate}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/25">
            <div className="h-1.5 rounded-full bg-white" style={{ width: `${kpis.collectionRate}%` }} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 text-emerald-700">
          <TrendingUp className="h-4 w-4" /> <strong>₹{outcome.collected7d.toLocaleString("en-IN")}</strong> collected in the last 7 days
        </span>
        <span className="flex items-center gap-1.5 text-emerald-700">
          <Send className="h-4 w-4" /> <strong>{outcome.remindersThisWeek}</strong> reminders sent this week
        </span>
        <span className="flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> <strong>{outcome.paidWithin48h}</strong> paid within 48h of a reminder
        </span>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">Defaulters</h2>
            <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
              <button
                onClick={() => setView("overdue")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "overdue" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                Overdue <span className="rounded-full bg-red-100 px-1.5 text-red-700">{overdueCount}</span>
              </button>
              <button
                onClick={() => setView("all")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "all" ? "bg-card shadow-sm" : "text-muted-foreground"}`}
              >
                All outstanding <span className="rounded-full bg-muted px-1.5">{allOutstandingCount}</span>
              </button>
            </div>
          </div>
          <span className="text-xs font-medium text-muted-foreground">Sorted by amount owed</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((d) => d.studentId)) : new Set())}
            />
            <span className="text-sm text-muted-foreground">{selected.size} parents selected</span>
            <button
              onClick={handleBulkSend}
              disabled={selected.size === 0 || sendingBulk}
              className="ml-2 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> {sendingBulk ? "Sending…" : "Send payment reminder"}
            </button>
          </div>
          <span className="text-xs text-muted-foreground">App push + in-app · parents can pay in one tap</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-5 py-2" />
                <th className="px-2 py-2">Student</th>
                <th className="px-2 py-2">Class</th>
                <th className="px-2 py-2">Outstanding</th>
                <th className="px-2 py-2">Overdue</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((d) => {
                const lastReminderAt = effectiveLastReminder[d.studentId] ?? null;
                return (
                  <tr key={d.studentId}>
                    <td className="px-5 py-3">
                      <input type="checkbox" checked={selected.has(d.studentId)} onChange={() => toggleOne(d.studentId)} />
                    </td>
                    <td className="px-2 py-3 font-medium text-foreground">{d.studentName}</td>
                    <td className="px-2 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{d.className}</span>
                    </td>
                    <td className="px-2 py-3 font-semibold text-red-600">₹{d.outstanding.toLocaleString("en-IN")}</td>
                    <td className="px-2 py-3">
                      {d.isOverdue ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{d.daysOverdue} days</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      {lastReminderAt ? (
                        <span className="text-xs font-medium text-indigo-600">{daysAgoLabel(lastReminderAt)}</span>
                      ) : (
                        <button
                          onClick={() => handleSingleSend(d.studentId)}
                          disabled={sendingId === d.studentId}
                          className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-40"
                        >
                          <Send className="h-3 w-3" /> {sendingId === d.studentId ? "Sending…" : "Remind"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    No {view === "overdue" ? "overdue" : "outstanding"} students for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <span>
          <strong>Facts now, prediction later.</strong> Every figure is a live rollup of fee line-items & payments —
          overdue is computed on read (owing & past due date), never a stored status, so it's always accurate with no
          nightly job. Reminders are transactional and send directly (with a confirm). The "likely to default" risk
          score is a separate Insights feature, built on top of this later.
        </span>
      </div>
    </div>
  );
}