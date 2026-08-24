import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { findOrCreateUserByPhone, attachRole } from "@/lib/provisioning/find-or-create-user";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: appId } = await params;
  const body = await request.json().catch(() => ({}));
  const { sectionId, rollNumber, admissionNumber } = body as { sectionId: string; rollNumber?: string; admissionNumber?: string };
  if (!sectionId) return NextResponse.json({ error: "Section is required." }, { status: 400 });

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: app } = await adminClient
    .from("admission_applications")
    .select("id, school_id, stage, converted_student_id, applicant_name, parent_name, parent_phone")
    .eq("id", appId)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Same authz pattern as resolve-parent/route.ts.
  const { data: roles } = await supabase
    .from("user_roles").select("role, school_id").eq("user_id", user.id).eq("is_active", true);
  const allowed = (roles ?? []).some(
    (r) => r.role === "super_admin" || ((r.role === "school_admin" || r.role === "principal") && r.school_id === app.school_id)
  );
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (app.stage !== "offered") return NextResponse.json({ error: "Application must be Offered to convert." }, { status: 400 });
  if (app.converted_student_id) return NextResponse.json({ error: "Already converted." }, { status: 409 });

  const normalizedPhone = `+91${(app.parent_phone ?? "").replace(/\D/g, "").slice(-10)}`;
  if (!/^\+91\d{10}$/.test(normalizedPhone)) {
    return NextResponse.json({ error: "Invalid parent phone on file." }, { status: 400 });
  }

  try {
    const { userId } = await findOrCreateUserByPhone(adminClient, normalizedPhone, app.parent_name);
    await attachRole(adminClient, userId, app.school_id, "parent");

    const { data: studentId, error: rpcErr } = await supabase.rpc("finalize_conversion", {
      p_app_id: appId, p_parent_profile_id: userId, p_section_id: sectionId,
      p_roll_number: rollNumber || null, p_admission_number: admissionNumber || null,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 400 });

    // The event worth notifying staff about is enrollment, not enquiry
    // creation — admin-submit no longer notifies at all, since the
    // Admissions board already has its own enquiry-count badge and a push
    // for every enquiry would just duplicate it.
    await notifyEnrolled(adminClient, app.school_id, appId, app.applicant_name);

    return NextResponse.json({ studentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Conversion failed" }, { status: 400 });
  }
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyEnrolled(
  admin: SupabaseClient<any>,
  schoolId: string, applicationId: string, applicantName: string,
) {
  const { data: school } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
  const title = school?.name ?? "School";
  const messageBody = `${applicantName} has been enrolled as a student.`;

  // super_admin's own user_roles row is school_id IS NULL (platform-wide,
  // not scoped to any one school) — matched separately from the
  // same-school school_admin/principal branch.
  const { data: staff } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("is_active", true)
    .or(`and(school_id.eq.${schoolId},role.in.(school_admin,principal)),role.eq.super_admin`);

  for (const s of staff ?? []) {
    await admin.from("notifications").insert({
      school_id: schoolId, user_id: s.user_id, title, body: messageBody,
      type: "admission_enrolled", entity_type: "admission_application", entity_id: applicationId,
    });

    const { data: recipient } = await admin.from("profiles").select("push_token").eq("id", s.user_id).maybeSingle();
    if (recipient?.push_token) {
      const r = await sendExpoPush(recipient.push_token, title, messageBody);
      if (r === "device_not_registered") {
        await admin.from("profiles").update({ push_token: null }).eq("id", s.user_id);
      }
    }
  }
}

async function sendExpoPush(token: string, title: string, body: string): Promise<"ok" | "device_not_registered" | "failed"> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
    });
    const data = await res.json();
    const status = data?.data?.status;
    const errType = data?.data?.details?.error;
    if (status === "ok") return "ok";
    if (errType === "DeviceNotRegistered") return "device_not_registered";
    return "failed";
  } catch { return "failed"; }
}