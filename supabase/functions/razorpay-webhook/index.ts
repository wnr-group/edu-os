import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const macBytes = new Uint8Array(mac);

  // Decode incoming hex signature to bytes for constant-time comparison
  if (signature.length !== macBytes.length * 2) return false;
  const sigBytes = new Uint8Array(macBytes.length);
  for (let i = 0; i < macBytes.length; i++) {
    sigBytes[i] = parseInt(signature.substring(i * 2, i * 2 + 2), 16);
  }
  // Use Deno's timing-safe comparison
  try {
    return Deno.timingSafeEqual(macBytes, sigBytes);
  } catch {
    // Fallback: constant-time comparison via reduce
    let diff = 0;
    for (let i = 0; i < macBytes.length; i++) {
      diff |= macBytes[i] ^ sigBytes[i];
    }
    return diff === 0;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // ── ERP-63: per-school secret means we must know WHICH school before we can
  // verify anything. Chicken-and-egg: parse the (as-yet-unverified) body just
  // far enough to extract notes.student_id — used ONLY as a lookup key to find
  // a school_id and that school's webhook secret. Nothing derived from the
  // body is trusted or acted on until verifySignature() below succeeds; the
  // worst a forged student_id can do is route to the wrong school's secret,
  // against which a forged signature will not verify (edge case #10).
  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const paymentEntity = (event.payload as Record<string, unknown>)?.payment as Record<string, unknown>;
  const payment = paymentEntity?.entity as Record<string, unknown>;
  const notes = (payment?.notes ?? {}) as Record<string, string>;
  const studentId = notes.student_id ?? "";

  if (!payment || !studentId) {
    // Can't identify a school to verify against. Not necessarily malicious —
    // could be a Razorpay event type this endpoint doesn't subscribe to — but
    // with no school context there is nothing safe to do except reject.
    return new Response("Bad payload", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: sp } = await supabase
    .from("student_profiles")
    .select("school_id, parent_profile_id")
    .eq("id", studentId)
    .single();

  if (!sp) return new Response("Student not found", { status: 404 });

  const { data: webhookSecret, error: secretErr } = await supabase
    .rpc("get_payment_secret", { p_school_id: sp.school_id, p_kind: "webhook_secret" });

  if (secretErr || !webhookSecret) {
    console.error("Missing Razorpay webhook secret for school:", sp.school_id, secretErr);
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Verification happens here — only now, only against the resolved school's secret.
  const valid = await verifySignature(rawBody, signature, webhookSecret);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  // Everything below this line is unchanged from before ERP-63 — same
  // idempotency handling, same payment/line-item insert logic, same status
  // recompute. Not gated on online_payments (edge case #7): if an order was
  // created while the flag was on and payment completes after it's flipped
  // off, the money has already moved — the webhook must still record it.
  if (event.event !== "payment.captured") {
    return new Response("Ignored", { status: 200 });
  }

  const orderId = String(payment.order_id ?? "");
  const paymentId = String(payment.id ?? "");
  const amountPaise = Number(payment.amount ?? 0);
  const lineItemIds = (notes.line_item_ids ?? "").split(",").filter(Boolean);

  if (lineItemIds.length === 0) {
    return new Response("Missing notes", { status: 400 });
  }

  // Idempotency check
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("razorpay_payment_id", paymentId)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  }

  const totalAmount = amountPaise / 100;

  // Insert payment record
  const { data: paymentRow, error: payErr } = await supabase
    .from("payments")
    .insert({
      school_id: sp.school_id,
      student_id: studentId,
      paid_by_profile_id: sp.parent_profile_id,
      total_amount: totalAmount,
      payment_method: "online",
      mode: "online",
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      transaction_id: paymentId,
    })
    .select("id")
    .single();

  if (payErr || !paymentRow) {
    console.error("Payment insert error:", payErr);
    return new Response("Payment insert failed", { status: 500 });
  }

  // Fetch line items to compute amount per item
  const { data: lineItems } = await supabase
    .from("fee_line_items")
    .select("id, total_amount")
    .in("id", lineItemIds);

  for (const li of lineItems ?? []) {
    const { data: existingLip } = await supabase
      .from("line_item_payments")
      .select("amount_applied")
      .eq("line_item_id", li.id);

    const alreadyPaid = (existingLip ?? []).reduce(
      (s: number, r: { amount_applied: number }) => s + (r.amount_applied ?? 0),
      0
    );
    const amountToApply = Math.max(0, Number(li.total_amount) - alreadyPaid);
    if (amountToApply <= 0) continue;

    const { error: lipInsertError } = await supabase.from("line_item_payments").insert({
      payment_id: paymentRow.id,
      line_item_id: li.id,
      amount_applied: amountToApply,
    });
    if (lipInsertError) { console.error("lip insert failed:", li.id, lipInsertError.message); continue; }

    // Recompute status
    const { data: allLip } = await supabase
      .from("line_item_payments")
      .select("amount_applied")
      .eq("line_item_id", li.id);

    const totalPaid = (allLip ?? []).reduce(
      (s: number, r: { amount_applied: number }) => s + (r.amount_applied ?? 0),
      0
    );
    const status = totalPaid >= Number(li.total_amount) ? "paid" : totalPaid > 0 ? "partial" : "pending";

    const { error: statusError } = await supabase.from("fee_line_items").update({ status }).eq("id", li.id);
    if (statusError) console.error("status update failed:", li.id, statusError.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});