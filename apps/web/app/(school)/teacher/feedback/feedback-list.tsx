"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

type FeedbackStatus = "pending" | "responded";

interface StudentSnippet {
  id: string;
  full_name: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_number: string | null;
  photo_url: string | null;
}

interface FeedbackItem {
  id: string;
  subject: string;
  message: string;
  from_name: string;
  from_role: string;
  status: string;
  response: string;
  created_at: string;
  student?: StudentSnippet;
  /**
   * Not populated by any query today — the `feedback` table has no category
   * column yet. Left optional so a future backend addition lights up the
   * tag/filter below with zero further UI changes.
   */
  category?: string;
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "responded") return "default";
  return "secondary";
}

const PAGE_SIZE = 10;

export function FeedbackList({ items, profileBasePath = "/admin/students" }: { items: FeedbackItem[]; profileBasePath?: string }) {
  const [scope, setScope] = useState<"all" | "parents">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.status]))
  );
  const [responses, setResponses] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const item of items) map[item.id] = item.response ?? "";
    return map;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const currentStatus = (id: string, fallback: string) => statuses[id] ?? fallback;
  // Mirrors the badge logic below: any non-"responded" value (the underlying
  // raw status differs by caller — "open" here, "pending" on the teacher
  // page) displays and filters as a single canonical "pending" bucket.
  const normalizedStatus = (id: string, fallback: string) =>
    currentStatus(id, fallback) === "responded" ? "responded" : "pending";

  const scoped = scope === "parents" ? items.filter((i) => i.from_role === "parent") : items;
  const allCount = items.length;
  const parentsCount = items.filter((i) => i.from_role === "parent").length;

  // Category tag/filter renders only if at least one item actually has a
  // category value — currently always empty, so this stays dormant until
  // the backend adds the column.
  const categoryOptions = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

  const filtered = useMemo(() => {
    let result = scoped;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((i) => i.subject.toLowerCase().includes(q) || i.message.toLowerCase().includes(q));
    }
    if (statusFilter) {
      result = result.filter((i) => normalizedStatus(i.id, i.status) === statusFilter);
    }
    if (categoryFilter) {
      result = result.filter((i) => i.category === categoryFilter);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, query, statusFilter, categoryFilter, statuses]);

  useEffect(() => {
    setPage(1);
  }, [scope, query, statusFilter, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function handleRespond(id: string) {
    setSaving(id);
    setErrors((prev) => ({ ...prev, [id]: "" }));
    const supabase = createClient();
    const { error } = await supabase
      .from("feedback")
      .update({ response: responses[id], status: "responded" as FeedbackStatus })
      .eq("id", id);
    setSaving(null);
    if (error) {
      setErrors((prev) => ({ ...prev, [id]: error.message }));
      return;
    }
    setStatuses((prev) => ({ ...prev, [id]: "responded" }));
    setOpenId(null);
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No feedback yet"
        description="Feedback submitted here will show up as soon as it comes in."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Scope pills */}
      <div className="flex gap-2">
        <button
          onClick={() => setScope("all")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            scope === "all" ? "bg-indigo-600 text-white" : "border border-border bg-white text-muted-foreground hover:bg-muted"
          }`}
        >
          All Feedback ({allCount})
        </button>
        <button
          onClick={() => setScope("parents")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            scope === "parents" ? "bg-indigo-600 text-white" : "border border-border bg-white text-muted-foreground hover:bg-muted"
          }`}
        >
          From Parents ({parentsCount})
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by keyword..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="responded">Responded</option>
          </select>
          {categoryOptions.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Categories</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {paged.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No matching feedback found.</p>
      ) : (
        <div className="grid gap-4">
          {paged.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{item.subject}</h3>
                    <Badge variant={statusVariant(currentStatus(item.id, item.status))}>
                      {currentStatus(item.id, item.status) === "responded" ? "Responded" : "Pending"}
                    </Badge>
                    {item.category && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground/80">
                    From:&nbsp;
                    {item.student ? (
                      <span className="group relative inline-block">
                        <span className="cursor-default underline decoration-dotted decoration-muted-foreground/60">
                          {item.from_name}
                        </span>
                        <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 w-56 rounded-xl border border-border bg-white p-3 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                          <span className="mb-2 flex items-center gap-2">
                            {item.student.photo_url ? (
                              <img src={item.student.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                                {(item.student.full_name ?? "?")[0].toUpperCase()}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-foreground">{item.student.full_name ?? "—"}</span>
                          </span>
                          <span className="mb-0.5 block text-xs text-muted-foreground">
                            {[item.student.class_name, item.student.section_name ? `Sec ${item.student.section_name}` : null].filter(Boolean).join(" · ")}
                          </span>
                          {item.student.roll_number && (
                            <span className="mb-2 block text-xs text-muted-foreground">Roll: {item.student.roll_number}</span>
                          )}
                          <Link
                            href={`${profileBasePath}/${item.student.id}`}
                            className="pointer-events-auto text-xs font-medium text-indigo-600 hover:underline"
                          >
                            View Profile →
                          </Link>
                        </span>
                      </span>
                    ) : (
                      item.from_name
                    )}
                    &nbsp;·&nbsp; {item.created_at}
                  </p>
                  {responses[item.id] && currentStatus(item.id, item.status) === "responded" && (
                    <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      <span className="font-medium">Your response: </span>
                      {responses[item.id]}
                    </div>
                  )}
                </div>
                {currentStatus(item.id, item.status) !== "responded" && (
                  <Button
                    type="button"
                    onClick={() =>
                      setOpenId(openId === item.id ? null : item.id)
                    }
                  >
                    Respond
                  </Button>
                )}
              </div>

              {openId === item.id && (
                <div className="mt-4">
                  <textarea
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    rows={3}
                    value={responses[item.id] ?? ""}
                    onChange={(e) =>
                      setResponses((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    placeholder="Write your response…"
                  />
                  {errors[item.id] && (
                    <p className="mt-1 text-xs text-red-600">{errors[item.id]}</p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <Button
                      type="button"
                      onClick={() => handleRespond(item.id)}
                      disabled={saving === item.id || !responses[item.id]}
                    >
                      {saving === item.id ? "Sending…" : "Send Response"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpenId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}