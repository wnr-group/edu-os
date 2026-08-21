"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Video, X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { PtmSlotGroup } from "@/lib/ptm";

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

// Withdraw is left as a single click with no confirmation step, unlike
// cancelling a meeting — an open slot has no parent/student attached to it
// yet, so withdrawing it affects nobody the way cancelling a real meeting
// does. Staff can always republish the exact same time again immediately.
export function PtmSlotsPanel({ groups, onChanged }: { groups: PtmSlotGroup[]; onChanged: () => void }) {
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  async function handleWithdraw(slotId: string) {
    setWithdrawingId(slotId);
    const supabase = createClient();
    const { error } = await supabase.rpc("withdraw_ptm_slot", { p_slot_id: slotId });
    setWithdrawingId(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Slot withdrawn.");
    onChanged();
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No available slots published yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const bookedCount = g.slots.filter((s) => s.status === "booked").length;
        const totalCount = g.slots.length;
        return (
          <div key={g.key} className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{g.className} · with {g.teacherName}</p>
                <p className="text-xs text-muted-foreground">{formatDate(g.scheduledDate)}</p>
              </div>
              {/* Deliberately two separate figures, never one fraction — a
                  slot count and a student-roster count answer different
                  questions and folding them together reads as "N of 30
                  students have a meeting", which isn't what this says. */}
              <p className="text-xs font-medium text-muted-foreground">
                <span className="text-foreground">{bookedCount} / {totalCount}</span> slots booked · {g.sectionStudentCount} students
              </p>
            </div>
            <div className="divide-y divide-border">
              {g.slots.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${s.status === "booked" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {s.status === "booked" ? "Booked" : "Open"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatTime(s.startTime)} · {s.durationMinutes} min{s.subjectName ? ` · ${s.subjectName}` : ""}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        {s.meetingMode === "online" ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                        {s.location || (s.meetingMode === "online" ? "Online — link to be shared" : "Location not specified")}
                      </p>
                      {/* Only a booked slot ever names a student — an open
                          slot shows nothing here, not a placeholder, so it
                          can never read as already assigned to a child. */}
                      {s.status === "booked" && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Booked by {s.bookedParentName} for <span className="font-medium text-foreground">{s.bookedStudentName}</span></p>
                      )}
                    </div>
                  </div>
                  {s.status === "open" && (
                    <button
                      onClick={() => handleWithdraw(s.id)}
                      disabled={withdrawingId === s.id}
                      className="flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> {withdrawingId === s.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
