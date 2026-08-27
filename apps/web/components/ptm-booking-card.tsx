"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, User, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { PtmBookingRow } from "@/lib/ptm";

// The shared browser client (apps/web/lib/supabase/index.ts) is a singleton
// whose x-school-id/x-active-role headers are frozen at the FIRST-EVER
// createClient() call in a tab — a known, separately-tracked issue (see PR
// review discussion). If a teacher logs out and a school_admin/principal
// logs in in the same tab, this card's requests would otherwise keep
// carrying the teacher's stale scope headers, and every RLS/RPC check here
// that depends on get_my_role()/get_my_school_id() (ptm_ack_select,
// user_roles_select, profiles_select, acknowledge_ptm_booking) would
// resolve against the wrong identity until a hard refresh. Rather than fix
// the shared client (out of scope for this PR), each affected request below
// is given fresh headers via the query builder's own per-request
// .setHeader(), using the exact same cookie-reading logic as the shared
// client's scopeHeaders() — deliberately not imported/duplicated as a
// module, just applied narrowly where this card actually needs it.
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}
function currentScopeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const schoolId = readCookie("x-school-id");
  const role = readCookie("x-active-role");
  if (schoolId) headers["x-school-id"] = schoolId;
  if (role) headers["x-active-role"] = role;
  return headers;
}
function withFreshScope<T extends { setHeader(name: string, value: string): T }>(builder: T): T {
  for (const [name, value] of Object.entries(currentScopeHeaders())) {
    builder = builder.setHeader(name, value);
  }
  return builder;
}

function formatDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatDateTime(d: string): string {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m} ${ampm}`;
}

interface RosterEntry {
  userId: string;
  fullName: string;
  role: string;
  acknowledgedAt: string | null;
}

const ROLE_LABEL: Record<string, string> = { teacher: "Teacher", school_admin: "Admin", principal: "Principal" };

// Roster is the meeting's own teacher plus every active school_admin/
// principal in the school — super_admin is deliberately not on it (§10
// decision 3, not a day-to-day school operator). Queried client-side:
// user_roles_select's RLS already lets any signed-in staff member in a
// school read every role row for that same school, so this needs no new
// server loader.
async function loadRoster(schoolId: string, teacherId: string, meetingId: string): Promise<RosterEntry[]> {
  const supabase = createClient();

  const { data: staffRoles } = await withFreshScope(
    supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .in("role", ["school_admin", "principal"])
  );

  const roleById = new Map<string, string>();
  roleById.set(teacherId, "teacher");
  for (const r of staffRoles ?? []) roleById.set(r.user_id, r.role);
  const rosterIds = [...roleById.keys()];

  const [{ data: profiles }, { data: acks }] = await Promise.all([
    withFreshScope(supabase.from("profiles").select("id, full_name").in("id", rosterIds)),
    withFreshScope(supabase.from("ptm_booking_acknowledgements").select("user_id, acknowledged_at").eq("meeting_id", meetingId)),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? "—"]));
  const ackByUser = new Map((acks ?? []).map((a) => [a.user_id, a.acknowledged_at]));

  return rosterIds
    .map((id) => ({ userId: id, fullName: nameById.get(id) ?? "—", role: roleById.get(id) ?? "—", acknowledgedAt: ackByUser.get(id) ?? null }))
    .sort((a, b) => (a.role === "teacher" ? -1 : b.role === "teacher" ? 1 : a.fullName.localeCompare(b.fullName)));
}

export function PtmBookingCard({
  booking,
  schoolId,
  currentUserId,
  onAcknowledged,
}: {
  booking: PtmBookingRow;
  schoolId: string;
  currentUserId: string;
  /** Called with the meeting id right after a successful acknowledge, so the parent can optimistically clear this booking's unread state (e.g. the tab's yellow dot) without waiting on the background refresh below. */
  onAcknowledged: (meetingId: string) => void;
}) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);
  // Mirrors booking.acknowledgedByMe but updated immediately on a successful
  // acknowledge — the prop only catches up once router.refresh() (triggered
  // via onAcknowledged) round-trips to the server, which previously made the
  // card look unresponsive until a manual page reload.
  const [ackedByMe, setAckedByMe] = useState(booking.acknowledgedByMe);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRoster(null);
    setAckedByMe(booking.acknowledgedByMe);
    loadRoster(schoolId, booking.teacherId, booking.id).then((r) => {
      if (!cancelled) { setRoster(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [booking.id, booking.teacherId, booking.acknowledgedByMe, schoolId]);

  async function handleAcknowledge() {
    setAcking(true);
    const supabase = createClient();
    const { error } = await withFreshScope(supabase.rpc("acknowledge_ptm_booking", { p_meeting_id: booking.id }));
    setAcking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Acknowledged.");
    // Immediate local update — both the roster row for the current viewer
    // and the button/confirmation banner below — so the card reflects the
    // change without waiting on the parent's refresh to land.
    setAckedByMe(true);
    setRoster((prev) => prev?.map((r) => (r.userId === currentUserId ? { ...r, acknowledgedAt: new Date().toISOString() } : r)) ?? prev);
    onAcknowledged(booking.id);
  }

  return (
    <div className="sticky top-4 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
          {booking.studentName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        <div>
          <p className="font-semibold text-foreground">{booking.studentName}</p>
          <p className="text-xs text-muted-foreground">{booking.className}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</p>
        <p className="mt-1 text-sm font-semibold text-foreground">{formatDate(booking.scheduledDate)} · {formatTime(booking.startTime)}</p>
        <p className="text-xs text-muted-foreground">with {booking.teacherName}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booked by</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
          <User className="h-3.5 w-3.5 text-muted-foreground" /> {booking.parentName}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> Booked {formatDateTime(booking.bookedAt)}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acknowledgement</p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-1.5">
            {(roster ?? []).map((r) => (
              <div key={r.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground">{r.fullName} <span className="text-xs text-muted-foreground">({ROLE_LABEL[r.role] ?? r.role})</span></span>
                {r.acknowledgedAt ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" /> Acknowledged</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not yet acknowledged</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {ackedByMe ? (
        <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="h-4 w-4" /> You acknowledged this
        </div>
      ) : (roster ?? []).some((r) => r.userId === currentUserId) ? (
        // Only rendered for someone the roster actually lists (this meeting's
        // teacher, or a same-school school_admin/principal) — matches
        // acknowledge_ptm_booking's own authorization exactly, since both are
        // built from the same rule. A super_admin viewing via "View as School
        // Admin" is never on the roster (by design — not a day-to-day school
        // operator), so they see no button here instead of a button that
        // would fail server-side with not_authorized.
        <button
          onClick={handleAcknowledge}
          disabled={acking}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {acking ? "Acknowledging…" : "Acknowledge"}
        </button>
      ) : null}
    </div>
  );
}
