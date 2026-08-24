import type { Metadata } from "next";
import { ShieldCheck, ShieldOff, ShieldQuestion } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ID Card Verification | EduOS",
  robots: { index: false, follow: false },
};

interface VerifyResult {
  student_name: string;
  photo_url: string | null;
  admission_number: string | null;
  class_name: string | null;
  section_name: string | null;
  school_name: string;
  school_logo_url: string | null;
  status: "active" | "revoked";
}

// Stored photo URLs use whatever NEXT_PUBLIC_SUPABASE_URL was at upload
// time — locally that's http://127.0.0.1:54321, which means "this device,"
// not "the dev machine," to whichever phone opens this page after scanning
// a QR. Rewrite to a LAN-reachable Supabase URL only when one is configured
// (NEXT_PUBLIC_STORAGE_LAN_URL, gitignored .env.local, never set in
// production) — same pattern as the mobile app's existing fixStorageUrl().
function fixStorageUrl(url: string): string {
  const lanUrl = process.env.NEXT_PUBLIC_STORAGE_LAN_URL;
  if (!lanUrl) return url;
  const lanHost = new URL(lanUrl).host;
  return url.replace(/\/\/127\.0\.0\.1:\d+/, `//${lanHost}`);
}

export default async function VerifyIdCardPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("verify_student_id_card", { p_student_id: studentId });
  const raw = data as VerifyResult | null;
  const result = raw ? { ...raw, photo_url: raw.photo_url ? fixStorageUrl(raw.photo_url) : null } : null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F6F9FB] px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {!result ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ShieldQuestion className="h-10 w-10 text-slate-400" />
            <p className="text-base font-semibold text-slate-800">Card not found</p>
            <p className="text-sm text-slate-500">This QR code doesn&apos;t match any EduOS student ID card.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
              {result.school_logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.school_logo_url} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{result.school_name}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Digital ID Card Verification</p>
              </div>
            </div>

            <div className="flex items-center gap-4 py-5">
              {result.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.photo_url} alt={result.student_name} className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-lg font-bold text-slate-400">
                  {result.student_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-base font-bold text-slate-800">{result.student_name}</p>
                {(result.class_name || result.section_name) && (
                  <p className="text-xs text-slate-500">
                    {result.class_name}
                    {result.section_name ? ` · Section ${result.section_name}` : ""}
                  </p>
                )}
                {result.admission_number && <p className="text-xs text-slate-500">Adm No: {result.admission_number}</p>}
              </div>
            </div>

            <div
              className={`flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold ${
                result.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              {result.status === "active" ? (
                <>
                  <ShieldCheck className="h-4 w-4" /> Valid ID Card
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4" /> Revoked — Not Valid
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
