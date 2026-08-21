"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserX, Users } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface Participant {
  id: string;
  student_id: string;
  status: "joined" | "excluded";
  joined_at: string;
  name: string;
}

export function ParticipantPanel({
  quizId, initialParticipants, lateJoinAllowed,
}: { quizId: string; initialParticipants: Participant[]; lateJoinAllowed: boolean }) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [lateJoin, setLateJoin] = useState(lateJoinAllowed);
  const [togglingLateJoin, setTogglingLateJoin] = useState(false);
  const [excludingId, setExcludingId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("quiz_live_participants")
      .select("id, student_id, status, joined_at, student:student_profiles(full_name)")
      .eq("quiz_id", quizId)
      .order("joined_at");
    if (data) {
      setParticipants(
        data.map((p) => ({
          id: p.id,
          student_id: p.student_id,
          status: p.status,
          joined_at: p.joined_at,
          name: (p.student as unknown as { full_name: string | null } | null)?.full_name ?? "—",
        }))
      );
    }
  }, [quizId]);

  // Row-level payloads don't carry the joined student name, so any change —
  // a new join, an exclusion — just triggers a full list refetch. Simpler
  // and safe at section-roster scale than incrementally patching state.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-participants-${quizId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_live_participants", filter: `quiz_id=eq.${quizId}` }, refetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, refetch]);

  async function handleExclude(studentId: string) {
    if (!window.confirm("Remove this student from the live session? Their existing answers are kept.")) return;
    setExcludingId(studentId);
    const supabase = createClient();
    const { error } = await supabase.rpc("exclude_participant", { p_quiz_id: quizId, p_student_id: studentId });
    setExcludingId(null);
    if (error) toast.error(error.message);
  }

  async function handleLateJoinToggle(enabled: boolean) {
    setLateJoin(enabled);
    setTogglingLateJoin(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("allow_late_join", { p_quiz_id: quizId, p_enabled: enabled });
    setTogglingLateJoin(false);
    if (error) {
      toast.error(error.message);
      setLateJoin(!enabled);
    }
  }

  const joinedCount = participants.filter((p) => p.status === "joined").length;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase text-muted-foreground">Participants ({joinedCount})</p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border p-2.5">
        <Label className="text-xs">Allow late join</Label>
        <Switch checked={lateJoin} onCheckedChange={handleLateJoinToggle} disabled={togglingLateJoin} />
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {participants.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">No one has joined yet.</p>}
        {participants.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
            <span className={p.status === "excluded" ? "text-muted-foreground line-through" : "text-foreground"}>{p.name}</span>
            {p.status === "joined" ? (
              <button
                onClick={() => handleExclude(p.student_id)}
                disabled={excludingId === p.student_id}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label="Exclude participant"
              >
                <UserX className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span className="shrink-0 text-[10px] font-bold uppercase text-destructive">Excluded</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
