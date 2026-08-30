"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, User } from "lucide-react";
import { createClient } from "@/lib/supabase";

export interface LeaveRow {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  className: string;
  parentName: string;
  fromDate: string;
  toDate: string;
  leaveType: string;
  note: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decisionNote: string | null;
}

function formatRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const fLabel = f.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (from === to) return fLabel;
  const tLabel = t.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `${fLabel}–${tLabel}`;
}
function daysCount(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
}

// approve_leave/reject_leave raise bare identifiers, not sentences — same
// map notification-center.tsx uses for the identical RPCs, so the same
// underlying condition reads the same way on both surfaces.
const LEAVE_ERRORS: Record<string, string> = {
  not_pending: "This request was already decided.",
  not_found: "This request no longer exists.",
  not_authorized: "You're not authorized to decide this request.",
};

export function LeaveInbox({ requests, viewerLabel }: { requests: LeaveRow[]; viewerLabel: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [classFilter, setClassFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const classes = useMemo(() => [...new Set(requests.map((r) => r.className))].sort(), [requests]);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => r.status === tab)
      .filter((r) => classFilter === "all" || r.className === classFilter)
      .filter((r) => typeFilter === "all" || r.leaveType === typeFilter)
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  }, [requests, tab, classFilter, typeFilter]);

  const selected = requests.find((r) => r.id === selectedId) ?? filtered[0] ?? null;

  const counts = {
    pending: requests.filter((r) => r.status === "pending").length,
    approved: requests.filter((r) => r.status === "approved").length,
    rejected: requests.filter((r) => r.status === "rejected").length,
  };

  function callLeaveNotify(leaveId: string) {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/leave-notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ leave_id: leaveId, event: "decided" }),
      }).catch(() => {});
    });
  }

  // Closes out the teacher-facing leave_requested notification this action
  // was taken from — same shape as notification-center.tsx's resolveEntity.
  // Awaited (unlike callLeaveNotify) so the resolve's own read of
  // leave_requests always happens before callLeaveNotify's insert of the
  // parent's separate leave_decided row for the same entity_id.
  async function resolveLeaveNotification(leaveId: string): Promise<void> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notification-resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ entity_type: "leave_request", entity_id: leaveId }),
    }).catch(() => {});
  }

  async function handleApprove(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_leave", { p_request_id: id });
    setBusy(false);
    if (error) {
      toast.error(LEAVE_ERRORS[error.message] ?? "Something went wrong. Please try again.");
      if (error.message === "not_pending") { await resolveLeaveNotification(id); router.refresh(); }
      return;
    }
    toast.success("Leave approved — covered days marked Excused.");
    await resolveLeaveNotification(id);
    callLeaveNotify(id);
    router.refresh();
  }

  async function handleReject(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_leave", { p_request_id: id, p_reason: rejectReason || null });
    setBusy(false);
    if (error) {
      toast.error(LEAVE_ERRORS[error.message] ?? "Something went wrong. Please try again.");
      if (error.message === "not_pending") { setRejecting(false); setRejectReason(""); await resolveLeaveNotification(id); router.refresh(); }
      return;
    }
    toast.success("Leave declined.");
    setRejecting(false);
    setRejectReason("");
    await resolveLeaveNotification(id);
    callLeaveNotify(id);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Leave</p>
          <h1 className="text-2xl font-bold text-foreground">Leave requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Approve or decline absence requests. Approving marks the covered days "Excused" — out of attendance % and risk.
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          <User className="h-3.5 w-3.5" /> {viewerLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
          {(["pending", "approved", "rejected"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold capitalize ${tab === t ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              {t} <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
            <option value="all">All sections</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
            <option value="all">Type: All</option>
            <option value="sick">Sick</option>
            <option value="casual">Casual</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <span className="text-sm font-semibold text-foreground capitalize">{tab} approval</span>
              <span className="ml-2 text-xs text-muted-foreground">· oldest first · {filtered.length} waiting</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">No {tab} requests.</div>
              )}
              {filtered.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(r.id);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/50 ${selected?.id === r.id ? "bg-muted/40" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {r.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{r.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 font-semibold uppercase text-red-700">{r.leaveType}</span>
                        {r.className} · {formatRange(r.fromDate, r.toDate)} ({daysCount(r.fromDate, r.toDate)} days)
                      </p>
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setSelectedId(r.id); setRejecting(true); }} disabled={busy} className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50">
                        <X className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleApprove(r.id)} disabled={busy} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
                        <Check className="h-3.5 w-3.5" /> Approve
                      </button>
                    </div>
                 )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          {selected ? (
            <div className="sticky top-4 space-y-4 rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                  {selected.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selected.studentName}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.className}{selected.rollNumber ? ` · Roll ${selected.rollNumber}` : ""}{selected.parentName ? ` · Parent: ${selected.parentName}` : ""}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dates</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatRange(selected.fromDate, selected.toDate)}</p>
                <p className="text-xs text-muted-foreground">{daysCount(selected.fromDate, selected.toDate)} full days</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</p>
                <span className="mt-1 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-semibold uppercase text-red-700">{selected.leaveType}</span>
              </div>

              {selected.note && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Note from parent</p>
                  <p className="mt-1 rounded-lg bg-muted/40 p-3 text-sm text-foreground">{selected.note}</p>
                </div>
              )}

              {selected.status === "pending" && !rejecting && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  Approving marks {formatRange(selected.fromDate, selected.toDate)} as <strong>Excused</strong> for {selected.studentName.split(" ")[0]} —
                  excluded from attendance % and risk. Any day already marked absent is corrected automatically.
                </div>
              )}

              {rejecting && selected.status === "pending" && (
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (shown to the parent)…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                  rows={3}
                />
              )}

              {selected.status === "pending" ? (
                <div className="flex gap-2">
                  {rejecting ? (
                    <>
                      <button onClick={() => setRejecting(false)} className="flex-1 rounded-lg border border-input py-2.5 text-sm font-semibold">Cancel</button>
                      <button onClick={() => handleReject(selected.id)} disabled={busy} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white">
                        {busy ? "Declining…" : "Confirm decline"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setRejecting(true)} className="flex-1 rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">
                        <X className="mr-1 inline h-3.5 w-3.5" /> Decline
                      </button>
                      <button onClick={() => handleApprove(selected.id)} disabled={busy} className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                        <Check className="mr-1 inline h-3.5 w-3.5" /> {busy ? "Approving…" : "Approve leave"}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className={`rounded-lg p-3 text-xs ${selected.status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                  {selected.status === "approved" ? "Approved — days marked Excused." : `Declined${selected.decisionNote ? `: "${selected.decisionNote}"` : "."}`}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Select a request to see details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}