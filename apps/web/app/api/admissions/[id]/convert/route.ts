import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

    return NextResponse.json({ studentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Conversion failed" }, { status: 400 });
  }
}