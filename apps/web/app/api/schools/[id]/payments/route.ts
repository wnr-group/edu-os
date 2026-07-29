import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";
import { logAudit } from "@erp/shared";

export async function PATCH(
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

  const body = await request.json();
  const { key_id, key_secret, webhook_secret, account_name } = body as {
    key_id?: string; key_secret?: string; webhook_secret?: string; account_name?: string;
  };

  if (key_id && !/^rzp_(test|live)_/.test(key_id)) {
    return NextResponse.json({ error: "Key ID must start with rzp_test_ or rzp_live_" }, { status: 400 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Secrets go straight to Vault, never through the schools_payment_gateways row.
  if (key_secret) {
    const { error } = await adminClient.rpc("set_payment_secret", {
      p_school_id: schoolId, p_kind: "key_secret", p_value: key_secret,
    });
    if (error) return NextResponse.json({ error: "Failed to save key secret" }, { status: 500 });
  }
  if (webhook_secret) {
    const { error } = await adminClient.rpc("set_payment_secret", {
      p_school_id: schoolId, p_kind: "webhook_secret", p_value: webhook_secret,
    });
    if (error) return NextResponse.json({ error: "Failed to save webhook secret" }, { status: 500 });
  }

  // "configured" requires key_id + BOTH secrets present — either just-saved
  // above, or already in Vault from a previous save.
  const [{ data: hasKeySecret }, { data: hasWebhookSecret }] = await Promise.all([
    adminClient.rpc("get_payment_secret", { p_school_id: schoolId, p_kind: "key_secret" }),
    adminClient.rpc("get_payment_secret", { p_school_id: schoolId, p_kind: "webhook_secret" }),
  ]);
  const status = key_id && hasKeySecret && hasWebhookSecret ? "configured" : "unconfigured";

  const { data: gateway, error: upsertError } = await adminClient
    .from("school_payment_gateways")
    .upsert(
      {
        school_id: schoolId,
        key_id: key_id || undefined,
        account_name: account_name || undefined,
        status,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "school_id" }
    )
    .select("school_id, key_id, mode, status, account_name, updated_at")
    .single();

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 400 });

  await logAudit(supabase, {
    schoolId,
    action: "school.payment_gateway_updated",
    entityType: "school_payment_gateways",
    entityId: schoolId,
    metadata: { key_id: gateway.key_id, status: gateway.status },
  });

  return NextResponse.json(gateway); // secrets never included, by construction
}