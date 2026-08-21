import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Locally, Deno.env.get("SUPABASE_URL") inside the edge runtime resolves to
// the internal Docker service address (http://kong:8000) — reachable from
// other containers, not from a browser or phone. createSignedUrl() builds
// its link from that address, so it needs rewriting to whatever host the
// client actually used to reach us. Kong (and any standard reverse proxy,
// including hosted Supabase's own front door) sets x-forwarded-host/-proto/
// -port to exactly that — no new config needed, and no environment branch:
// in production SUPABASE_URL is already the public URL, so this either
// rewrites to the same value or is a no-op there.
function toPublicUrl(internalUrl: string, req: Request): string {
  const host = req.headers.get("x-forwarded-host");
  if (!host) return internalUrl;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const port = req.headers.get("x-forwarded-port");
  const url = new URL(internalUrl);
  url.protocol = `${proto}:`;
  url.hostname = host;
  url.port = port && port !== "80" && port !== "443" ? port : "";
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // "list": verified medical documents for the parent's own child — the
    // KYC RLS policy has no parent branch at all (by design, for the admin
    // vault), so listing requires this service-role path, same as the
    // existing web signed-URL route does for viewing a single document.
    if (body.action === "list") {
      const { student_id } = body;
      if (!student_id) {
        return new Response(JSON.stringify({ error: "Missing student_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
      }
      const { data: sp } = await adminClient
        .from("student_profiles")
        .select("parent_profile_id")
        .eq("id", student_id)
        .maybeSingle();
      if (!sp || sp.parent_profile_id !== user.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
      }

      const { data: docs } = await adminClient
        .from("kyc_documents")
        .select("id, file_name, verified_at, document_type:document_types!document_type_id(name, category)")
        .eq("subject_id", student_id)
        .eq("subject_type", "student")
        .eq("status", "verified");

      const medicalDocs = (docs ?? [])
        .filter((d) => (d.document_type as unknown as { category: string } | null)?.category === "medical")
        .map((d) => ({
          id: d.id,
          file_name: d.file_name,
          verified_at: d.verified_at,
          document_type_name: (d.document_type as unknown as { name: string } | null)?.name ?? "Document",
        }));

      return new Response(JSON.stringify({ documents: medicalDocs }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // "url": a signed link for one specific document.
    const { document_id } = body;
    if (!document_id) {
      return new Response(JSON.stringify({ error: "Missing document_id" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Only verified medical documents are ever exposed here — a parent
    // should never see a document as if confirmed before an admin/principal
    // has actually verified it.
    const { data: doc } = await adminClient
      .from("kyc_documents")
      .select("subject_id, file_path, status, document_type:document_types!document_type_id(category)")
      .eq("id", document_id)
      .eq("status", "verified")
      .maybeSingle();

    if (!doc || (doc.document_type as unknown as { category: string } | null)?.category !== "medical") {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "Content-Type": "application/json" } });
    }

    const { data: sp } = await adminClient
      .from("student_profiles")
      .select("parent_profile_id")
      .eq("id", doc.subject_id)
      .maybeSingle();

    if (!sp || sp.parent_profile_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { "Content-Type": "application/json" } });
    }

    const { data: signed, error: signError } = await adminClient.storage
      .from("kyc-docs")
      .createSignedUrl(doc.file_path, 60);

    if (signError || !signed) {
      return new Response(JSON.stringify({ error: "Could not sign URL" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ url: toPublicUrl(signed.signedUrl, req) }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
