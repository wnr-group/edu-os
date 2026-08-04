"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Plus, Link2, QrCode, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { AddEnquiryDrawer } from "./add-enquiry-drawer";
import { ReviewDrawer } from "./review-drawer";
import { EnrolDialog } from "./enrol-dialog";
import { AdmissionSettingsPanel } from "./admission-settings-panel";

export interface ApplicationCard {
  id: string;
  applicantName: string;
  parentPhone: string;
  className: string;
  stage: "enquiry" | "under_review" | "offered" | "enrolled" | "rejected";
  source: "online" | "walk_in";
  paymentStatus: "not_required" | "pending" | "paid";
  testScore: number | null;
  assignedTo: string | null;
  createdAt: string;
  isDuplicate: boolean;
  isConverted: boolean;
}
interface ClassOption { id: string; name: string }
interface Settings { is_open: boolean; application_fee: number; admission_academic_year_id: string | null }
interface YearOption { id: string; name: string; status: "draft" | "active" | "archived" }

const COLUMNS: { key: ApplicationCard["stage"]; label: string; dot: string }[] = [
  { key: "enquiry", label: "Enquiry", dot: "#3B82F6" },
  { key: "under_review", label: "Under review", dot: "#F59E0B" },
  { key: "offered", label: "Offered", dot: "#4F46E5" },
  { key: "enrolled", label: "Enrolled", dot: "#10B981" },
  { key: "rejected", label: "Rejected", dot: "#94A0B4" },
];

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Shared visual body — used both by the in-column card (with drag listeners
// attached) and the DragOverlay clone (a plain, non-interactive copy that
// follows the pointer). Keeping this in one place means the overlay can
// never visually drift from the real card.
function CardBody({ app }: { app: ApplicationCard }) {
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">
          {initials(app.applicantName)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{app.applicantName}</p>
          <p className="text-xs text-muted-foreground">{app.className} · {app.parentPhone}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">
          {app.source === "online" ? "Online" : "Walk-in"}
        </span>
        {app.paymentStatus === "paid" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Fee paid</span>}
        {app.paymentStatus === "not_required" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">No fee</span>}
        {app.testScore != null && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">Test {app.testScore}/100</span>}
        {app.isDuplicate && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600">Possible duplicate</span>}
        {app.isConverted && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Now a student</span>}
      </div>
    </>
  );
}

function Card({ app, onClick }: { app: ApplicationCard; onClick: () => void }) {
  const disabled = app.stage === "rejected" || app.stage === "enrolled";
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id, disabled });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md ${disabled ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"} ${app.stage === "rejected" ? "opacity-70" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      <CardBody app={app} />
    </div>
  );
}

// Rendered inside DragOverlay only — a free-floating, portal-rendered clone
// that trails the pointer above every column, unaffected by any column's
// overflow-y-auto clipping. Fixed width because it's outside the grid layout
// that normally sizes the card.
function CardDragPreview({ app }: { app: ApplicationCard }) {
  return (
    <div className="w-[260px] cursor-grabbing rounded-xl border border-border bg-card p-3 shadow-xl ring-2 ring-indigo-200">
      <CardBody app={app} />
    </div>
  );
}

function Column({ stage, label, dot, count, children, onAdd }: { stage: string; label: string; dot: string; count: number; children: React.ReactNode; onAdd?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div ref={setNodeRef} className={`flex min-h-[60vh] flex-col rounded-2xl border border-border bg-white/60 ${isOver ? "ring-2 ring-indigo-300" : ""}`}>
      <div className="flex items-center gap-2 px-3 py-3">
        <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
        <span className="text-sm font-bold">{label}</span>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{count}</span>
        {onAdd && (
          <button onClick={onAdd} className="ml-auto grid h-6 w-6 place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:bg-muted">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-3.5">{children}</div>
    </div>
  );
}

export function AdmissionsBoard({
  schoolId, applications, classes, settings, years, canManageSettings, awaitingPaymentCount, publicFormUrl,
}: {
  schoolId: string; applications: ApplicationCard[]; classes: ClassOption[]; settings: Settings;
  years: YearOption[]; canManageSettings: boolean; awaitingPaymentCount: number; publicFormUrl: string;
}) {
  const router = useRouter();
  const [showAwaitingPayment, setShowAwaitingPayment] = useState(false);
  const [addEnquiryOpen, setAddEnquiryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const map = new Map<string, ApplicationCard[]>();
    for (const c of COLUMNS) map.set(c.key, []);
    for (const app of applications) map.get(app.stage)?.push(app);
    return map;
  }, [applications]);

  const activeApp = applications.find((a) => a.id === activeId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const appId = active.id as string;
    const toStage = over.id as ApplicationCard["stage"];
    const app = applications.find((a) => a.id === appId);
    if (!app || app.stage === toStage) return;

    if (toStage === "enrolled") {
      if (app.stage !== "offered") { toast.error("Move the application to Offered before enrolling."); return; }
      setEnrollingId(appId);
      return;
    }
    if (toStage === "rejected") { setRejectingId(appId); return; }

    const supabase = createClient();
    const { error } = await supabase.rpc("advance_application", { p_id: appId, p_to_stage: toStage, p_note: null });
    if (error) { toast.error(error.message); return; }

    if (toStage === "offered") {
      await fetch(`/api/admissions/${appId}/notify-offer`, { method: "POST" }).catch(() => {});
    }

    router.refresh();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicFormUrl);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy automatically — copy the link above manually.");
    }
  }

  const reviewingApp = applications.find((a) => a.id === reviewingId) ?? null;
  const enrollingApp = applications.find((a) => a.id === enrollingId) ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Admissions › Pipeline</p>
          <h1 className="text-2xl font-bold text-foreground">Admissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every enquiry — online or walk-in — in one pipeline, from first contact to enrolled.</p>
        </div>
        <div className="flex gap-2">
          {canManageSettings && (
            <button onClick={() => setSettingsOpen(true)} className="rounded-lg border border-input px-3 py-2 text-sm font-medium hover:bg-muted">Settings</button>
          )}
          <button onClick={() => setAddEnquiryOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            <Plus className="h-3.5 w-3.5" /> Add enquiry
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600"><Link2 className="h-4 w-4" /></div>
        <div>
          <p className="text-sm font-semibold">Your public application form</p>
          <p className="text-xs text-muted-foreground">Share this with parents or print the QR for your front desk</p>
        </div>
        <span className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">{publicFormUrl || "not configured"}</span>
        <div className="ml-auto flex gap-2">
          <button onClick={copyLink} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            <Copy className="h-3.5 w-3.5" /> Copy link
          </button>
          <button className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            <QrCode className="h-3.5 w-3.5" /> QR code
          </button>
        </div>
      </div>

      {awaitingPaymentCount > 0 && (
        <button
          onClick={() => setShowAwaitingPayment((v) => !v)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${showAwaitingPayment ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700"}`}
        >
          Awaiting payment <span className="ml-1 rounded-full bg-white/70 px-1.5">{awaitingPaymentCount}</span>
        </button>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-5 gap-3.5 overflow-x-auto">
          {COLUMNS.map((col) => (
            <Column key={col.key} stage={col.key} label={col.label} dot={col.dot} count={byStage.get(col.key)?.length ?? 0} onAdd={col.key === "enquiry" ? () => setAddEnquiryOpen(true) : undefined}>
              {(byStage.get(col.key) ?? []).map((app) => (
                <Card key={app.id} app={app} onClick={() => setReviewingId(app.id)} />
              ))}
            </Column>
          ))}
        </div>
        <DragOverlay>{activeApp ? <CardDragPreview app={activeApp} /> : null}</DragOverlay>
      </DndContext>

      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <strong className="text-foreground">One pipeline, two front doors.</strong> Cards arrive from the public /apply form
        or an Add enquiry walk-in — identical from here on. Unpaid applications stay off the board until payment clears.
        Moving a card to Enrolled opens the enrol dialog — nothing becomes a student by accident.
      </div>

      {addEnquiryOpen && (
        <AddEnquiryDrawer schoolId={schoolId} classes={classes} onClose={() => setAddEnquiryOpen(false)} onSaved={() => { setAddEnquiryOpen(false); router.refresh(); }} />
      )}
      {canManageSettings && settingsOpen && (
        <AdmissionSettingsPanel schoolId={schoolId} settings={settings} years={years} onClose={() => setSettingsOpen(false)} onSaved={() => { setSettingsOpen(false); router.refresh(); }} />
      )}
      {reviewingApp && (
        <ReviewDrawer
          app={reviewingApp}
          onClose={() => setReviewingId(null)}
          onReject={() => { setRejectingId(reviewingApp.id); setReviewingId(null); }}
          onEnrol={() => { setEnrollingId(reviewingApp.id); setReviewingId(null); }}
          onSaved={() => router.refresh()}
        />
      )}
      {rejectingId && (
        <RejectPrompt
          onCancel={() => setRejectingId(null)}
          onConfirm={async (reason) => {
            const supabase = createClient();
            const { error } = await supabase.rpc("advance_application", { p_id: rejectingId, p_to_stage: "rejected", p_note: reason });
            setRejectingId(null);
            if (error) { toast.error(error.message); return; }
            toast.success("Application rejected.");
            router.refresh();
          }}
        />
      )}
      {enrollingApp && (
        <EnrolDialog app={enrollingApp} schoolId={schoolId} classes={classes} onClose={() => setEnrollingId(null)} onEnrolled={() => { setEnrollingId(null); router.refresh(); }} />
      )}
    </div>
  );
}

function RejectPrompt({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Reject application</h3>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className="mt-3 w-full rounded-lg border border-input p-3 text-sm" rows={3} />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-input px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => onConfirm(reason)} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reject</button>
        </div>
      </div>
    </div>
  );
}