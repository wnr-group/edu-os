"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, ChevronDown, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  loadRoster, loadAttachments, getSignedUrl, reviewStudent, notifyReviewed,
  getHomeworkSubmissionSignedUrl,
  RosterRow, AttachmentRow, HomeworkRating,
} from "@/lib/homework";

const RATINGS: { value: HomeworkRating; label: string }[] = [
  { value: "good", label: "Good" },
  { value: "satisfactory", label: "Satisfactory" },
  { value: "needs_improvement", label: "Needs Improvement" },
];
const ratingLabel = (r: HomeworkRating | null) => RATINGS.find((x) => x.value === r)?.label ?? "";

export function RosterReview({ homeworkId, sectionId }: { homeworkId: string; sectionId: string }) {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rating, setRating] = useState<HomeworkRating>("good");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, a] = await Promise.all([loadRoster(homeworkId, sectionId), loadAttachments(homeworkId)]);
    setRoster(r); setAttachments(a); setLoading(false);
  }, [homeworkId, sectionId]);

  useEffect(() => { load(); }, [load]);

  const done = roster.filter((r) => r.state === "done");
  const viewed = roster.filter((r) => r.state === "viewed");
  const notStarted = roster.filter((r) => r.state === "not_started");

  function openReview(row: RosterRow) {
    if (expandedId === row.studentId) { setExpandedId(null); return; }
    setExpandedId(row.studentId);
    setRating(row.rating ?? "good");
    setComment(row.teacherComment ?? "");
  }

  async function save(row: RosterRow) {
    setSaving(true);
    const { error } = await reviewStudent(homeworkId, row.studentId, rating, comment);
    setSaving(false);
    if (error) { toast.error(error); return; }
    notifyReviewed(homeworkId, row.studentId);
    setExpandedId(null);
    load();
  }

  async function open(path: string) {
    const url = await getSignedUrl(path);
    if (url) window.open(url, "_blank"); else toast.error("Could not open attachment");
  }

  async function openSubmission(submissionId: string) {
    const { url, error } = await getHomeworkSubmissionSignedUrl(submissionId);
    if (error || !url) {
      toast.error(error || "Could not open submission");
      return;
    }
    window.open(url, "_blank");
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading roster…</p>;



  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex gap-6 pt-6">
          <Stat label="Done" value={`${done.length}/${roster.length}`} />
          <Stat label="Viewed" value={`${viewed.length}`} />
          <Stat label="Not started" value={`${notStarted.length}`} />
        </CardContent>
      </Card>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <button
              key={a.id}
              onClick={() => open(a.fileUrl)}
              className="rounded border border-border px-3 py-1 text-sm text-primary hover:underline"
            >
              {a.fileName}
            </button>
          ))}
        </div>
      )}

      <Group title={`Done — review (${done.length})`}>
        {done.map((r) => (
          <div key={r.studentId} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-foreground">{r.fullName}</span>
              {r.reviewedAt ? (
                <span className="text-sm font-semibold text-emerald-600">{ratingLabel(r.rating)}</span>
              ) : (
                <Button variant="outline" size="sm" onClick={() => openReview(r)}>
                  {expandedId === r.studentId ? "Close" : "Review"}
                </Button>
              )}
            </div>
              {expandedId === r.studentId && !r.reviewedAt && (
              <div className="mt-3 space-y-3">
                {r.submission && (
                  <button
                    type="button"
                    onClick={() => openSubmission(r.submission!.id)}
                    className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary hover:underline"
                  >
                    <Paperclip className="h-4 w-4" />
                    Submitted: {r.submission.fileName}
                  </button>
                )}
                <div className="flex gap-2">
                  {RATINGS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRating(opt.value)}
                      className={`rounded border px-3 py-1 text-sm ${
                        rating === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  placeholder="Comment (optional)…"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                />
                <Button size="sm" disabled={saving} onClick={() => save(r)}>
                  {saving ? "Saving…" : "Save Review"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Group>

      <Group title={`Viewed (${viewed.length})`}>
        {viewed.map((r) => <Row key={r.studentId} name={r.fullName} />)}
      </Group>
      <Group title={`Not started (${notStarted.length})`}>
        {notStarted.map((r) => <Row key={r.studentId} name={r.fullName} />)}
      </Group>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}
function Row({ name }: { name: string }) {
  return <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">{name}</div>;
}