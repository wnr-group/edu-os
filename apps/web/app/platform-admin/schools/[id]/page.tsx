import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { DetailPageTemplate } from "@/components/detail-page-template";
import { ToggleActiveButton } from "./toggle-active-button";
import { ViewAsButton } from "./view-as-button";
import { OverviewTab } from "./overview-tab";
import { UsersTab } from "./users-tab";
import { ImportTab } from "./import-tab";
import { ModulesTab } from "./modules-tab";
import type { FeatureKey } from "@erp/shared";

export default async function SchoolDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab ?? "overview";

  const supabase = createServiceSupabaseClient();
  const { data: school } = await supabase
    .from("schools")
    .select("*")
    .eq("id", id)
    .single();

  if (!school) notFound();

  const { data: gateway } = await supabase
    .from("school_payment_gateways")
    .select("key_id, mode, status, account_name")
    .eq("school_id", id)
    .maybeSingle();

  // Fetch all role rows (including inactive) for the users tab
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("id, user_id, role, is_active")
    .eq("school_id", id);

  const userIds = [...new Set((roleRows ?? []).map((r) => r.user_id))];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from("profiles").select("id, full_name, email, phone").in("id", userIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const users = (roleRows ?? []).map((r) => {
    const profile = profileMap.get(r.user_id);
    return {
      id: r.user_id,
      roleId: r.id,
      full_name: profile?.full_name ?? "",
      email: profile?.email ?? "",
      phone: profile?.phone ?? "",
      role: r.role,
      is_active: r.is_active,
    };
  });

  // Compute role counts for overview
  const roleCounts = {
    school_admin: users.filter((u) => u.role === "school_admin" && u.is_active).length,
    principal: users.filter((u) => u.role === "principal" && u.is_active).length,
    teacher: users.filter((u) => u.role === "teacher" && u.is_active).length,
    student: users.filter((u) => u.role === "student" && u.is_active).length,
    parent: users.filter((u) => u.role === "parent" && u.is_active).length,
  };

  return (
    <DetailPageTemplate
      backHref="/platform-admin/schools"
      backLabel="Back to Schools"
      title={school.name}
      subtitle={`${school.contact_email ?? "No contact email"} · ${school.domain ?? "—"}`}
      badge={{ label: school.is_active ? "Active" : "Inactive", variant: school.is_active ? "default" : "secondary" }}
      actions={
        <>
          <ToggleActiveButton schoolId={school.id} isActive={school.is_active} />
          <ViewAsButton schoolDomain={school.domain ?? ""} />
        </>
      }
      basePath={`/platform-admin/schools/${school.id}`}
      activeTab={activeTab}
      tabs={[
        { key: "overview", label: "Overview", content: <OverviewTab school={school} roleCounts={roleCounts} /> },
        { key: "users", label: "Users", content: <UsersTab schoolId={school.id} users={users} /> },
        { key: "import", label: "Bulk Import", content: <ImportTab schoolId={school.id} /> },
        {
          key: "modules",
          label: "Modules",
          content: (
             <ModulesTab
              schoolId={school.id}
              featuresEnabled={(school.features_enabled ?? {}) as Partial<Record<FeatureKey, boolean>>}
              paymentGateway={
                gateway ?? { key_id: null, mode: null, status: "unconfigured", account_name: null }
              }
            />
          ),
        },
      ]}
    />
  );
}