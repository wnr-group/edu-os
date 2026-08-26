import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveRoles, hasAnyRole } from "@/lib/auth/roles";

interface Params { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; category?: string };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.category && !["core", "ancillary", "miscellaneous"].includes(body.category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const updates: Record<string, string> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.category) updates.category = body.category;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("fee_types")
    .update(updates)
    .eq("id", id)
    .eq("is_predefined", false)
    .eq("school_id", schoolId)
    .select("id, name, category, is_predefined")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "A fee type with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });
  return NextResponse.json({ feeType: data });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const schoolId = await getSchoolId();
  if (!schoolId) return NextResponse.json({ error: "No school context" }, { status: 400 });

  const roles = await getActiveRoles(supabase, user.id);
  if (!hasAnyRole(roles, ["school_admin", "super_admin"], schoolId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error, count } = await supabase
    .from("fee_types")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("is_predefined", false)
    .eq("school_id", schoolId);

  if (error) {
    if (error.code === "23503") {
      return NextResponse.json(
        { error: "Cannot delete this fee type because student fee records are currently using it." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
