import type { Metadata } from "next";
import { headers } from "next/headers";
import { createServiceSupabaseClient } from "../../../lib/supabase/server";
import { LoginForm } from "./login-form";
import { FindSchoolForm } from "./find-school-form";
import { getSchoolId } from "../../../lib/school";
export const metadata: Metadata = {
  title: "Login",
  robots: { index: false, follow: false },
};

const PLATFORM_ADMIN_DOMAINS = ["admin.balajierp.com", "core.lvh.me", "core.connectmyskool.com", "core.eduos.com"];

export default async function LoginPage() {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const domain = host.replace(/:\d+$/, "");

  if (PLATFORM_ADMIN_DOMAINS.includes(domain)) {
    return (
      <LoginForm
        schoolId={null}
        schoolName="EduOS Admin"
        primaryColor="#2B6CB0"
      />
    );
  }

  const schoolId = await getSchoolId();

  if (!schoolId) {
    return <FindSchoolForm host={host} />;
  }

  // Use service role to bypass RLS — login page is unauthenticated
  const supabase = createServiceSupabaseClient();
  const { data: school } = await supabase
    .from("schools")
    .select("id, name, primary_color")
    .eq("id", schoolId)
    .single();

  if (!school) {
    return <FindSchoolForm host={host} />;
  }

  return (
    <LoginForm
      schoolId={school.id}
      schoolName={school.name ?? "School Portal"}
      primaryColor={school.primary_color ?? "#2563EB"}
    />
  );
}