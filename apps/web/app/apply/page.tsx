import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { ApplyForm } from "./apply-form";

export default async function ApplyPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const domain = host.replace(/:\d+$/, "");

  // Anon client — get_public_admission_config is SECURITY DEFINER and
  // granted to anon; no session or service-role client needed here.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: config } = await supabase.rpc("get_public_admission_config", { p_school_domain: domain });

  if (!config) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <p style={{ color: "#64748B" }}>This school isn't accepting applications right now.</p>
      </div>
    );
  }

  if (!config.is_open) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>{config.school_name}</h1>
          <p style={{ color: "#64748B" }}>Admissions are currently closed. Please check back later.</p>
        </div>
      </div>
    );
  }

  return <ApplyForm config={config} schoolId={config.school_id} />;
}