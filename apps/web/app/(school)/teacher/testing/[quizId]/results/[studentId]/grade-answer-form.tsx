"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function GradeAnswerForm({ answerId, maxPoints }: { answerId: string; maxPoints: number }) {
  const router = useRouter();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const value = parseFloat(points);
    if (points === "" || Number.isNaN(value) || value < 0 || value > maxPoints) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("grade_short_answer", {
      p_answer_id: answerId,
      p_points: value,
      p_note: note || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Grade saved.");
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pl-9 pt-3">
      <label className="text-xs font-semibold text-muted-foreground">Award points</label>
      <Input type="number" min={0} max={maxPoints} step="0.5" value={points} onChange={(e) => setPoints(e.target.value)} className="w-20" placeholder="0" />
      <span className="text-xs text-muted-foreground">/ {maxPoints}</span>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="max-w-xs flex-1" />
      <Button size="sm" onClick={handleSave} disabled={saving || points === ""}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
