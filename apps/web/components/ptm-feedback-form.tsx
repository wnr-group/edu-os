"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";

interface ExistingFeedback {
  summary: string;
  visible_to_parent: boolean;
  internal_notes: string | null;
  academic_rating: number | null;
  behavior_rating: number | null;
  follow_up_required: boolean;
  edited_at: string | null;
}

function RatingPicker({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label} <span className="text-muted-foreground">(optional)</span></label>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            className={`h-8 w-8 rounded-lg border text-sm font-semibold ${value === n ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-muted"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// Editable authoring form — only ever rendered for the meeting's own
// teacher (checked server-side by ptm-meeting-detail.tsx before mounting
// this). Everyone else gets <PtmFeedbackView/> instead.
export function PtmFeedbackForm({ meetingId, existingFeedback }: { meetingId: string; existingFeedback: ExistingFeedback | null }) {
  const router = useRouter();
  const [summary, setSummary] = useState(existingFeedback?.summary ?? "");
  const [visibleToParent, setVisibleToParent] = useState(existingFeedback?.visible_to_parent ?? true);
  const [internalNotes, setInternalNotes] = useState(existingFeedback?.internal_notes ?? "");
  const [academicRating, setAcademicRating] = useState<number | null>(existingFeedback?.academic_rating ?? null);
  const [behaviorRating, setBehaviorRating] = useState<number | null>(existingFeedback?.behavior_rating ?? null);
  const [followUp, setFollowUp] = useState(existingFeedback?.follow_up_required ?? false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (saving) return;
    if (!summary.trim()) {
      toast.error("Add a summary before saving.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("record_ptm_feedback", {
      p_meeting_id: meetingId,
      p_summary: summary.trim(),
      p_visible_to_parent: visibleToParent,
      p_internal_notes: internalNotes.trim() || null,
      p_academic_rating: academicRating,
      p_behavior_rating: behaviorRating,
      p_follow_up_required: followUp,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(existingFeedback ? "Feedback updated." : "Feedback saved.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Meeting feedback</h2>
        {existingFeedback?.edited_at && (
          <span className="text-xs text-muted-foreground">
            Edited {new Date(existingFeedback.edited_at).toLocaleDateString([], { dateStyle: "medium" })}
          </span>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Summary <span className="text-muted-foreground">— shown to the parent</span></label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          placeholder="What was discussed, how the student is doing, any next steps…"
          className="w-full rounded-lg border border-input bg-background p-3 text-sm"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={visibleToParent} onChange={(e) => setVisibleToParent(e.target.checked)} className="h-4 w-4 rounded border-input" />
        Visible to parent
      </label>

      <div className="grid grid-cols-2 gap-4">
        <RatingPicker label="Academic" value={academicRating} onChange={setAcademicRating} />
        <RatingPicker label="Behaviour" value={behaviorRating} onChange={setBehaviorRating} />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} className="h-4 w-4 rounded border-input" />
        Needs a follow-up meeting
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Internal notes <span className="text-muted-foreground">— staff only, never shown to the parent</span></label>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={3}
          placeholder="Anything staff should know that shouldn't reach the parent…"
          className="w-full rounded-lg border border-input bg-background p-3 text-sm"
        />
      </div>

      <button onClick={handleSave} disabled={saving || !summary.trim()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {saving ? "Saving…" : existingFeedback ? "Update feedback" : "Save feedback"}
      </button>
    </div>
  );
}
