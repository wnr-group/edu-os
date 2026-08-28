"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, FileCheck, FileX, MessageSquare, BellOff, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase";
import {
  loadNotifications,
  markRead,
  categoryFor,
  formatWhen,
  loadKycDocumentDetail,
  loadFeedbackDetail,
  NOTIFICATION_CATEGORIES,
  type NotificationRow,
  type KycDocumentDetail,
  type FeedbackDetail,
  type DetailResult,
} from "@/lib/notifications";
import { useNotifications } from "@/lib/notifications-context";

// Fire-and-forget, same shape as leave-inbox.tsx's own callLeaveNotify —
// acting on a leave request from here must tell the parent exactly like
// acting on it from the Leave page itself does.
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

// Resolves EVERY notification row tied to this entity (not just the
// clicking viewer's own row) — kyc-document-notify/feedback-notify fan out
// one row per recipient, so acting once must close it for every recipient,
// not just whoever happened to click. Awaited (not fire-and-forget) because
// the caller reloads the list right after, and needs the resolved text to
// already be in place.
async function resolveEntity(entityType: "kyc_document" | "feedback" | "leave_request", entityId: string): Promise<void> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notification-resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
  }).catch(() => {});
}

function dayBucket(iso: string): "Today" | "Yesterday" | "Earlier" {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

export function NotificationCenter({ feedbackHref, viewerRole }: { feedbackHref: string; viewerRole: string }) {
  const { refresh, decrementBy } = useNotifications();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, DetailResult<KycDocumentDetail | FeedbackDetail> | "loading">>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    setItems(await loadNotifications(100));
    setLoading(false);
    refresh();
  }

  // A card can go stale if the same leave request was already decided
  // elsewhere (e.g. the Leave Inbox page) before this list last refreshed —
  // the RPC then rejects with 'not_pending'. Rather than surface that raw
  // Postgres error string, treat it the same as a successful resolution:
  // the request itself is already settled, this view just hadn't heard yet.
  async function handleStaleLeaveDecision(n: NotificationRow) {
    if (!n.entity_id) return;
    toast("This leave request was already decided.");
    await resolveEntity("leave_request", n.entity_id);
    setBusyId(null);
    await load();
  }

  async function handleApproveLeave(n: NotificationRow) {
    if (!n.entity_id) return;
    setBusyId(n.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_leave", { p_request_id: n.entity_id });
    if (error) {
      if (error.message === "not_pending") { await handleStaleLeaveDecision(n); return; }
      setBusyId(null); toast.error(error.message); return;
    }
    toast.success("Leave approved — covered days marked Excused.");
    callLeaveNotify(n.entity_id);
    await resolveEntity("leave_request", n.entity_id);
    setBusyId(null);
    await load();
  }

  async function handleRejectLeave(n: NotificationRow) {
    if (!n.entity_id) return;
    setBusyId(n.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_leave", { p_request_id: n.entity_id, p_reason: rejectReason || null });
    if (error) {
      if (error.message === "not_pending") { setRejectingId(null); setRejectReason(""); await handleStaleLeaveDecision(n); return; }
      setBusyId(null); toast.error(error.message); return;
    }
    toast.success("Leave declined.");
    callLeaveNotify(n.entity_id);
    setRejectingId(null);
    setRejectReason("");
    await resolveEntity("leave_request", n.entity_id);
    setBusyId(null);
    await load();
  }

  async function handleVerifyDoc(n: NotificationRow) {
    if (!n.entity_id) return;
    setBusyId(n.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_documents", { p_ids: [n.entity_id] });
    if (error) { setBusyId(null); toast.error(error.message); return; }
    toast.success("Document verified.");
    await resolveEntity("kyc_document", n.entity_id);
    setBusyId(null);
    await load();
  }

  async function handleRejectDoc(n: NotificationRow) {
    if (!n.entity_id || !rejectReason.trim()) return;
    setBusyId(n.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("reject_document", { p_id: n.entity_id, p_reason: rejectReason.trim() });
    if (error) { setBusyId(null); toast.error(error.message); return; }
    toast.success("Document rejected.");
    setRejectingId(null);
    setRejectReason("");
    await resolveEntity("kyc_document", n.entity_id);
    setBusyId(null);
    await load();
  }

  async function handleCardClick(n: NotificationRow) {
    if (!n.is_read) {
      const ok = await markRead([n.id]);
      if (!ok) { toast.error("Couldn't mark this as read — try again."); return; }
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      decrementBy(1);
    }
  }

  // Recent Activity rows: same mark-as-read as handleCardClick, plus
  // toggling a detail panel sourced live from the referenced entity — the
  // short body text (e.g. "Document approved by Principal.") never changes,
  // this is purely additive context fetched on first expand and cached
  // after that.
  async function handleRecentClick(n: NotificationRow) {
    await handleCardClick(n);
    if (expandedId === n.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(n.id);
    if (n.entity_id && !detailCache[n.id]) {
      setDetailCache((prev) => ({ ...prev, [n.id]: "loading" }));
      // Always resolves to a concrete state (ok/feature_disabled/not_found)
      // — never left as "loading" once this settles, which is what let the
      // panel get stuck indefinitely before: a failed lookup used to just
      // delete the cache entry, and undefined rendered identically to the
      // still-fetching state.
      const result: DetailResult<KycDocumentDetail | FeedbackDetail> =
        n.entity_type === "kyc_document" ? await loadKycDocumentDetail(n.entity_id, n.school_id)
        : n.entity_type === "feedback" ? await loadFeedbackDetail(n.entity_id, n.school_id)
        : { kind: "not_found" };
      setDetailCache((prev) => ({ ...prev, [n.id]: result }));
    }
  }

  // Leave approval is class-teacher-only (see the leave_approval_class_teacher_only
  // migration) — a school_admin/principal/super_admin will never actually
  // receive a leave_requested notification under personal-only RLS, so the
  // category is hidden from their filter rather than offered as a dead
  // option. This is filter visibility only — RPC/RLS permissions are
  // unchanged, and if a leave_requested row somehow existed for a non-teacher
  // it would still appear under "All categories".
  const categories = [
    "all",
    ...new Set(
      Object.values(NOTIFICATION_CATEGORIES)
        .filter((c) => c.label !== "Leave" || viewerRole === "teacher")
        .map((c) => c.label)
    ),
  ];

  const filtered = useMemo(
    () =>
      items.filter((n) => {
        if (categoryFilter !== "all" && categoryFor(n.type).label !== categoryFilter) return false;
        if (unreadOnly && n.is_read) return false;
        if (dateFilter && new Date(n.created_at).toISOString().slice(0, 10) !== dateFilter) return false;
        return true;
      }),
    [items, categoryFilter, unreadOnly, dateFilter]
  );

  // A card leaves "Needs Action" the moment it's acted on (or manually
  // marked read) — is_read doubles as "handled" for actionable types,
  // rather than tracking a separate resolved state.
  const needsAction = filtered.filter((n) => categoryFor(n.type).actionable && !n.is_read);
  const recent = filtered.filter((n) => !(categoryFor(n.type).actionable && !n.is_read));

  const recentByDay = useMemo(() => {
    const groups: Record<string, NotificationRow[]> = { Today: [], Yesterday: [], Earlier: [] };
    for (const n of recent) groups[dayBucket(n.created_at)].push(n);
    return groups;
  }, [recent]);

  async function markAllVisibleRead() {
    const ids = filtered.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length === 0) return;
    const ok = await markRead(ids);
    if (!ok) { toast.error("Some notifications couldn't be marked read — try again."); }
    setItems((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, is_read: true } : x)));
    decrementBy(ids.length);
  }

  const unreadInView = filtered.some((n) => !n.is_read);

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="mt-1 text-sm text-muted-foreground">Approvals, submissions, and activity that need your attention.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            aria-label="Filter by date"
          />
          {dateFilter && (
            <button onClick={() => setDateFilter("")} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
              Clear
            </button>
          )}
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground">
            <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="h-3.5 w-3.5" />
            Unread only
          </label>
          {unreadInView && (
            <button onClick={markAllVisibleRead} className="text-sm font-semibold text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
      </div>

      {needsAction.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs Action</h2>
          <div className="space-y-2">
            {needsAction.map((n) => (
              <div key={n.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">{categoryFor(n.type).label}</span>
                      <span className="text-[11px] text-muted-foreground">{formatWhen(n.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-foreground">{n.body}</p>
                  </div>
                </div>

                {rejectingId === n.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason for rejecting…"
                      className="w-full rounded-lg border border-input bg-background p-2.5 text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="rounded-lg border border-input px-3 py-1.5 text-xs font-semibold">
                        Cancel
                      </button>
                      <button
                        onClick={() => (n.type === "leave_requested" ? handleRejectLeave(n) : handleRejectDoc(n))}
                        disabled={busyId === n.id || (n.type === "kyc_document_submitted" && !rejectReason.trim())}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === n.id ? "Submitting…" : "Confirm reject"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {n.type === "leave_requested" && (
                      <>
                        <button onClick={() => handleApproveLeave(n)} disabled={busyId === n.id} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                        <button onClick={() => setRejectingId(n.id)} disabled={busyId === n.id} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {n.type === "kyc_document_submitted" && (
                      <>
                        <button onClick={() => handleVerifyDoc(n)} disabled={busyId === n.id} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                          <FileCheck className="h-3.5 w-3.5" /> Verify
                        </button>
                        <button onClick={() => setRejectingId(n.id)} disabled={busyId === n.id} className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                          <FileX className="h-3.5 w-3.5" /> Reject
                        </button>
                      </>
                    )}
                    {(n.type === "feedback_contact" || n.type === "message_teacher") && (
                      <Link href={feedbackHref} onClick={() => handleCardClick(n)} className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
                        <MessageSquare className="h-3.5 w-3.5" /> Respond
                      </Link>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Activity</h2>
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card py-14 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-semibold text-foreground">You&apos;re all caught up.</p>
            <p className="text-xs text-muted-foreground">New activity will show up here.</p>
          </div>
        ) : (
          (["Today", "Yesterday", "Earlier"] as const).map((bucket) =>
            recentByDay[bucket].length === 0 ? null : (
              <div key={bucket} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">{bucket}</p>
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {recentByDay[bucket].map((n) => {
                    const expandable = n.entity_type === "kyc_document" || n.entity_type === "feedback";
                    const detail = detailCache[n.id];
                    return (
                      <div key={n.id}>
                        <button
                          onClick={() => handleRecentClick(n)}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 ${!n.is_read ? "bg-primary/[0.03]" : ""}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{categoryFor(n.type).label}</span>
                            </div>
                            <p className={`mt-0.5 text-sm ${n.is_read ? "text-muted-foreground" : "font-medium text-foreground"}`}>{n.body}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] text-muted-foreground">{formatWhen(n.created_at)}</span>
                            {expandable && (
                              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expandedId === n.id ? "rotate-180" : ""}`} />
                            )}
                          </div>
                        </button>
                        {expandedId === n.id && expandable && (
                          <div className="border-t border-border bg-muted/30 px-4 py-3">
                            {detail === "loading" || !detail ? (
                              <p className="text-xs text-muted-foreground">Loading details…</p>
                            ) : detail.kind === "feature_disabled" ? (
                              <p className="text-xs text-muted-foreground">
                                {n.entity_type === "kyc_document"
                                  ? "Document details are unavailable because KYC is not enabled for this school."
                                  : "Feedback details are unavailable because Feedback is not enabled for this school."}
                              </p>
                            ) : detail.kind === "not_found" ? (
                              <p className="text-xs text-muted-foreground">
                                {n.entity_type === "kyc_document" ? "This document is no longer available." : "This feedback item is no longer available."}
                              </p>
                            ) : n.entity_type === "kyc_document" ? (
                              <KycDetailPanel detail={detail.detail as KycDocumentDetail} />
                            ) : (
                              <FeedbackDetailPanel detail={detail.detail as FeedbackDetail} />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )
        )}
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-1.5 text-xs">
      <span className="shrink-0 font-semibold text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function KycDetailPanel({ detail }: { detail: KycDocumentDetail }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      <DetailRow label="Student" value={detail.studentName} />
      <DetailRow label="Document" value={detail.documentTypeName} />
      <DetailRow label="Status" value={detail.status === "verified" ? "Approved" : detail.status === "rejected" ? "Rejected" : "Pending"} />
      <DetailRow label={detail.status === "rejected" ? "Rejected by" : "Approved by"} value={detail.actorName ? `${detail.actorName} (${detail.actorRole})` : null} />
      <DetailRow label="Date/time" value={detail.actedAt ? new Date(detail.actedAt).toLocaleString("en-IN") : null} />
      {detail.rejectionReason && <DetailRow label="Reason" value={detail.rejectionReason} />}
    </div>
  );
}

function FeedbackDetailPanel({ detail }: { detail: FeedbackDetail }) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      <DetailRow label="From" value={detail.fromName} />
      <DetailRow label="Message" value={detail.message} />
      <DetailRow label="Status" value={detail.status === "responded" ? "Responded" : "Pending"} />
      <DetailRow label="Responded by" value={detail.respondedByName ? `${detail.respondedByName} (${detail.respondedByRole})` : null} />
      <DetailRow label="Response" value={detail.response} />
      <DetailRow label="Submitted" value={new Date(detail.createdAt).toLocaleString("en-IN")} />
      <DetailRow label="Responded" value={detail.respondedAt ? new Date(detail.respondedAt).toLocaleString("en-IN") : null} />
    </div>
  );
}
