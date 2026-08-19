"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SummaryStats {
  totalAssigned: number;
  joined: number;
  completed: number;
  notJoined: number;
  excluded: number;
  averageScore: number | null;
}

export function LiveSummary({ quizId, sectionId }: { quizId: string; sectionId: string }) {
  const [stats, setStats] = useState<SummaryStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const [{ count: totalAssigned }, { data: participants }, { data: attempts }] = await Promise.all([
        supabase.from("student_enrollments").select("id", { count: "exact", head: true }).eq("section_id", sectionId).eq("is_active", true),
        supabase.from("quiz_live_participants").select("student_id, status").eq("quiz_id", quizId),
        supabase.from("quiz_attempts").select("id, status, excluded").eq("quiz_id", quizId),
      ]);
      if (cancelled) return;

      const excluded = (participants ?? []).filter((p) => p.status === "excluded").length;
      const joined = (participants?.length ?? 0) - excluded;
      const completed = (attempts ?? []).filter((a) => a.status === "submitted" || a.status === "graded").length;
      const notJoined = Math.max(0, (totalAssigned ?? 0) - joined);

      // Average is computed over non-excluded attempts only — excluded
      // students' results are kept for audit but filtered from aggregate
      // reporting, per the Phase 1 design decision.
      const scorableAttemptIds = (attempts ?? []).filter((a) => !a.excluded).map((a) => a.id);
      let averageScore: number | null = null;
      if (scorableAttemptIds.length > 0) {
        const { data: results } = await supabase.from("quiz_results").select("percentage").in("attempt_id", scorableAttemptIds);
        if (results && results.length > 0) {
          averageScore = Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length);
        }
      }

      if (!cancelled) {
        setStats({ totalAssigned: totalAssigned ?? 0, joined, completed, notJoined, excluded, averageScore });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [quizId, sectionId]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">Session ended</p>
      </div>

      {!stats ? (
        <p className="text-sm text-muted-foreground">Loading summary…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total assigned", value: stats.totalAssigned },
            { label: "Joined", value: stats.joined },
            { label: "Completed", value: stats.completed },
            { label: "Not joined", value: stats.notJoined },
            { label: "Excluded", value: stats.excluded },
            { label: "Average score", value: stats.averageScore !== null ? `${stats.averageScore}%` : "—" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg bg-muted/40 p-3">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-lg font-bold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <Link href={`/teacher/testing/${quizId}/results`} className={cn(buttonVariants({ variant: "default" }))}>
        View detailed results
      </Link>
    </div>
  );
}
