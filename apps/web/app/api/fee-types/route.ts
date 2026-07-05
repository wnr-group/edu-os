import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const { data, error } = await supabase
    .from("fee_types")
    .select("id, name, category, is_predefined, is_one_time, is_refundable, is_optional")
    .or(`school_id.eq.${schoolId},school_id.is.null`)
    .order("is_predefined", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feeTypes: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name: string; category: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !["core", "ancillary", "miscellaneous"].includes(body.category)) {
    return NextResponse.json({ error: "name and valid category are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("fee_types")
    .insert({ name: body.name.trim(), category: body.category, is_predefined: false, school_id: schoolId })
    .select("id, name, category, is_predefined, is_one_time, is_refundable, is_optional")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A fee type with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ feeType: data }, { status: 201 });
}
