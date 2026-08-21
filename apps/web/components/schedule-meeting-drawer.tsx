"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase";
import type { PtmSectionOption, PtmStudentOption, PtmTeacherOption, PtmSubjectOption } from "@/lib/ptm";

// Local YYYY-MM-DD / HH:MM strings — deliberately not parsed through `Date`
// (which would apply the browser's timezone) so "today"/"now" match what
// the <input type="date">/<input type="time"> pickers themselves show.
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

const MAX_BULK_SLOTS = 60;

// Duration-based generation only (no slot-count mode) — cursor walks from
// start to end in (duration + gap) steps, only ever emitting a candidate
// whose full duration still fits before end_time. Pure and client-side:
// this is what drives the preview, and the exact same array of times is
// what gets submitted to bulk_publish_ptm_slots — no second implementation
// of this math lives on the server to drift out of sync with the preview.
function generateSlotTimes(startTime: string, endTime: string, durationMinutes: number, gapMinutes: number): { times: string[]; truncated: boolean } {
  if (!startTime || !endTime || !durationMinutes || durationMinutes <= 0) return { times: [], truncated: false };
  const toMinutes = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const toTimeStr = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const step = durationMinutes + Math.max(0, gapMinutes || 0);
  const times: string[] = [];
  let cursor = startMin;
  let truncated = false;
  while (cursor + durationMinutes <= endMin) {
    if (times.length >= MAX_BULK_SLOTS) { truncated = true; break; }
    times.push(toTimeStr(cursor));
    cursor += step;
  }
  return { times, truncated };
}

const SKIP_REASON_LABEL: Record<string, string> = {
  meeting_in_past: "in the past",
  teacher_has_conflicting_meeting: "teacher already has a meeting then",
  slot_already_exists: "already offered",
};

// Fire-and-forget, mirrors leave-inbox.tsx's callLeaveNotify — the meeting
// is already scheduled by the time this runs, so a failure here (network,
// no push token, etc.) never blocks or reverts the scheduling action itself.
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

// Fire-and-forget, once per successful publish action (never per slot) — see
// ptm-slots-notify/index.ts. Called only when at least one slot was actually
// created, so a fully-skipped/duplicate publish attempt never notifies.
function callPtmSlotsPublishedNotify(sectionId: string) {
  const supabase = createClient();
  supabase.auth.getSession().then(({ data: { session } }) => {
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ptm-slots-notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
      body: JSON.stringify({ section_id: sectionId }),
    }).catch(() => {});
  });
}

type SchedulingMode = "single" | "bulk" | "publish";

interface Props {
  sections: PtmSectionOption[];
  students: PtmStudentOption[];
  teachers: PtmTeacherOption[];
  subjects: PtmSubjectOption[];
  /** Gates whether the Bulk/Publish-slot toggles render at all — true for admin/principal/teacher. */
  allowBulk: boolean;
  /** True for a teacher caller — bulk and publish-slot modes lock the teacher field to `currentUserId` instead of offering a picker. Ignored in single mode (unchanged there). */
  bulkTeacherLocked: boolean;
  currentUserId: string;
  onClose: () => void;
  onScheduled: () => void;
}

export function ScheduleMeetingDrawer({ sections, students, teachers, subjects, allowBulk, bulkTeacherLocked, currentUserId, onClose, onScheduled }: Props) {
  const [schedulingMode, setSchedulingMode] = useState<SchedulingMode>("single");
  const [sectionId, setSectionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("15");
  const [mode, setMode] = useState<"in_person" | "online">("in_person");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  // Publish-slot mode's inner Single/Multiple toggle. `time` above doubles
  // as the single-slot time AND the multi-slot start time; `endTime`/`gap`
  // only apply in multi mode.
  const [publishMultiMode, setPublishMultiMode] = useState(false);
  const [endTime, setEndTime] = useState("");
  const [gapMinutes, setGapMinutes] = useState("0");
  const [deselectedTimes, setDeselectedTimes] = useState<Set<string>>(new Set());

  const bulkMode = schedulingMode === "bulk";
  const publishMode = schedulingMode === "publish";

  // In bulk and publish-slot modes, a teacher caller is always the
  // teacher — both RPCs require p_teacher_id = auth.uid() on that
  // authorization branch, so the UI mirrors it rather than offering a
  // picker whose value the server would reject anyway. Single mode is
  // untouched: `teacherId` state still drives it directly, for both roles.
  const teacherLockedToSelf = (bulkMode || publishMode) && bulkTeacherLocked;
  const effectiveTeacherId = teacherLockedToSelf ? currentUserId : teacherId;

  const section = sections.find((s) => s.id === sectionId);
  const studentsInSection = useMemo(() => students.filter((s) => s.sectionId === sectionId), [students, sectionId]);
  const teachersForSection = useMemo(() => teachers.filter((t) => t.sectionId === sectionId), [teachers, sectionId]);
  const subjectsForClass = useMemo(() => (section ? subjects.filter((s) => s.classId === section.classId) : []), [subjects, section]);

  const durationNum = parseInt(duration, 10) || 0;
  const gapNum = parseInt(gapMinutes, 10) || 0;
  const preview = useMemo(
    () => (publishMode && publishMultiMode ? generateSlotTimes(time, endTime, durationNum, gapNum) : { times: [], truncated: false }),
    [publishMode, publishMultiMode, time, endTime, durationNum, gapNum]
  );
  const selectedPreviewTimes = useMemo(
    () => preview.times.filter((t) => !deselectedTimes.has(t)),
    [preview.times, deselectedTimes]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (bulkMode) {
      await handleBulkSubmit();
      return;
    }
    if (publishMode && publishMultiMode) {
      await handlePublishMultiSubmit();
      return;
    }
    if (publishMode) {
      await handlePublishSubmit();
      return;
    }
    if (!studentId || !teacherId || !sectionId || !date || !time) return;
    if (isPastDateTime(date, time)) {
      toast.error("Please select a current or upcoming date and time for the PTM.");
      return;
    }
    const durationMinutes = parseInt(duration, 10);
    if (!durationMinutes || durationMinutes <= 0) {
      toast.error("Duration must be a positive number of minutes.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: meetingId, error } = await supabase.rpc("schedule_ptm_meeting", {
      p_student_id: studentId,
      p_teacher_id: teacherId,
      p_section_id: sectionId,
      p_scheduled_date: date,
      p_start_time: time,
      p_subject_id: subjectId || null,
      p_duration_minutes: durationMinutes,
      p_meeting_mode: mode,
      p_location: location || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Meeting scheduled.");
    if (meetingId) callPtmNotify(meetingId, "scheduled");
    onScheduled();
  }

  async function handleBulkSubmit() {
    if (!effectiveTeacherId || !sectionId || !date || !time) return;
    if (isPastDateTime(date, time)) {
      toast.error("Please select a current or upcoming date and time for the PTM.");
      return;
    }
    const durationMinutes = parseInt(duration, 10);
    if (!durationMinutes || durationMinutes <= 0) {
      toast.error("Duration must be a positive number of minutes.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data: meetingIds, error } = await supabase.rpc("bulk_schedule_ptm_meetings", {
      p_section_id: sectionId,
      p_scheduled_date: date,
      p_start_time: time,
      p_duration_minutes: durationMinutes,
      p_teacher_id: effectiveTeacherId,
      p_subject_id: subjectId || null,
      p_meeting_mode: mode,
      p_location: location || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const ids = (meetingIds ?? []) as string[];
    toast.success(`${ids.length} meeting${ids.length === 1 ? "" : "s"} scheduled.`);
    // Fire-and-forget per meeting, same as the single-meeting flow — a
    // notify failure for one student never blocks or reverts the others.
    for (const id of ids) callPtmNotify(id, "scheduled");
    onScheduled();
  }

  async function handlePublishSubmit() {
    if (!effectiveTeacherId || !sectionId || !date || !time) return;
    if (isPastDateTime(date, time)) {
      toast.error("Please select a current or upcoming date and time for the PTM.");
      return;
    }
    const durationMinutes = parseInt(duration, 10);
    if (!durationMinutes || durationMinutes <= 0) {
      toast.error("Duration must be a positive number of minutes.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("publish_ptm_slot", {
      p_section_id: sectionId,
      p_scheduled_date: date,
      p_start_time: time,
      p_duration_minutes: durationMinutes,
      p_teacher_id: effectiveTeacherId,
      p_subject_id: subjectId || null,
      p_meeting_mode: mode,
      p_location: location || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Slot published — parents in this section can now book it.");
    // ptm-notify doesn't apply here (no ptm_meetings row exists for an
    // unbooked slot, and this fans out to every parent in the section, not
    // one) — ptm-slots-notify handles this event instead. error === null
    // means the RPC didn't raise, i.e. the slot was actually created.
    callPtmSlotsPublishedNotify(sectionId);
    onScheduled();
  }

  async function handlePublishMultiSubmit() {
    if (!effectiveTeacherId || !sectionId || !date || selectedPreviewTimes.length === 0) return;
    const durationMinutes = parseInt(duration, 10);
    if (!durationMinutes || durationMinutes <= 0) {
      toast.error("Duration must be a positive number of minutes.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("bulk_publish_ptm_slots", {
      p_section_id: sectionId,
      p_scheduled_date: date,
      p_start_times: selectedPreviewTimes,
      p_duration_minutes: durationMinutes,
      p_teacher_id: effectiveTeacherId,
      p_subject_id: subjectId || null,
      p_meeting_mode: mode,
      p_location: location || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as { start_time: string; slot_id: string | null; skipped_reason: string | null }[];
    const created = rows.filter((r) => r.slot_id);
    const skipped = rows.filter((r) => !r.slot_id);
    if (skipped.length === 0) {
      toast.success(`${created.length} slot${created.length === 1 ? "" : "s"} published.`);
    } else {
      const reasons = skipped.map((r) => `${r.start_time.slice(0, 5)} (${SKIP_REASON_LABEL[r.skipped_reason ?? ""] ?? r.skipped_reason})`).join(", ");
      toast.success(`${created.length} of ${rows.length} slots published. Skipped: ${reasons}`);
    }
    // One notify call for the whole action, never per slot — and only when
    // at least one slot was actually created, so a batch that's entirely
    // skipped (all duplicates/conflicts) never notifies. Same reasoning as
    // the single-slot path above.
    if (created.length > 0) callPtmSlotsPublishedNotify(sectionId);
    onScheduled();
  }

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="h-full w-full max-w-md overflow-y-auto bg-card p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {bulkMode ? "Bulk schedule PTM" : publishMode ? "Publish PTM slot" : "Schedule PTM"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {allowBulk && (
          <div className="mb-5 flex gap-1 rounded-xl bg-muted p-1">
            <button
              type="button"
              onClick={() => setSchedulingMode("single")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${schedulingMode === "single" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => setSchedulingMode("bulk")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${bulkMode ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              Bulk
            </button>
            <button
              type="button"
              onClick={() => setSchedulingMode("publish")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${publishMode ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
            >
              Publish slot
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Section</label>
            <select
              value={sectionId}
              onChange={(e) => { setSectionId(e.target.value); setStudentId(""); setSubjectId(""); setTeacherId(""); }}
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select section</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          {bulkMode ? (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {sectionId
                ? `${studentsInSection.length} actively enrolled student${studentsInSection.length === 1 ? "" : "s"} in this section will each get their own meeting, in consecutive slots starting at the time below.`
                : "Select a section to see how many meetings will be created."}
            </p>
          ) : publishMode ? (
            <>
              <div className="flex gap-1 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setPublishMultiMode(false)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${!publishMultiMode ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                >
                  Single slot
                </button>
                <button
                  type="button"
                  onClick={() => setPublishMultiMode(true)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${publishMultiMode ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}
                >
                  Multiple slots
                </button>
              </div>
              <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {publishMultiMode
                  ? "Generates several open slots across a time range — no student yet. Any parent with a child in this section can book each one for their child."
                  : "This publishes one open slot for this section — no student yet. Any parent with a child in this section can book it for their child; it becomes a normal PTM meeting the moment they do."}
              </p>
            </>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Student</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                disabled={!sectionId}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{sectionId ? "Select student" : "Select a section first"}</option>
                {studentsInSection.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </div>
          )}

          {teacherLockedToSelf ? (
            // A teacher's bulk meetings / published slots are always under
            // their own name — bulk_schedule_ptm_meetings and
            // publish_ptm_slot both require p_teacher_id = auth.uid() for a
            // teacher caller, so there's nothing to pick.
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teacher</label>
              <div className="w-full rounded-lg border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
                You — {bulkMode ? "bulk meetings are" : "published slots are"} scheduled under your own name
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Teacher</label>
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                required
                disabled={!sectionId}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">{sectionId ? "Select teacher" : "Select a section first"}</option>
                {teachersForSection.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
              </select>
              {sectionId && teachersForSection.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">No teachers are assigned to this section yet.</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Subject <span className="text-muted-foreground">(optional)</span></label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!sectionId} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm disabled:opacity-50">
              <option value="">General / not subject-specific</option>
              {subjectsForClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">Date</label>
              <input type="date" value={date} min={todayLocal()} onChange={(e) => setDate(e.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">{bulkMode || (publishMode && publishMultiMode) ? "Start time" : "Time"}</label>
              <input
                type="time"
                value={time}
                min={date === todayLocal() ? nowLocalTime() : undefined}
                onChange={(e) => setTime(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          {isPastDateTime(date, time) && (
            <p className="text-xs font-medium text-red-600">Please select a current or upcoming date and time for the PTM.</p>
          )}

          {publishMode && publishMultiMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">End time</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Gap between slots <span className="text-muted-foreground">(optional)</span></label>
                <input type="number" min={0} step={5} value={gapMinutes} onChange={(e) => setGapMinutes(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {bulkMode || (publishMode && publishMultiMode) ? "Duration per slot (minutes)" : "Duration (minutes)"}
            </label>
            <input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
          </div>

          {publishMode && publishMultiMode && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Preview</label>
                {preview.times.length > 0 && (
                  <span className="text-xs text-muted-foreground">{selectedPreviewTimes.length} of {preview.times.length} selected</span>
                )}
              </div>
              {!time || !endTime ? (
                <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Set a start and end time to generate the preview.</p>
              ) : preview.times.length === 0 ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  No slots fit in this range — a {duration || "?"}-minute slot needs at least that much room between start and end.
                </p>
              ) : (
                <>
                  {preview.truncated && (
                    <p className="mb-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      Capped at {MAX_BULK_SLOTS} slots — narrow the range, or increase duration/gap, to fit fewer at once.
                    </p>
                  )}
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-input">
                    <div className="grid grid-cols-3 gap-1 p-2">
                      {preview.times.map((t) => {
                        const selected = !deselectedTimes.has(t);
                        return (
                          <label key={t} className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs ${selected ? "bg-primary/10 text-primary" : "text-muted-foreground line-through"}`}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => setDeselectedTimes((prev) => {
                                const next = new Set(prev);
                                if (next.has(t)) next.delete(t); else next.add(t);
                                return next;
                              })}
                              className="h-3.5 w-3.5 rounded border-input"
                            />
                            {t}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">Meeting type</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode("in_person")} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${mode === "in_person" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground"}`}>
                In-person
              </button>
              <button type="button" onClick={() => setMode("online")} className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${mode === "online" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground"}`}>
                Online
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              {mode === "online" ? "Meeting link" : "Room / location"} <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={mode === "online" ? "Paste a meeting link…" : "e.g. Room 101"}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={
              saving || !effectiveTeacherId || !sectionId || !date || !time ||
              (publishMode && publishMultiMode ? selectedPreviewTimes.length === 0 : isPastDateTime(date, time)) ||
              (bulkMode ? studentsInSection.length === 0 : publishMode ? false : !studentId)
            }
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving
              ? (publishMode ? "Publishing…" : "Scheduling…")
              : bulkMode
                ? `Schedule ${studentsInSection.length || ""} meeting${studentsInSection.length === 1 ? "" : "s"}`
                : publishMode
                  ? (publishMultiMode ? `Publish ${selectedPreviewTimes.length || ""} slot${selectedPreviewTimes.length === 1 ? "" : "s"}` : "Publish slot")
                  : "Schedule meeting"}
          </button>
        </form>
      </div>
    </div>
  );

  // Portaled to document.body — app/template.tsx wraps every route in a
  // `transform`-animated div (fill-mode `both`, so the transform never
  // clears), which makes that ancestor the containing block for any
  // `position: fixed` descendant instead of the viewport. Without the
  // portal this drawer renders offset by however far down the page content
  // sits, showing as a gap above the drawer instead of a true full-screen
  // overlay.
  return createPortal(content, document.body);
}
