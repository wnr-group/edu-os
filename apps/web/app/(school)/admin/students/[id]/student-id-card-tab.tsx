"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import { ShieldOff, ShieldCheck, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

interface CardData {
  studentName: string;
  photoUrl: string | null;
  admissionNumber: string | null;
  rollNumber: string | null;
  className: string;
  sectionName: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  status: "active" | "revoked";
}

// Points at the current host's own /verify page, so the same code works on
// any school domain (local *.lvh.me or production *.eduos.wnradvisory.com)
// with no hardcoded domain. The page resolves live status server-side from
// the student id — the QR itself never needs to change on revoke/reactivate.
//
// lvh.me always resolves to 127.0.0.1, which means a different device on
// every machine — a phone scanning the QR can never reach it. Locally only,
// swap in NEXT_PUBLIC_LAN_HOST (set in .env.local, gitignored, never set in
// production) so the QR is reachable from a physical device on the same
// LAN. Production is untouched: the var is never set there, so this branch
// never fires and window.location.origin is used exactly as before.
function qrPayload(studentId: string): string {
  const { hostname, port, origin } = window.location;
  const isLocal = hostname.includes("lvh.me") || hostname === "localhost";
  const lanHost = process.env.NEXT_PUBLIC_LAN_HOST;
  const base = isLocal && lanHost ? `http://${lanHost}${port ? `:${port}` : ""}` : origin;
  return `${base}/verify/${studentId}`;
}

export function StudentIdCardTab({ studentId, schoolId }: { studentId: string; schoolId: string }) {
  const [data, setData] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [studentId]);

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const [{ data: student }, { data: school }, { data: enrollment }] = await Promise.all([
      supabase
        .from("student_profiles")
        .select("full_name, photo_url, admission_number, id_card_status, profile:profiles!profile_id(full_name)")
        .eq("id", studentId)
        .single(),
      supabase.from("schools").select("name, logo_url").eq("id", schoolId).single(),
      supabase
        .from("student_enrollments")
        .select("roll_number, class:classes(name), section:sections(name)")
        .eq("student_profile_id", studentId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (student) {
      const profile = student.profile as unknown as { full_name: string } | null;
      const cls = enrollment?.class as unknown as { name: string } | null;
      const sec = enrollment?.section as unknown as { name: string } | null;
      setData({
        studentName: profile?.full_name || (student as unknown as { full_name: string }).full_name || "Student",
        photoUrl: (student as unknown as { photo_url: string | null }).photo_url,
        admissionNumber: student.admission_number,
        rollNumber: enrollment?.roll_number ?? null,
        className: cls?.name ?? "—",
        sectionName: sec?.name ?? "—",
        schoolName: school?.name ?? "School",
        schoolLogoUrl: school?.logo_url ?? null,
        status: student.id_card_status as "active" | "revoked",
      });
      setQrDataUrl(await QRCode.toDataURL(qrPayload(studentId), { margin: 1, width: 160 }));
    }
    setLoading(false);
  }

  async function handleRevoke() {
    if (!confirm("Revoke this student's ID card? It will immediately show as invalid.")) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("revoke_student_id_card", { p_student_id: studentId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("ID card revoked.");
    load();
  }

  async function handleReactivate() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("reactivate_student_id_card", { p_student_id: studentId });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("ID card reactivated.");
    load();
  }

  function handlePrint() {
    window.print();
  }

  if (loading || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;

  const revoked = data.status === "revoked";

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div
        className={`relative w-[340px] overflow-hidden rounded-2xl border shadow-sm ${
          revoked ? "border-red-200 opacity-80 grayscale" : "border-border"
        }`}
      >
        <div className="flex items-center gap-2.5 bg-primary/10 px-4 py-3">
          {data.schoolLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.schoolLogoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{data.schoolName}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Student ID Card</p>
          </div>
        </div>

        <div className="flex gap-4 bg-card px-4 py-4">
          <div className="shrink-0">
            {data.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photoUrl} alt={data.studentName} className="h-20 w-20 rounded-lg border border-border object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-muted text-xl font-bold text-muted-foreground">
                {data.studentName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-base font-bold text-foreground">{data.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {data.className} · Section {data.sectionName}
            </p>
            {data.rollNumber && <p className="text-xs text-muted-foreground">Roll No: {data.rollNumber}</p>}
            {data.admissionNumber && <p className="text-xs text-muted-foreground">Adm No: {data.admissionNumber}</p>}
          </div>
        </div>

        <div className="flex items-center justify-center border-t border-border bg-card py-3">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="ID card QR code" className="h-[100px] w-[100px]" />
          )}
        </div>

        {revoked && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/5">
            <span className="-rotate-12 rounded-md border-4 border-red-600 px-4 py-1.5 text-xl font-black uppercase tracking-widest text-red-600">
              Revoked
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            revoked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {revoked ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          {revoked ? "Revoked" : "Active"}
        </span>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="h-3.5 w-3.5" />
          Print
        </Button>
        {revoked ? (
          <Button onClick={handleReactivate} disabled={busy}>
            {busy ? "Reactivating…" : "Reactivate card"}
          </Button>
        ) : (
          <Button variant="destructive" onClick={handleRevoke} disabled={busy}>
            {busy ? "Revoking…" : "Revoke card"}
          </Button>
        )}
      </div>
    </div>
  );
}
