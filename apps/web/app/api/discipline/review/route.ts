import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { incidentId: string; status: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { incidentId, status } = body;
  if (!incidentId || !status) {
    return NextResponse.json({ error: "incidentId and status are required" }, { status: 400 });
  }

  if (status !== "pending" && status !== "reviewed") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error, count } = await supabase
    .from("discipline_records")
    .update({ status }, { count: "exact" })
    .eq("id", incidentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: "Forbidden or record not found" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}

