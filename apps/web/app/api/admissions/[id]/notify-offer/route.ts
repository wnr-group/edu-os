import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendAdmissionOfferSms } from "@/lib/provisioning/send-admission-offer-sms";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: appId } = await params;
  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: app } = await adminClient
    .from("admission_applications")
    .select("school_id, applicant_name, parent_name, parent_phone, stage")
    .eq("id", appId)
    .maybeSingle();
  if (!app || app.stage !== "offered") return NextResponse.json({ ok: false }, { status: 400 });

  const { data: school } = await adminClient.from("schools").select("domain").eq("id", app.school_id).single();
  if (school?.domain) {
    await sendAdmissionOfferSms(app.parent_phone, app.parent_name, app.applicant_name, school.domain).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}