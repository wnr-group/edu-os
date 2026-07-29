import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: schoolId } = await params;
  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  let { key_id: keyId, key_secret: keySecret } = body as { key_id?: string; key_secret?: string };

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // No unsaved values in the request — fall back to whatever's already saved.
  if (!keyId || !keySecret) {
    const { data: gateway } = await adminClient
      .from("school_payment_gateways")
      .select("key_id")
      .eq("school_id", schoolId)
      .maybeSingle();
    const { data: savedSecret } = await adminClient.rpc("get_payment_secret", {
      p_school_id: schoolId, p_kind: "key_secret",
    });
    keyId = keyId || gateway?.key_id || undefined;
    keySecret = keySecret || savedSecret || undefined;
  }

  if (!keyId || !keySecret) {
    return NextResponse.json({ success: false, message: "No credentials to test yet." });
  }

  // Note: this only validates key_id/key_secret via a live, side-effect-free
  // Razorpay API call. There is no equivalent way to "test" the webhook
  // secret without an actual webhook delivery — this button can't cover that half.
  try {
    const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
      headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    });
    if (res.ok) {
      return NextResponse.json({ success: true, message: "Connected — credentials are valid." });
    }
    return NextResponse.json({ success: false, message: `Razorpay rejected these credentials (${res.status}).` });
  } catch {
    return NextResponse.json({ success: false, message: "Could not reach Razorpay." });
  }
}