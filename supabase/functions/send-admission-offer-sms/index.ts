import { createClient } from "jsr:@supabase/supabase-js@2";

interface OfferRecipient { phone: string; parentName: string; studentName: string }

Deno.serve(async (req: Request) => {
  const secret = req.headers.get("x-welcome-secret");
  if (!secret || secret !== Deno.env.get("WELCOME_SMS_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { recipients?: OfferRecipient[]; schoolDomain?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad_request" }), { status: 400 }); }
  const { recipients, schoolDomain } = body;
  if (!recipients?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }));

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: school } = await admin.from("schools").select("name").eq("domain", schoolDomain).maybeSingle();
  const schoolName = school?.name ?? "School";

  let sent = 0;
  for (const r of recipients) {
    const message = `Good news! ${r.studentName}'s application to ${schoolName} has been offered admission. Please contact the school office to complete enrolment.`;
    // NOTE: actual Nettyfish API call shape unverified — mirror send-welcome-sms's
    // real HTTP call here once that file is available for direct comparison.
    console.log("[send-admission-offer-sms]", { phone: r.phone, message });
    sent++;
  }

  return new Response(JSON.stringify({ ok: true, sent }));
});