"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase";
import type { ApplicationCard } from "./admissions-board";

const STAGE_ORDER = ["enquiry", "under_review", "offered", "enrolled"];

export function ReviewDrawer({
  app, onClose, onReject, onEnrol, onSaved,
}: {
  app: ApplicationCard; onClose: () => void; onReject: () => void; onEnrol: () => void; onSaved: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [score, setScore] = useState("");
  const [docsReviewed, setDocsReviewed] = useState(false);
  const [docsNote, setDocsNote] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [app.id]);

  async function load() {
    const supabase = createClient();
    const [{ data: d }, { data: ev }] = await Promise.all([
      supabase.from("admission_applications").select("*").eq("id", app.id).single(),
      supabase.from("admission_stage_events").select("from_stage, to_stage, note, created_at").eq("application_id", app.id).order("created_at", { ascending: false }),
    ]);
    setDetail(d);
    setEvents(ev ?? []);
    setScore(d?.entrance_test_score?.toString() ?? "");
    setDocsReviewed(d?.docs_reviewed ?? false);
    setDocsNote(d?.docs_note ?? "");
    setInternalNotes(d?.internal_notes ?? "");
  }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("save_application_review", {
      p_id: app.id, p_score: score ? Number(score) : null, p_docs_reviewed: docsReviewed,
      p_docs_note: docsNote, p_internal_notes: internalNotes, p_assigned_to: detail?.assigned_to ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved.");
    onSaved();
  }

  const currentIdx = STAGE_ORDER.indexOf(app.stage);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-bold">{app.applicantName}</h2>
              <p className="text-xs text-muted-foreground">{app.className} · applied {new Date(app.createdAt).toLocaleDateString()}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground">✕</button>
          </div>
          {app.stage !== "rejected" && (
            <div className="mt-4 flex items-center gap-1 overflow-x-auto text-xs font-semibold">
              {STAGE_ORDER.map((s, i) => (
                <span key={s} className={i <= currentIdx ? "text-indigo-600" : "text-muted-foreground"}>
                  {s.replace("_", " ")} {i < STAGE_ORDER.length - 1 && "→"}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5 p-5">
          {detail && (
            <>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Student</p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">DOB</p><p>{detail.date_of_birth ?? "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Gender</p><p className="capitalize">{detail.gender ?? "—"}</p></div>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">Parent</p>
                <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Name</p><p>{detail.parent_name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Phone</p><p>{detail.parent_phone}</p></div>
                  <div className="col-span-2"><p className="text-xs text-muted-foreground">Email</p><p>{detail.parent_email ?? "—"}</p></div>
                </div>
              </div>
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Review</p>
            <div className="space-y-3 rounded-xl bg-muted/30 p-3.5">
              <div>
                <label className="mb-1 block text-xs font-semibold">Entrance test score</label>
                <input value={score} onChange={(e) => setScore(e.target.value)} type="number" className="w-20 rounded-lg border border-input px-2 py-1.5 text-sm" /> <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input type="checkbox" checked={docsReviewed} onChange={(e) => setDocsReviewed(e.target.checked)} /> Documents reviewed
              </label>
              <input value={docsNote} onChange={(e) => setDocsNote(e.target.value)} placeholder="Docs note" className="w-full rounded-lg border border-input px-3 py-1.5 text-sm" />
              <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Internal notes" className="w-full rounded-lg border border-input px-3 py-1.5 text-sm" rows={3} />
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white">
                {saving ? "Saving…" : "Save review"}
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Activity</p>
            <div className="space-y-2">
              {events.map((ev, i) => (
                <div key={i} className="text-xs">
                  <p className="font-semibold">{ev.from_stage ? `${ev.from_stage} → ${ev.to_stage}` : `Created: ${ev.to_stage}`}</p>
                  <p className="text-muted-foreground">{new Date(ev.created_at).toLocaleString()}{ev.note ? ` · "${ev.note}"` : ""}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {app.stage !== "rejected" && !app.isConverted && (
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-white p-4">
            <button onClick={onReject} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600">Reject</button>
            {app.stage === "offered" && (
              <button onClick={onEnrol} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Enrol student</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}