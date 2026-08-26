"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, AlertTriangle, Clock, FileText, Settings, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
export interface QueueRow {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  documentTypeName: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  status: string;
  expiresOn: string | null;
  createdAt: string;
}
interface IncompleteRow { studentId: string; studentName: string; className: string; missing: number }

interface Props {
  recordsCompletePct: number;
  fullyVerifiedCount: number;
  totalStudents: number;
  incompleteCount: number;
  toVerify: QueueRow[];
  expiring: QueueRow[];
  expiredCount: number;
  incompleteStudents: IncompleteRow[];
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function KycDashboard({
  recordsCompletePct, fullyVerifiedCount, totalStudents, incompleteCount,
  toVerify, expiring, expiredCount, incompleteStudents,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"verify" | "incomplete" | "expiring">("verify");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const pathname = usePathname();
const settingsHref = pathname.startsWith("/principal") ? "/principal/kyc/settings" : "/admin/kyc/settings";
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  async function handleView(id: string) {
    const res = await fetch(`/api/kyc/${id}/url`);
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "Could not open document"); return; }
    window.open(data.url, "_blank");
  }

  async function handleVerifySelected() {
    if (selected.size === 0) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("verify_documents", { p_ids: [...selected] });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Verified ${selected.size} document${selected.size !== 1 ? "s" : ""}.`);
    setSelected(new Set());
    router.refresh();
  }

  async function handleReject() {
    if (selected.size === 0) return;
    const reason = prompt("Reason for rejection (shown to whoever re-uploads):") ?? "";
    setBusy(true);
    const supabase = createClient();
    for (const id of selected) {
      await supabase.rpc("reject_document", { p_id: id, p_reason: reason });
    }
    setBusy(false);
    toast.success("Rejected.");
    setSelected(new Set());
    router.refresh();
  }

  const activeRows = tab === "verify" ? toVerify : tab === "expiring" ? expiring : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">KYC › Documents</p>
          <h1 className="text-2xl font-bold text-gray-900">Student documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">Verify what's been submitted and see, at a glance, whose records are still incomplete.</p>
        </div>
        <Link href={settingsHref} className="flex items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted">
          <Settings className="h-3.5 w-3.5" /> Document types
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-indigo-600 p-5 text-white">
          <div className="flex items-center gap-2 text-sm text-indigo-100"><ShieldCheck className="h-4 w-4" /> Records complete</div>
          <p className="mt-2 text-2xl font-bold">{recordsCompletePct}%</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/25"><div className="h-1.5 rounded-full bg-white" style={{ width: `${recordsCompletePct}%` }} /></div>
          <p className="mt-1 text-xs text-indigo-100">{fullyVerifiedCount} of {totalStudents} students fully verified</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-red-500" /> Incomplete students</div>
          <p className="mt-2 text-2xl font-bold text-red-600">{incompleteCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">missing a required document</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4 text-indigo-500" /> Pending verification</div>
          <p className="mt-2 text-2xl font-bold text-foreground">{toVerify.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">uploaded, awaiting review</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><AlertTriangle className="h-4 w-4 text-amber-500" /> Expiring / expired</div>
          <p className="mt-2 text-2xl font-bold text-amber-600">{expiring.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">{expiring.length - expiredCount} expiring in 30 days · {expiredCount} expired</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
            <button onClick={() => setTab("verify")} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "verify" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              To verify <span className="rounded-full bg-indigo-100 px-1.5 text-indigo-700">{toVerify.length}</span>
            </button>
            <button onClick={() => setTab("incomplete")} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "incomplete" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              Incomplete students <span className="rounded-full bg-muted-foreground/10 px-1.5">{incompleteStudents.length}</span>
            </button>
            <button onClick={() => setTab("expiring")} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "expiring" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              Expiring <span className="rounded-full bg-amber-100 px-1.5 text-amber-700">{expiring.length}</span>
            </button>
          </div>
        </div>

        {tab === "incomplete" ? (
          <div className="divide-y divide-border">
            {incompleteStudents.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted-foreground">No incomplete records.</div>}
            {incompleteStudents.map((s) => (
              <Link key={s.studentId} href={`/admin/students/${s.studentId}?tab=documents`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-muted/40">
                <div>
                  <p className="font-medium text-foreground">{s.studentName}</p>
                  <p className="text-xs text-muted-foreground">{s.className}</p>
                </div>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{s.missing} missing</span>
              </Link>
            ))}
          </div>
        ) : (
          <>
            {tab === "verify" && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.size > 0 && selected.size === activeRows.length}
                    onChange={(e) => setSelected(e.target.checked ? new Set(activeRows.map((r) => r.id)) : new Set())} />
                  <span className="text-sm text-muted-foreground">{selected.size} documents selected</span>
                  <Button onClick={handleVerifySelected} disabled={selected.size === 0 || busy} size="sm" className="ml-2">
                    {busy ? "Working…" : "Verify selected"}
                  </Button>
                  <Button onClick={handleReject} disabled={selected.size === 0 || busy} size="sm" variant="outline">Reject…</Button>
                </div>
                <span className="text-xs text-muted-foreground">Only school admin &amp; principal can verify</span>
              </div>
            )}
            <div className="divide-y divide-border">
              {activeRows.length === 0 && <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing here.</div>}
              {activeRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="flex items-center gap-3">
                    {tab === "verify" && (
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{r.studentName}</p>
                      <p className="text-xs text-muted-foreground">{r.className} · {r.documentTypeName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> {r.fileName}</p>
                      <p>{r.fileSize ? `${Math.round(r.fileSize / 1024)} KB` : ""} · {timeAgo(r.createdAt)}</p>
                    </div>
                    <button onClick={() => handleView(r.id)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Completeness is live, not a nightly snapshot — each student's checklist is computed on read, so the moment a
          document is uploaded or verified the numbers update. Expiry is checked the same way, the instant a record is
          read — no scheduled job. Documents live in a private bucket; every "View" opens a fresh 60-second signed link,
          visible to admin &amp; principal (and a class teacher for their own students), never a public URL.
        </p>
      </div>
    </div>
  );
}