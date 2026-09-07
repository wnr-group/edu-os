"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  Send,
  UserCheck,
  Search,
  ArrowRight,
  ShieldAlert,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import { rpcErrorMessage } from "@erp/shared";

export interface AcademicEvidenceItem {
  snapshot_id: string;
  is_pinned: boolean;
  subject_name: string;
  score: number;
  band: string;
}

export interface InterventionRow {
  id: string;
  student_id: string;
  student_name: string;
  roll_number?: string;
  class_name?: string;
  section_name?: string;
  kind: "attendance" | "academic";
  type: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "dismissed";
  severity_band: "HIGH" | "MED";
  due_date: string;
  assigned_via: string;
  assignee_id: string;
  assignee_name?: string;
  outcome_note?: string | null;
  dismissal_reason?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  dismissed_at?: string | null;
  created_at: string;
  factors: Array<{ key?: string; label?: string; value?: unknown; contribution?: number }>;
  recommended_action: string;
  subject_name?: string | null;
  evidence: AcademicEvidenceItem[];
  last_notified_at?: string | null;
}

export interface StaffOption {
  id: string;
  name: string;
  role: string;
}

interface InterventionsViewProps {
  initialInterventions: InterventionRow[];
  schoolId?: string;
  currentUserId?: string;
  currentUserRole?: string;
  isAdmin?: boolean;
  staffList?: StaffOption[];
  dbError?: boolean;
}

export function InterventionsView({
  initialInterventions,
  currentUserId,
  isAdmin = false,
  staffList = [],
  dbError = false,
}: InterventionsViewProps) {
  const [interventions, setInterventions] = useState<InterventionRow[]>(initialInterventions);
  const [selectedIntervention, setSelectedIntervention] = useState<InterventionRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState<"open" | "completed" | "dismissed" | "all">("open");
  const [kindFilter, setKindFilter] = useState<"all" | "attendance" | "academic">("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "HIGH" | "MED">("all");

  // Modals & Action States
  const [actionLoading, setActionLoading] = useState(false);
  const [showDismissModal, setShowDismissModal] = useState(false);
  const [dismissReason, setDismissReason] = useState("");
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTarget, setReassignTarget] = useState("");
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const supabase = createClient();

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showDismissModal) setShowDismissModal(false);
        else if (showCompleteModal) setShowCompleteModal(false);
        else if (showReassignModal) setShowReassignModal(false);
        else if (showNotifyModal) setShowNotifyModal(false);
        else if (selectedIntervention) setSelectedIntervention(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDismissModal, showCompleteModal, showReassignModal, showNotifyModal, selectedIntervention]);

  // Filtered interventions
  const filteredInterventions = interventions.filter((item) => {
    // Status Filter
    if (statusTab === "open" && !["pending", "in_progress"].includes(item.status)) return false;
    if (statusTab === "completed" && item.status !== "completed") return false;
    if (statusTab === "dismissed" && item.status !== "dismissed") return false;

    // Kind Filter
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;

    // Severity Filter
    if (severityFilter !== "all" && item.severity_band !== severityFilter) return false;

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.student_name.toLowerCase().includes(q);
      const matchRoll = item.roll_number?.toLowerCase().includes(q);
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchClass = item.class_name?.toLowerCase().includes(q);
      if (!matchName && !matchRoll && !matchTitle && !matchClass) return false;
    }

    return true;
  });

  // KPI Calculations
  const openCount = interventions.filter((i) => ["pending", "in_progress"].includes(i.status)).length;
  const highRiskCount = interventions.filter((i) => i.severity_band === "HIGH" && ["pending", "in_progress"].includes(i.status)).length;
  const todayStr = new Date().toISOString().split("T")[0];
  const dueTodayCount = interventions.filter(
    (i) => i.due_date <= todayStr && ["pending", "in_progress"].includes(i.status)
  ).length;
  const resolvedCount = interventions.filter((i) => ["completed", "dismissed"].includes(i.status)).length;

  // Actions
  async function handleStart(id: string) {
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("start_intervention", { p_intervention_id: id });
      if (error) throw error;

      toast.success("Intervention started and marked in progress");
      setInterventions((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "in_progress", started_at: new Date().toISOString() } : i))
      );
      if (selectedIntervention?.id === id) {
        setSelectedIntervention((prev) => (prev ? { ...prev, status: "in_progress" } : null));
      }
    } catch (err: unknown) {
      toast.error(rpcErrorMessage(err, "Failed to start intervention"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    if (!selectedIntervention) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("complete_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_outcome_note: outcomeNote.trim() || null,
      });
      if (error) throw error;

      toast.success("Intervention marked as completed");
      setInterventions((prev) =>
        prev.map((i) =>
          i.id === selectedIntervention.id
            ? { ...i, status: "completed", outcome_note: outcomeNote.trim(), completed_at: new Date().toISOString() }
            : i
        )
      );
      setSelectedIntervention((prev) =>
        prev ? { ...prev, status: "completed", outcome_note: outcomeNote.trim() } : null
      );
      setShowCompleteModal(false);
      setOutcomeNote("");
    } catch (err: unknown) {
      toast.error(rpcErrorMessage(err, "Failed to complete intervention"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDismiss() {
    if (!selectedIntervention) return;
    if (!dismissReason.trim()) {
      toast.error("Dismissal reason is required");
      return;
    }
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("dismiss_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_dismissal_reason: dismissReason.trim(),
      });
      if (error) throw error;

      toast.success("Intervention dismissed");
      setInterventions((prev) =>
        prev.map((i) =>
          i.id === selectedIntervention.id
            ? { ...i, status: "dismissed", dismissal_reason: dismissReason.trim(), dismissed_at: new Date().toISOString() }
            : i
        )
      );
      setSelectedIntervention((prev) =>
        prev ? { ...prev, status: "dismissed", dismissal_reason: dismissReason.trim() } : null
      );
      setShowDismissModal(false);
      setDismissReason("");
    } catch (err: unknown) {
      toast.error(rpcErrorMessage(err, "Failed to dismiss intervention"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReassign() {
    if (!selectedIntervention || !reassignTarget) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("reassign_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_new_assignee_id: reassignTarget,
      });
      if (error) throw error;

      const newStaff = staffList.find((s) => s.id === reassignTarget);
      toast.success(`Intervention reassigned to ${newStaff?.name || "new staff"}`);
      setInterventions((prev) =>
        prev.map((i) =>
          i.id === selectedIntervention.id
            ? { ...i, assignee_id: reassignTarget, assignee_name: newStaff?.name, assigned_via: "reassigned" }
            : i
        )
      );
      setSelectedIntervention((prev) =>
        prev ? { ...prev, assignee_id: reassignTarget, assignee_name: newStaff?.name, assigned_via: "reassigned" } : null
      );
      setShowReassignModal(false);
      setReassignTarget("");
    } catch (err: unknown) {
      toast.error(rpcErrorMessage(err, "Failed to reassign intervention"));
    } finally {
      setActionLoading(false);
    }
  }

  function openNotifyModal(item: InterventionRow) {
    setSelectedIntervention(item);
    // Generate UUID once per modal open for idempotency
    setPendingRequestId(crypto.randomUUID());
    setShowNotifyModal(true);
  }

  async function handleNotifyParent() {
    if (!selectedIntervention || !pendingRequestId) return;
    try {
      setActionLoading(true);
      const { error } = await supabase.rpc("notify_parent_for_intervention", {
        p_intervention_id: selectedIntervention.id,
        p_client_request_id: pendingRequestId,
      });
      if (error) throw error;

      const nowIso = new Date().toISOString();
      toast.success("Parent notified with safe template notice");
      setInterventions((prev) =>
        prev.map((i) => (i.id === selectedIntervention.id ? { ...i, last_notified_at: nowIso } : i))
      );
      setSelectedIntervention((prev) => (prev ? { ...prev, last_notified_at: nowIso } : null));
      setShowNotifyModal(false);
    } catch (err: unknown) {
      toast.error(rpcErrorMessage(err, "Failed to send notification to parent"));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Insights & Interventions</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "School-wide student risk monitoring and staff action queue."
              : "Review students requiring attention, manage interventions, and coordinate support."}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Open Tasks</span>
            <AlertTriangle className="h-4 w-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{openCount}</p>
          <p className="text-xs text-muted-foreground">Requires staff attention</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">High Risk</span>
            <ShieldAlert className="h-4 w-4 text-destructive" />
          </div>
          <p className="mt-2 text-2xl font-bold text-destructive">{highRiskCount}</p>
          <p className="text-xs text-muted-foreground">Immediate action recommended</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Due Today / Overdue</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{dueTodayCount}</p>
          <p className="text-xs text-muted-foreground">Target due date today or past</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{resolvedCount}</p>
          <p className="text-xs text-muted-foreground">Completed or dismissed</p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1">
            {(
              [
                { id: "open", label: "Action Queue", count: openCount },
                { id: "completed", label: "Completed" },
                { id: "dismissed", label: "Dismissed" },
                { id: "all", label: "All Records" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {tab.label}
                {"count" in tab && tab.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      statusTab === tab.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Secondary Filters */}
          <div className="flex items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as "all" | "attendance" | "academic")}
              className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All Domains</option>
              <option value="attendance">Attendance</option>
              <option value="academic">Academic</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as "all" | "HIGH" | "MED")}
              className="rounded-lg border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All Severities</option>
              <option value="HIGH">HIGH Risk</option>
              <option value="MED">MED Risk</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by student name, roll number, class, or action..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Intervention Items Grid */}
      {dbError ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/40 p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive/60" />
          <h3 className="mt-3 text-base font-semibold text-foreground">Unable to load interventions</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A database error occurred. Please refresh the page or contact support if the issue persists.
          </p>
        </div>
      ) : filteredInterventions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500/60" />
          <h3 className="mt-3 text-base font-semibold text-foreground">No interventions found</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {statusTab === "open"
              ? "Action queue is clear. No students currently require immediate intervention."
              : "No records match the selected filters."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredInterventions.map((item) => {
            const isHigh = item.severity_band === "HIGH";
            const isDueToday = item.due_date === todayStr;
            const isOverdue = item.due_date < todayStr;

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div>
                  {/* Card Header: Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          item.kind === "attendance"
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {item.kind === "attendance" ? <Calendar className="h-3 w-3" /> : <GraduationCap className="h-3 w-3" />}
                        {item.kind.toUpperCase()}
                      </span>

                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          isHigh
                            ? "bg-destructive/10 text-destructive"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {item.severity_band}
                      </span>
                    </div>

                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        item.status === "in_progress"
                          ? "bg-blue-500/10 text-blue-600"
                          : item.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : item.status === "dismissed"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {item.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  {/* Student Title */}
                  <div className="mt-3">
                    <h3 className="text-base font-bold text-foreground group-hover:text-primary">
                      {item.student_name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {item.class_name ? `Class ${item.class_name}` : ""}
                      {item.section_name ? ` - Sec ${item.section_name}` : ""}
                      {item.roll_number ? ` · Roll #${item.roll_number}` : ""}
                    </p>
                  </div>

                  {/* Recommended Action / Title */}
                  <div className="mt-3 rounded-lg bg-accent/40 p-3">
                    <p className="text-xs font-medium text-foreground">{item.title}</p>
                    {item.subject_name && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Primary Subject: {item.subject_name}</p>
                    )}
                  </div>

                  {/* Multiple Evidence Summary (for Academic) */}
                  {item.evidence && item.evidence.length > 1 && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{item.evidence.length} flagged subjects: </span>
                      {item.evidence.map((e) => e.subject_name).filter(Boolean).join(", ")}
                    </div>
                  )}

                  {/* Target Due Date */}
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Target: </span>
                    <span
                      className={`font-medium ${
                        isOverdue
                          ? "text-destructive font-bold"
                          : isDueToday
                          ? "text-amber-600 font-semibold"
                          : "text-foreground"
                      }`}
                    >
                      {isOverdue ? `Overdue (${item.due_date})` : isDueToday ? "Due Today" : item.due_date}
                    </span>
                  </div>
                </div>

                {/* Card Footer: Action Button */}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <div className="text-[11px] text-muted-foreground">
                    Assignee: <span className="font-medium text-foreground">{item.assignee_name || "Staff"}</span>
                  </div>

                  <button
                    onClick={() => setSelectedIntervention(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow transition hover:bg-primary/90"
                  >
                    <span>Review & Act</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Intervention Detail Modal */}
      {selectedIntervention && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      selectedIntervention.kind === "attendance"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-blue-500/10 text-blue-600"
                    }`}
                  >
                    {selectedIntervention.kind.toUpperCase()}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                      selectedIntervention.severity_band === "HIGH"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {selectedIntervention.severity_band} SEVERITY
                  </span>
                </div>
                <h2 className="mt-2 text-xl font-bold text-foreground">{selectedIntervention.student_name}</h2>
                <p className="text-xs text-muted-foreground">
                  {selectedIntervention.class_name ? `Class ${selectedIntervention.class_name}` : ""}
                  {selectedIntervention.section_name ? ` - Sec ${selectedIntervention.section_name}` : ""}
                  {selectedIntervention.roll_number ? ` · Roll #${selectedIntervention.roll_number}` : ""}
                </p>
              </div>

              <button
                onClick={() => setSelectedIntervention(null)}
                aria-label="Close dialog"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="mt-4 space-y-4">
              {/* Why Flagged (Factors) */}
              <div className="rounded-xl border border-border bg-accent/20 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Info className="h-4 w-4 text-primary" />
                  Why Flagged (Deterministic Risk Evidence)
                </h4>

                {selectedIntervention.factors && selectedIntervention.factors.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {selectedIntervention.factors.map((factor, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg bg-card p-2.5 text-xs border border-border/50">
                        <span className="font-medium text-foreground">{factor.label || factor.key}</span>
                        {typeof factor.contribution === "number" && !isNaN(factor.contribution) && (
                          <span className="text-muted-foreground font-mono">
                            Impact: {factor.contribution.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Risk thresholds exceeded for evaluation period.</p>
                )}

                {/* Sibling Academic Evidence */}
                {selectedIntervention.kind === "academic" && selectedIntervention.evidence && selectedIntervention.evidence.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <h5 className="text-xs font-semibold text-foreground">Qualifying Subjects</h5>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {selectedIntervention.evidence.map((ev, idx) => (
                        <div key={idx} className="rounded-lg bg-card p-2 text-xs border border-border/50">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{ev.subject_name || "Subject"}</span>
                            {ev.is_pinned && (
                              <span className="rounded bg-primary/10 px-1 py-0.5 text-[9px] font-bold text-primary">
                                Pinned Trigger
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Band: <span className="font-semibold text-destructive">{ev.band}</span> · Score: {ev.score}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Recommended Action */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recommended Action</h4>
                <p className="mt-1.5 text-sm font-medium text-foreground">{selectedIntervention.recommended_action || selectedIntervention.title}</p>
              </div>

              {/* Status & Assignment Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg bg-accent/20 p-3 border border-border/50">
                  <span className="text-muted-foreground">Status:</span>
                  <p className="font-semibold text-foreground capitalize mt-0.5">{selectedIntervention.status.replace("_", " ")}</p>
                </div>
                <div className="rounded-lg bg-accent/20 p-3 border border-border/50">
                  <span className="text-muted-foreground">Assignee:</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {selectedIntervention.assignee_name || "Assigned Staff"} ({selectedIntervention.assigned_via})
                  </p>
                </div>
              </div>

              {/* Previous Outcome / Dismissal Notes */}
              {selectedIntervention.outcome_note && (
                <div className="rounded-lg bg-emerald-500/10 p-3 text-xs border border-emerald-500/20">
                  <span className="font-semibold text-emerald-600">Completion Outcome Note:</span>
                  <p className="mt-1 text-foreground">{selectedIntervention.outcome_note}</p>
                </div>
              )}

              {selectedIntervention.dismissal_reason && (
                <div className="rounded-lg bg-muted p-3 text-xs border border-border">
                  <span className="font-semibold text-muted-foreground">Dismissal Reason:</span>
                  <p className="mt-1 text-foreground">{selectedIntervention.dismissal_reason}</p>
                </div>
              )}

              {/* Parent Notification Record */}
              {selectedIntervention.last_notified_at && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 p-3 text-xs text-blue-600 border border-blue-500/20">
                  <Bell className="h-4 w-4" />
                  <span>Parent notified on {new Date(selectedIntervention.last_notified_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            {(() => {
              const canAct = isAdmin || selectedIntervention.assignee_id === currentUserId;
              return (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="flex items-center gap-2">
                {/* Notify Parent Action — available to assignee and admins */}
                {canAct && (
                <button
                  onClick={() => openNotifyModal(selectedIntervention)}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5 text-primary" />
                  <span>Notify Parent</span>
                </button>
                )}

                {/* Admin Reassignment Action */}
                {isAdmin && ["pending", "in_progress"].includes(selectedIntervention.status) && (
                  <button
                    onClick={() => setShowReassignModal(true)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-blue-500" />
                    <span>Reassign</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Start Action — assignee and admins only */}
                {canAct && selectedIntervention.status === "pending" && (
                  <button
                    onClick={() => handleStart(selectedIntervention.id)}
                    disabled={actionLoading}
                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                  >
                    Start Intervention
                  </button>
                )}

                {/* Dismiss Action — assignee and admins only */}
                {canAct && ["pending", "in_progress"].includes(selectedIntervention.status) && (
                  <button
                    onClick={() => setShowDismissModal(true)}
                    disabled={actionLoading}
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                )}

                {/* Complete Action — assignee and admins only */}
                {canAct && ["pending", "in_progress"].includes(selectedIntervention.status) && (
                  <button
                    onClick={() => setShowCompleteModal(true)}
                    disabled={actionLoading}
                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Mark Completed
                  </button>
                )}
              </div>
            </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Dismissal Reason Modal */}
      {showDismissModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Dismiss Intervention</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              A valid reason is required to dismiss this intervention from the queue.
            </p>

            <textarea
              rows={3}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g. Student was absent due to verified medical leave; marks recovered in recent test..."
              className="mt-3 w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDismissModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleDismiss}
                disabled={actionLoading || !dismissReason.trim()}
                className="rounded-lg bg-destructive px-3.5 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {actionLoading ? "Dismissing..." : "Confirm Dismissal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Outcome Modal */}
      {showCompleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Complete Intervention</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Record outcome notes describing the action taken and resolution.
            </p>

            <textarea
              rows={3}
              value={outcomeNote}
              onChange={(e) => setOutcomeNote(e.target.value)}
              placeholder="e.g. Conducted remedial tutoring session; scheduled weekly check-in with guardian..."
              className="mt-3 w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {actionLoading ? "Saving..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reassign Modal */}
      {showReassignModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold text-foreground">Reassign Intervention</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Select an active staff member in this school to reassign responsibility.
            </p>

            <select
              value={reassignTarget}
              onChange={(e) => setReassignTarget(e.target.value)}
              className="mt-3 w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select active staff member...</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowReassignModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                disabled={actionLoading || !reassignTarget}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {actionLoading ? "Reassigning..." : "Confirm Reassignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notify Parent Confirmation Modal */}
      {showNotifyModal && selectedIntervention && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-primary/10 p-2 text-primary">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Notify Parent</h3>
                <p className="text-xs text-muted-foreground">Approved parent-safe communication template</p>
              </div>
            </div>

            <div className="mt-3 rounded-lg bg-accent/30 p-3 text-xs border border-border">
              <p className="font-semibold text-foreground">Message Preview:</p>
              <p className="mt-1 text-muted-foreground italic">
                {selectedIntervention.kind === "attendance"
                  ? `Notice regarding attendance for ${selectedIntervention.student_name}. Please contact the school to discuss support.`
                  : `Academic Support Notice for ${selectedIntervention.student_name}. Our academic team is working to assist in subject progress.`}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">
                🛡️ Internal risk scores, bands, factor weights, and staff notes are strictly excluded.
              </p>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNotifyModal(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleNotifyParent}
                disabled={actionLoading}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {actionLoading ? "Sending..." : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
