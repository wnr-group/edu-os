"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, User, MapPin, Video, ChevronRight, CalendarX } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { ScheduleMeetingDrawer } from "./schedule-meeting-drawer";
import { PtmBookingCard } from "./ptm-booking-card";
import { PtmSlotsPanel } from "./ptm-slots-panel";
import type { PtmSectionOption, PtmStudentOption, PtmTeacherOption, PtmSubjectOption, PtmBookingRow, PtmSlotGroup } from "@/lib/ptm";

export interface PtmRow {
  id: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  className: string;
  subjectName: string | null;
  scheduledDate: string;
  startTime: string;
  durationMinutes: number;
  meetingMode: "in_person" | "online";
  location: string | null;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  cancelledReason: string | null;
  hasFeedback: boolean;
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

const STATUS_STYLE: Record<PtmRow["status"], string> = {
  scheduled: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
  no_show: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<PtmRow["status"], string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

// Same local-date helpers as schedule-meeting-drawer.tsx — duplicated
// rather than shared since they're a handful of lines and this avoids a
// cross-component import for something this small.
function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowLocalTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function isPastDateTime(date: string, time: string): boolean {
  if (!date || !time) return false;
  const today = todayLocal();
  if (date < today) return true;
  if (date > today) return false;
  return time < nowLocalTime();
}

// Fire-and-forget, mirrors leave-inbox.tsx's callLeaveNotify.
function callPtmNotify(meetingId: string, event: "scheduled" | "rescheduled" | "cancelled") {
  const supabase = createClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ptm-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ meeting_id: meetingId, event }),
    }).catch(() => {});
  });
}

export function PtmInbox({
  meetings,
  bookings,
  slotGroups,
  schoolId,
  currentUserId,
  viewerLabel,
  schedulingContext,
  basePath,
  canEditFeedback,
}: {
  meetings: PtmRow[];
  /** Phase 4 — booking-origin meetings (booking_slot_id IS NOT NULL). Same rows already appear in the Scheduled/Completed/Cancelled tabs via `meetings` above; this is a separate cross-cutting view for the acknowledgement workflow, not a different bucket. */
  bookings: PtmBookingRow[];
  /** Phase 4 refinement — staff-published slots (open/booked, withdrawn excluded), grouped by teacher+section+date. Never touches `meetings` — an open slot only becomes a ptm_meetings row once booked. */
  slotGroups: PtmSlotGroup[];
  /** Needed by the Bookings tab's detail panel to look up the school's admin/principal roster for acknowledgement. */
  schoolId: string;
  /** The signed-in viewer's own id — used to know which acknowledgement roster row is "me" and to optimistically clear this viewer's own unread state on acknowledge. Kept as its own prop rather than reading schedulingContext.currentUserId since that object is nullable. */
  currentUserId: string;
  viewerLabel: string;
  schedulingContext: {
    sections: PtmSectionOption[];
    students: PtmStudentOption[];
    teachers: PtmTeacherOption[];
    subjects: PtmSubjectOption[];
    allowBulk: boolean;
    bulkTeacherLocked: boolean;
    currentUserId: string;
  } | null;
  /** Role-scoped route prefix ("/admin/ptm", "/teacher/ptm", "/principal/ptm") — every role has its own meeting-detail route so admin/principal never depend on the teacher-context switch to view feedback. */
  basePath: string;
  /** True only on the teacher route — every row there is the viewing teacher's own meeting (RLS already guarantees this), so this drives the Add/Edit vs. View/Pending label. The actual edit permission is re-derived server-side in PtmMeetingDetail regardless. */
  canEditFeedback: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"scheduled" | "available_slots" | "bookings" | "completed" | "cancelled" | "no_show">("scheduled");
  const [classFilter, setClassFilter] = useState("all");
  // Empty string = no date filter (every tab shows all dates) — the
  // sensible default, matching pre-existing behavior exactly for anyone
  // who never touches this control.
  const [dateFilter, setDateFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Bulk cancellation — checkbox selection (Scheduled tab only) and the
  // "cancel by class/section" shortcut both fund the same confirmation
  // step and the same RPC call; only the set of ids staged differs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelTarget, setBulkCancelTarget] = useState<{ ids: string[]; label: string } | null>(null);
  const [bulkCancelReason, setBulkCancelReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function selectTab(t: typeof tab) {
    setTab(t);
    setSelectedIds(new Set());
  }

  function selectClassFilter(c: string) {
    setClassFilter(c);
    setSelectedIds(new Set());
  }

  function selectDateFilter(d: string) {
    setDateFilter(d);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const classes = useMemo(
    () => [...new Set([...meetings.map((m) => m.className), ...bookings.map((b) => b.className), ...slotGroups.map((g) => g.className)])].sort(),
    [meetings, bookings, slotGroups]
  );

  // Scoped by every filter except the tab itself — the tab IS the
  // scheduled/completed/cancelled/no_show split, so the four badge counts
  // below are computed from this (not from `filtered`, which additionally
  // narrows to the active tab and would make the other tabs' counts
  // collapse toward zero). Class and date filters compose — both apply
  // together, same AND-of-independent-filters shape either one already had
  // alone.
  const classScoped = useMemo(() => {
    return meetings
      .filter((m) => classFilter === "all" || m.className === classFilter)
      .filter((m) => !dateFilter || m.scheduledDate === dateFilter);
  }, [meetings, classFilter, dateFilter]);

  // no_show now has its own tab (was previously lumped into "cancelled") —
  // ptm_meeting_status has held both as distinct values since Phase 1, this
  // is a UI-only split, tab values map 1:1 onto PtmRow.status.
  const filtered = useMemo(() => {
    if (tab === "available_slots" || tab === "bookings") return [];
    return classScoped
      .filter((m) => m.status === tab)
      .sort((a, b) => (a.scheduledDate + a.startTime).localeCompare(b.scheduledDate + b.startTime));
  }, [classScoped, tab]);

  const selected = meetings.find((m) => m.id === selectedId) ?? filtered[0] ?? null;

  const counts = {
    scheduled: classScoped.filter((m) => m.status === "scheduled").length,
    completed: classScoped.filter((m) => m.status === "completed").length,
    cancelled: classScoped.filter((m) => m.status === "cancelled").length,
    no_show: classScoped.filter((m) => m.status === "no_show").length,
  };

  // Bookings: same class + date filters, own list — kept separate from
  // `filtered`/`counts` above rather than unified, since PtmRow and
  // PtmBookingRow are different shapes (a booking's row already carries its
  // own status badge and acknowledgement state, not a
  // scheduled/completed/cancelled split).
  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => classFilter === "all" || b.className === classFilter)
      .filter((b) => !dateFilter || b.scheduledDate === dateFilter)
      .sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
  }, [bookings, classFilter, dateFilter]);

  // Available Slots: same class + date filters, own list. Never overlaps
  // with `meetings` — a group only exists here while at least one of its
  // slots is still open or booked (withdrawn-only groups vanish from
  // loadPtmAvailableSlots itself). Each group already has one
  // scheduledDate, so date filtering is a direct equality check.
  const filteredSlotGroups = useMemo(() => {
    return slotGroups
      .filter((g) => classFilter === "all" || g.className === classFilter)
      .filter((g) => !dateFilter || g.scheduledDate === dateFilter);
  }, [slotGroups, classFilter, dateFilter]);

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? filteredBookings[0] ?? null;
  // Meeting ids the viewer has just acknowledged this session, ahead of the
  // background router.refresh() that eventually makes `bookings` itself
  // reflect it — see handleAcknowledged below. Once the refresh lands,
  // `bookings` already agrees, so entries here are just harmless duplicates.
  const [locallyAcked, setLocallyAcked] = useState<Set<string>>(new Set());
  const unacknowledgedCount = filteredBookings.filter((b) => !b.acknowledgedByMe && !locallyAcked.has(b.id)).length;

  function handleAcknowledged(meetingId: string) {
    setLocallyAcked((prev) => new Set(prev).add(meetingId));
    router.refresh();
  }

  async function handleCancel(id: string) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("cancel_ptm_meeting", { p_meeting_id: id, p_reason: cancelReason || null });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Meeting cancelled.");
    callPtmNotify(id, "cancelled");
    setCancelling(false);
    setCancelReason("");
    router.refresh();
  }

  async function handleReschedule(id: string) {
    if (!newDate || !newTime) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reschedule_ptm_meeting", { p_meeting_id: id, p_scheduled_date: newDate, p_start_time: newTime });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Meeting rescheduled.");
    callPtmNotify(id, "rescheduled");
    setRescheduling(false);
    setNewDate("");
    setNewTime("");
    router.refresh();
  }

  async function handleStatus(id: string, status: "completed" | "no_show") {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("mark_ptm_completed", { p_meeting_id: id, p_status: status });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "completed" ? "Marked completed." : "Marked no-show.");
    router.refresh();
  }

  async function confirmBulkCancel() {
    if (!bulkCancelTarget) return;
    setBulkBusy(true);
    const supabase = createClient();
    const { data: cancelledIds, error } = await supabase.rpc("bulk_cancel_ptm_meetings", {
      p_meeting_ids: bulkCancelTarget.ids,
      p_reason: bulkCancelReason || null,
    });
    setBulkBusy(false);
    if (error) { toast.error(error.message); return; }
    const ids = (cancelledIds ?? []) as string[];
    const requested = bulkCancelTarget.ids.length;
    // The RPC skips anything no longer 'scheduled' or outside the caller's
    // authorization rather than failing the whole batch — surface that
    // instead of silently reporting an inflated count.
    if (ids.length < requested) {
      toast.success(`${ids.length} of ${requested} meeting${requested === 1 ? "" : "s"} cancelled (${requested - ids.length} could not be cancelled).`);
    } else {
      toast.success(`${ids.length} meeting${ids.length === 1 ? "" : "s"} cancelled.`);
    }
    // Fire-and-forget per meeting, same as bulk scheduling's own notify loop.
    for (const id of ids) callPtmNotify(id, "cancelled");
    setBulkCancelTarget(null);
    setBulkCancelReason("");
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Communication</p>
          <h1 className="text-2xl font-bold text-foreground">Parent-Teacher Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Schedule meetings, track status, and record feedback after they happen.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <User className="h-3.5 w-3.5" /> {viewerLabel}
          </span>
          {schedulingContext && (
            <button
              onClick={() => setShowSchedule(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Schedule meeting
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-xl bg-muted p-1">
          <button
            onClick={() => selectTab("scheduled")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "scheduled" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            Scheduled <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{counts.scheduled}</span>
          </button>
          <button
            onClick={() => selectTab("available_slots")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "available_slots" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            Available Slots <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{filteredSlotGroups.reduce((n, g) => n + g.slots.length, 0)}</span>
          </button>
          <button
            onClick={() => selectTab("bookings")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "bookings" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            Bookings <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{filteredBookings.length}</span>
            {unacknowledgedCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label={`${unacknowledgedCount} unacknowledged`} />}
          </button>
          <button
            onClick={() => selectTab("completed")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "completed" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            Completed <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{counts.completed}</span>
          </button>
          <button
            onClick={() => selectTab("cancelled")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "cancelled" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            Cancelled <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{counts.cancelled}</span>
          </button>
          <button
            onClick={() => selectTab("no_show")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "no_show" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
          >
            No-show <span className="rounded-full bg-muted-foreground/10 px-1.5 text-xs">{counts.no_show}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <select value={classFilter} onChange={(e) => selectClassFilter(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm">
            <option value="all">All sections</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => selectDateFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
              aria-label="Filter by date"
            />
            {dateFilter && (
              <button
                onClick={() => selectDateFilter("")}
                title="Clear date filter"
                aria-label="Clear date filter"
                className="rounded-lg border border-input bg-background p-1.5 text-muted-foreground hover:bg-muted"
              >
                <CalendarX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {tab === "scheduled" && (selectedIds.size > 0 || ((classFilter !== "all" || dateFilter) && filtered.length > 0)) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          {selectedIds.size > 0 && (
            <button
              onClick={() => setBulkCancelTarget({ ids: [...selectedIds], label: `Cancel ${selectedIds.size} selected meeting${selectedIds.size === 1 ? "" : "s"}?` })}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Bulk cancel ({selectedIds.size} selected)
            </button>
          )}
          {(classFilter !== "all" || dateFilter) && filtered.length > 0 && (() => {
            const scopeLabel = [classFilter !== "all" ? classFilter : null, dateFilter ? formatDate(dateFilter) : null].filter(Boolean).join(" on ");
            return (
              <button
                onClick={() => setBulkCancelTarget({ ids: filtered.map((m) => m.id), label: `Cancel ${filtered.length} scheduled meeting${filtered.length === 1 ? "" : "s"} for ${scopeLabel}?` })}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Cancel all {filtered.length} scheduled for {scopeLabel}
              </button>
            );
          })()}
        </div>
      )}

      {bulkCancelTarget && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">{bulkCancelTarget.label}</p>
          <p className="mt-1 text-xs text-red-700">Only meetings still scheduled and within your authorization will be cancelled — anything already completed or cancelled is skipped automatically.</p>
          <textarea
            value={bulkCancelReason}
            onChange={(e) => setBulkCancelReason(e.target.value)}
            placeholder="Reason (optional, applied to all)…"
            className="mt-3 w-full rounded-lg border border-input bg-background p-2.5 text-sm"
            rows={2}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setBulkCancelTarget(null); setBulkCancelReason(""); }} className="flex-1 rounded-lg border border-input bg-card py-2 text-sm font-semibold sm:flex-none sm:px-4">
              Back
            </button>
            <button onClick={confirmBulkCancel} disabled={bulkBusy} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 sm:flex-none sm:px-4">
              {bulkBusy ? "Cancelling…" : "Confirm cancel"}
            </button>
          </div>
        </div>
      )}

      {tab === "available_slots" ? (
        <PtmSlotsPanel groups={filteredSlotGroups} onChanged={() => router.refresh()} />
      ) : tab === "bookings" ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <span className="text-sm font-semibold text-foreground">Bookings</span>
                <span className="ml-2 text-xs text-muted-foreground">· {filteredBookings.length} booking{filteredBookings.length === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-border">
                {filteredBookings.length === 0 && (
                  <div className="px-5 py-10 text-center text-sm text-muted-foreground">No parent-booked meetings yet.</div>
                )}
                {filteredBookings.map((b) => (
                  <div
                    key={b.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedBookingId(b.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedBookingId(b.id); } }}
                    className={`flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/50 ${selectedBooking?.id === b.id ? "bg-muted/40" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {b.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{b.studentName}</p>
                        <p className="text-xs text-muted-foreground">
                          {b.className} · with {b.teacherName} · {formatDate(b.scheduledDate)} at {formatTime(b.startTime)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!b.acknowledgedByMe && !locallyAcked.has(b.id) && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="Unacknowledged" />}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[b.status]}`}>
                        {STATUS_LABEL[b.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            {selectedBooking ? (
              <PtmBookingCard
                key={selectedBooking.id}
                booking={selectedBooking}
                schoolId={schoolId}
                currentUserId={currentUserId}
                onAcknowledged={handleAcknowledged}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Select a booking to see details.
              </div>
            )}
          </div>
        </div>
      ) : (
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <span className="text-sm font-semibold text-foreground capitalize">{tab}</span>
              <span className="ml-2 text-xs text-muted-foreground">· {filtered.length} meeting{filtered.length === 1 ? "" : "s"}</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">No {tab} meetings.</div>
              )}
              {filtered.map((m) => (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(m.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(m.id); } }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left hover:bg-muted/50 ${selected?.id === m.id ? "bg-muted/40" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    {tab === "scheduled" && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelected(m.id)}
                        className="h-4 w-4 shrink-0 rounded border-input"
                        aria-label={`Select ${m.studentName}'s meeting for bulk cancel`}
                      />
                    )}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {m.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{m.studentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.className} · with {m.teacherName} · {formatDate(m.scheduledDate)} at {formatTime(m.startTime)}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${STATUS_STYLE[m.status]}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
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
                  <p className="text-xs text-muted-foreground">{selected.className}{selected.subjectName ? ` · ${selected.subjectName}` : ""}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(selected.scheduledDate)} · {formatTime(selected.startTime)}</p>
                <p className="text-xs text-muted-foreground">{selected.durationMinutes} minutes with {selected.teacherName}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                  {selected.meetingMode === "online" ? <Video className="h-3.5 w-3.5 text-muted-foreground" /> : <MapPin className="h-3.5 w-3.5 text-muted-foreground" />}
                  {selected.location || (selected.meetingMode === "online" ? "Online — link to be shared" : "Not specified")}
                </p>
              </div>

              {selected.status === "cancelled" && selected.cancelledReason && (
                <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">Cancelled: {selected.cancelledReason}</div>
              )}

              {cancelling && selected.status === "scheduled" && (
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason (optional)…"
                  className="w-full rounded-lg border border-input bg-background p-3 text-sm"
                  rows={2}
                />
              )}

              {rescheduling && selected.status === "scheduled" && (
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={newDate} min={todayLocal()} onChange={(e) => setNewDate(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                  <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm" />
                </div>
              )}

              {selected.status === "scheduled" ? (
                <div className="space-y-2">
                  {cancelling ? (
                    <div className="flex gap-2">
                      <button onClick={() => setCancelling(false)} className="flex-1 rounded-lg border border-input py-2.5 text-sm font-semibold">Back</button>
                      <button onClick={() => handleCancel(selected.id)} disabled={busy} className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white">
                        {busy ? "Cancelling…" : "Confirm cancel"}
                      </button>
                    </div>
                  ) : rescheduling ? (
                    <div className="flex gap-2">
                      <button onClick={() => { setRescheduling(false); setNewDate(""); setNewTime(""); }} className="flex-1 rounded-lg border border-input py-2.5 text-sm font-semibold">Back</button>
                      <button
                        onClick={() => handleReschedule(selected.id)}
                        disabled={busy || !newDate || !newTime || isPastDateTime(newDate, newTime)}
                        className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Confirm new time"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <button onClick={() => handleStatus(selected.id, "no_show")} disabled={busy} className="flex-1 rounded-lg border border-input py-2.5 text-sm font-semibold hover:bg-muted">
                          No-show
                        </button>
                        <button onClick={() => handleStatus(selected.id, "completed")} disabled={busy} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                          <Check className="h-3.5 w-3.5" /> Mark completed
                        </button>
                      </div>
                      <button onClick={() => setRescheduling(true)} className="w-full rounded-lg border border-input py-2 text-sm font-semibold text-foreground hover:bg-muted">
                        Reschedule
                      </button>
                      <button onClick={() => setCancelling(true)} className="w-full rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                        <X className="mr-1 inline h-3.5 w-3.5" /> Cancel meeting
                      </button>
                    </>
                  )}
                </div>
              ) : (selected.status === "completed" || selected.status === "no_show") ? (
                <Link
                  href={`${basePath}/${selected.id}`}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                >
                  {canEditFeedback
                    ? (selected.hasFeedback ? "View / edit feedback" : "Add feedback")
                    : (selected.hasFeedback ? "View feedback" : "Feedback pending")}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              Select a meeting to see details.
            </div>
          )}
        </div>
      </div>
      )}

      {showSchedule && schedulingContext && (
        <ScheduleMeetingDrawer
          {...schedulingContext}
          onClose={() => setShowSchedule(false)}
          onScheduled={() => { setShowSchedule(false); router.refresh(); }}
        />
      )}
    </div>
  );
}
