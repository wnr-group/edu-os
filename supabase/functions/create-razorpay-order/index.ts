import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (!roleRow || roleRow.role !== "parent") {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    const { amount_paise, student_id, line_item_ids } = await req.json();

    if (
      typeof amount_paise !== "number" ||
      amount_paise <= 0 ||
      !student_id ||
      !line_item_ids?.length
    ) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: sp } = await adminClient
      .from("student_profiles")
      .select("parent_profile_id, school_id")
      .eq("id", student_id)
      .single();

    if (!sp || sp.parent_profile_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // F1-B (ERP-61): online_payments must be explicitly ON for this school.
    const { data: paymentsEnabled, error: featureErr } = await adminClient
      .rpc("feature_enabled", { p_school_id: sp.school_id, p_key: "online_payments" });

    if (featureErr || !paymentsEnabled) {
      return new Response(
        JSON.stringify({ error: "Online payments are not enabled for this school" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // ERP-63: per-school gateway credentials, replacing the old global env keys.
    const { data: gateway } = await adminClient
      .from("school_payment_gateways")
      .select("key_id, status")
      .eq("school_id", sp.school_id)
      .maybeSingle();

    if (!gateway || gateway.status !== "configured" || !gateway.key_id) {
      return new Response(
        JSON.stringify({ error: "Payments are not set up for this school yet" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: keySecret, error: secretErr } = await adminClient
      .rpc("get_payment_secret", { p_school_id: sp.school_id, p_kind: "key_secret" });

    if (secretErr || !keySecret) {
      console.error("Missing Razorpay key secret for school:", sp.school_id, secretErr);
      return new Response(
        JSON.stringify({ error: "Payments are not set up for this school yet" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${gateway.key_id}:${keySecret}`),
      },
      body: JSON.stringify({
        amount: Math.round(amount_paise),
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
        notes: {
          student_id,
          line_item_ids: line_item_ids.join(","),
        },
      }),
    });

    if (!razorpayRes.ok) {
      const errBody = await razorpayRes.text();
      return new Response(
        JSON.stringify({ error: "Failed to create payment order", detail: errBody }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const order = await razorpayRes.json();

    return new Response(
      JSON.stringify({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        // New: lets mobile drop the build-time EXPO_PUBLIC_RAZORPAY_KEY_ID env
        // var, which couldn't vary per school. Phase 3 wires this up.
        key_id: gateway.key_id,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});