"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase";

export interface BlockerReport {
  id: string;
  student_id: string;
  reason: string;
  message: string | null;
  status: "open" | "acknowledged" | "resolved";
  reported_at: string;
  name: string;
}

const REASON_LABEL: Record<string, string> = {
  technical: "Technical issue",
  connectivity: "Connectivity",
  device: "Device problem",
  not_available: "Not available",
  other: "Other",
};

export function BlockerPanel({ quizId, initialBlockers }: { quizId: string; initialBlockers: BlockerReport[] }) {
  const [reports, setReports] = useState(initialBlockers);
  const [acking, setAcking] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("quiz_blocker_reports")
      .select("id, student_id, reason, message, status, reported_at, student:student_profiles(full_name)")
      .eq("quiz_id", quizId)
      .order("reported_at", { ascending: false });
    if (data) {
      setReports(
        data.map((r) => ({
          id: r.id,
          student_id: r.student_id,
          reason: r.reason,
          message: r.message,
          status: r.status,
          reported_at: r.reported_at,
          name: (r.student as unknown as { full_name: string | null } | null)?.full_name ?? "—",
        }))
      );
    }
  }, [quizId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-blockers-${quizId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_blocker_reports", filter: `quiz_id=eq.${quizId}` }, refetch)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [quizId, refetch]);

  async function handleAcknowledge(reportId: string) {
    setAcking(reportId);
    const supabase = createClient();
    const { error } = await supabase.rpc("acknowledge_blocker", { p_report_id: reportId });
    setAcking(null);
    if (error) toast.error(error.message);
  }

  if (reports.length === 0) return null;

  const openCount = reports.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Blocker reports{openCount > 0 ? ` (${openCount} open)` : ""}
        </p>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {reports.map((r) => (
          <div key={r.id} className="rounded-md border border-border p-2.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{r.name}</span>
              {r.status === "open" ? (
                <button
                  onClick={() => handleAcknowledge(r.id)}
                  disabled={acking === r.id}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Acknowledge
                </button>
              ) : (
                <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">{r.status}</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {REASON_LABEL[r.reason] ?? r.reason}
              {r.message ? ` — ${r.message}` : ""}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
