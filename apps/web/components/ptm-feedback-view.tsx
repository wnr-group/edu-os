import { FileQuestion, Star, Flag } from "lucide-react";

interface ExistingFeedback {
  summary: string;
  visible_to_parent: boolean;
  internal_notes: string | null;
  academic_rating: number | null;
  behavior_rating: number | null;
  follow_up_required: boolean;
  edited_at: string | null;
}

function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

// Read-only view for Super Admin / School Admin / Principal — feedback is
// the teacher's own record; staff get full oversight (including
// internal_notes, which the RLS policy already scopes to staff+the meeting's
// teacher only — parents never reach this component or that policy branch)
// but no edit affordance at all, matching record_ptm_feedback's RPC-level
// restriction to teacher_id = auth.uid().
export function PtmFeedbackView({ feedback }: { feedback: ExistingFeedback | null }) {
  if (!feedback) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
        <FileQuestion className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Feedback has not been provided by the teacher yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Meeting feedback</h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">View only</span>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Summary {feedback.visible_to_parent ? "· visible to parent" : "· not shared with parent"}
        </p>
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-foreground">{feedback.summary}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Academic</p>
          <div className="mt-1"><Stars value={feedback.academic_rating} /></div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Behaviour</p>
          <div className="mt-1"><Stars value={feedback.behavior_rating} /></div>
        </div>
      </div>

      {feedback.follow_up_required && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
          <Flag className="h-3.5 w-3.5" /> Teacher flagged this for a follow-up meeting.
        </p>
      )}

      {feedback.internal_notes && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes — staff only</p>
          <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-foreground">{feedback.internal_notes}</p>
        </div>
      )}

      {feedback.edited_at && (
        <p className="text-xs text-muted-foreground">Last edited {new Date(feedback.edited_at).toLocaleDateString([], { dateStyle: "medium" })}</p>
      )}
    </div>
  );
}
