"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Send, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

export function ResultsActions({
  quizId,
  status,
  pushedToGradebook,
}: {
  quizId: string;
  status: string;
  pushedToGradebook: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClose() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("close_quiz", { p_quiz_id: quizId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Quiz closed.");
    router.refresh();
  }

  async function handlePush() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("push_quiz_to_gradebook", { p_quiz_id: quizId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Pushed to gradebook.");
    router.refresh();
  }

  if (pushedToGradebook) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Pushed to gradebook
      </span>
    );
  }
  if (status === "open" || status === "scheduled") {
    return (
      <Button variant="outline" size="sm" onClick={handleClose} disabled={busy}>
        <Lock className="h-3.5 w-3.5" />
        {busy ? "Closing…" : "Close quiz"}
      </Button>
    );
  }
  if (status === "closed") {
    return (
      <Button size="sm" onClick={handlePush} disabled={busy}>
        <Send className="h-3.5 w-3.5" />
        {busy ? "Pushing…" : "Push to gradebook"}
      </Button>
    );
  }
  return null;
}
