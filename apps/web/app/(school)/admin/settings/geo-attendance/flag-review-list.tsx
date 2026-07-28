"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, WifiOff, Check } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markGroupReviewed, formatDistanceM, type GeoFlagGroup } from "@/lib/geo-attendance";

const SESSION_LABELS: Record<string, string> = { FULL_DAY: "Full day", FN: "Forenoon", AN: "Afternoon" };

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return d >= start;
}

type Filter = "all" | "outside" | "no_gps" | "week";

export function FlagReviewList({ groups: initialGroups, reviewerId }: { groups: GeoFlagGroup[]; reviewerId: string }) {
  const [groups, setGroups] = useState(initialGroups);
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: groups.length,
      outside: groups.filter((g) => g.geoStatus === "outside").length,
      no_gps: groups.filter((g) => g.geoStatus === "no_gps").length,
    }),
    [groups],
  );

  const filtered = groups.filter((g) => {
    if (filter === "outside") return g.geoStatus === "outside";
    if (filter === "no_gps") return g.geoStatus === "no_gps";
    if (filter === "week") return isThisWeek(g.date);
    return true;
  });

  const unreviewedCount = groups.filter((g) => !g.reviewed).length;

  async function reviewGroup(g: GeoFlagGroup) {
    setReviewing(g.key);
    const supabase = createClient();
    const { error } = await markGroupReviewed(supabase, g.recordIds, reviewerId);
    setReviewing(null);
    if (error) { toast.error(error); return; }
    setGroups((prev) => prev.map((x) => (x.key === g.key ? { ...x, reviewed: true, reviewedAt: new Date().toISOString(), reviewedByName: "you" } : x)));
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {unreviewedCount > 0 && (
          <div className="flex items-center gap-2.5 border-b bg-[#FDF3E2] px-[18px] py-2.5 text-[12.5px] font-semibold text-[#9A6408]">
            <AlertTriangle className="h-3.5 w-3.5" />
            {unreviewedCount} submission{unreviewedCount === 1 ? "" : "s"} to review this week · usually there&rsquo;s nothing here — most marking is on-campus.
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5 border-b px-[18px] py-3.5">
          <h3 className="text-[15px] font-semibold tracking-tight">Flagged submissions</h3>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {([
              ["all", `All ${counts.all}`],
              ["outside", `Off-campus ${counts.outside}`],
              ["no_gps", `No-GPS ${counts.no_gps}`],
              ["week", "This week"],
            ] as [Filter, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold",
                  filter === key ? "border-transparent bg-indigo-50 text-indigo-700" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-11 text-center text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          filtered.map((g) => (
            <div key={g.key} className={cn("grid grid-cols-[34px_1fr_auto] items-center gap-3.5 border-b px-[18px] py-3.5 last:border-b-0 hover:bg-muted/30", g.reviewed && "opacity-60")}>
              <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-indigo-100 text-xs font-bold text-indigo-700">
                {initials(g.teacherName)}
              </div>
              <div>
                <b className="text-sm font-semibold">{g.teacherName}</b>{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  · {g.sectionLabel} · {SESSION_LABELS[g.session] ?? g.session} · {new Date(g.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide", g.geoStatus === "outside" ? "bg-[#FDF3E2] text-[#F59E0B]" : "bg-muted text-muted-foreground")}>
                    {g.geoStatus === "outside" ? "OFF-CAMPUS" : "NO-GPS"}
                  </span>
                  {g.geoStatus === "outside" ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#F59E0B]" /> {formatDistanceM(g.distanceM ?? 0)} past the fence
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <WifiOff className="h-3.5 w-3.5" /> Location unavailable at submit
                    </span>
                  )}
                  {g.accuracyM != null && <span className="font-mono text-[11.5px] text-muted-foreground">GPS &plusmn;{Math.round(g.accuracyM)}m</span>}
                </div>
              </div>
              <div>
                {g.reviewed ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <Check className="h-3.5 w-3.5" /> Reviewed{g.reviewedByName ? ` · ${g.reviewedByName}` : ""}
                  </span>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => reviewGroup(g)} disabled={reviewing === g.key}>
                    <Check className="h-3.5 w-3.5" /> {reviewing === g.key ? "Saving…" : "Mark reviewed"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2.5 rounded-xl border border-dashed bg-muted/40 p-3.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <p>
          <b className="text-foreground">An exception log, not a scoreboard.</b> No KPIs or &ldquo;impact&rdquo; here — just the handful of
          submissions worth a glance. The nav badge only appears when something&rsquo;s pending. Reviewing clears the flag; it never edits the
          attendance itself.
        </p>
      </div>
    </div>
  );
}
