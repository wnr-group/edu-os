import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: {
    school_id?: string; form_ts?: number; honeypot?: string;
    applicant_name?: string; date_of_birth?: string; gender?: string; class_applied_id?: string;
    parent_name?: string; parent_phone?: string; parent_email?: string;
    previous_school?: string; area?: string; applicant_note?: string;
  };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }

  // Bot traps — silent fake-success, no insert, never reveal the trap.
  if (body.honeypot) return json({ ok: true, reference_no: "A-0000" }, 200);
  if (!body.form_ts || Date.now() - body.form_ts < 2000) return json({ ok: true, reference_no: "A-0000" }, 200);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const schoolId = body.school_id;
  if (!schoolId) return json({ ok: false, reason: "missing_school" }, 200);

  const { data: school } = await admin.from("schools").select("id, is_active").eq("id", schoolId).maybeSingle();
  if (!school || !school.is_active) return json({ ok: false, reason: "not_found" }, 200);

  const { data: enabled } = await admin.rpc("feature_enabled", { p_school_id: schoolId, p_key: "admissions" });
  if (!enabled) return json({ ok: false, reason: "not_found" }, 200);

  const { data: settings } = await admin.from("admission_settings").select("*").eq("school_id", schoolId).maybeSingle();
  if (!settings?.is_open) return json({ ok: false, reason: "closed" }, 200);

  // Soft rate-limit — row count, no separate table.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const normalizedPhone = `+91${(body.parent_phone ?? "").replace(/\D/g, "").slice(-10)}`;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const [{ count: phoneCount }, { count: ipCount }] = await Promise.all([
    admin.from("admission_applications").select("id", { count: "exact", head: true })
      .eq("parent_phone", normalizedPhone).gte("created_at", oneHourAgo),
    ip
      ? admin.from("admission_applications").select("id", { count: "exact", head: true })
          .eq("submit_ip", ip).gte("created_at", oneHourAgo)
      : Promise.resolve({ count: 0 }),
  ]);
  if ((phoneCount ?? 0) >= 3 || (ipCount ?? 0) >= 10) {
    return json({ ok: false, reason: "rate_limited" }, 200);
  }

  if (!body.applicant_name || !body.class_applied_id || !body.parent_name || !/^\+91\d{10}$/.test(normalizedPhone)) {
    return json({ ok: false, reason: "invalid_fields" }, 200);
  }

  const yearId = settings.admission_academic_year_id
    ?? (await admin.rpc("get_active_academic_year", { p_school_id: schoolId })).data;
  if (!yearId) return json({ ok: false, reason: "no_academic_year" }, 200);

  const { data: onlinePaymentsOn } = await admin.rpc("feature_enabled", { p_school_id: schoolId, p_key: "online_payments" });
  const feeAmount = onlinePaymentsOn ? (settings.application_fee ?? 0) : 0;

  const { data: refSeq } = await admin
    .from("admission_settings")
    .update({ next_ref_seq: (settings.next_ref_seq ?? 1) + 1 })
    .eq("school_id", schoolId)
    .select("next_ref_seq")
    .single();
  const referenceNo = `A-${(refSeq?.next_ref_seq ?? settings.next_ref_seq ?? 1) - 1}`;

  const baseRow = {
    school_id: schoolId, academic_year_id: yearId, reference_no: referenceNo,
    applicant_name: body.applicant_name, date_of_birth: body.date_of_birth || null,
    gender: body.gender || null, class_applied_id: body.class_applied_id,
    parent_name: body.parent_name, parent_phone: normalizedPhone, parent_email: body.parent_email || null,
    previous_school: body.previous_school || null, area: body.area || null, applicant_note: body.applicant_note || null,
    source: "online", submit_ip: ip, fee_amount: feeAmount,
  };

  if (feeAmount === 0) {
    const { data: app, error } = await admin
      .from("admission_applications")
      .insert({ ...baseRow, stage: "enquiry", payment_status: "not_required" })
      .select("id")
      .single();
    if (error || !app) return json({ ok: false, reason: "insert_failed" }, 200);

    await admin.from("admission_stage_events").insert({
      application_id: app.id, school_id: schoolId, from_stage: null, to_stage: "enquiry", actor_id: null,
    });

    return json({ ok: true, reference_no: referenceNo });
  }

  // Fee path — Story C
  const { data: gateway } = await admin
    .from("school_payment_gateways").select("key_id, status").eq("school_id", schoolId).maybeSingle();
  if (!gateway || gateway.status !== "configured" || !gateway.key_id) {
    return json({ ok: false, reason: "payments_unavailable" }, 200);
  }

  const { data: keySecret } = await admin.rpc("get_payment_secret", { p_school_id: schoolId, p_kind: "key_secret" });
  if (!keySecret) return json({ ok: false, reason: "payments_unavailable" }, 200);

  const { data: app, error } = await admin
    .from("admission_applications")
    .insert({ ...baseRow, stage: "enquiry", payment_status: "pending" })
    .select("id")
    .single();
  if (error || !app) return json({ ok: false, reason: "insert_failed" }, 200);

  const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${gateway.key_id}:${keySecret}`) },
    body: JSON.stringify({
      amount: feeAmount, currency: "INR", receipt: `adm_${Date.now()}`,
      notes: { application_id: app.id },
    }),
  });

  if (!razorpayRes.ok) return json({ ok: false, reason: "payments_unavailable" }, 200);
  const order = await razorpayRes.json();

  await admin.from("admission_applications").update({ razorpay_order_id: order.id }).eq("id", app.id);

  return json({
    ok: true, reference_no: referenceNo, order_id: order.id, key_id: gateway.key_id, amount: order.amount,
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
