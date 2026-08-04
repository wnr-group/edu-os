import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  // Extracted directly from the URL path rather than the route's `params`
  // object — params was resolving to undefined in this environment
  // (destructuring `{ params }: { params: Promise<{ documentId: string }> }`
  // produced "undefined" as a literal string, which Postgres then rejected
  // as an invalid uuid). This is version-agnostic and sidesteps that entirely.
  const segments = request.nextUrl.pathname.split("/").filter(Boolean);
  const documentId = segments[segments.length - 2]; // .../api/kyc/{documentId}/url

  if (!documentId || documentId === "undefined") {
    return NextResponse.json({ error: "Missing document id" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("KYC url route: SUPABASE_SERVICE_ROLE_KEY is not set in this environment");
    return NextResponse.json({ error: "Server misconfigured — service role key missing" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: doc, error: docError } = await adminClient
    .from("kyc_documents")
    .select("school_id, subject_id, file_path")
    .eq("id", documentId)
    .maybeSingle();

  if (docError) {
    console.error("KYC url route: lookup errored", { documentId, docError });
    return NextResponse.json({ error: "Lookup failed", detail: docError.message }, { status: 500 });
  }
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const roles = await getActiveRoles(supabase, user.id);
  const isSchoolStaff = hasAnyRole(roles, ["school_admin", "principal"], doc.school_id);

  let authorized = isSchoolStaff;
  if (!authorized) {
    const { data: teaches } = await supabase.rpc("teaches_student", { p_student_id: doc.subject_id });
    authorized = !!teaches;
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: signed, error: signError } = await adminClient.storage
    .from("kyc-docs")
    .createSignedUrl(doc.file_path, 60);

  if (signError || !signed) {
    console.error("KYC url route: signing failed", { documentId, filePath: doc.file_path, signError });
    return NextResponse.json(
      { error: `Could not sign URL (file_path: ${doc.file_path})`, detail: signError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: signed.signedUrl });
}