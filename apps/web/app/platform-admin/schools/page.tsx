import Link from "next/link";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { Building2, CheckCircle2, XCircle, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { KpiCard, KpiGrid } from "@/components/kpi-card";
import { SchoolsTable } from "./schools-table";

interface SchoolRow {
  id: string;
  name: string;
  contact_email: string | null;
  is_active: boolean;
  created_at: string;
}

export default async function SchoolsPage() {
  const supabase = createServiceSupabaseClient();
  const { data: schools } = await supabase
    .from("schools")
    .select("id, name, contact_email, is_active, created_at")
    .order("created_at", { ascending: false });

  const rows = (schools ?? []) as SchoolRow[];
  const activeCount = rows.filter((s) => s.is_active).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <SchoolsTable
      rows={rows}
      headerAction={
        <Link href="/platform-admin/schools/new" className={buttonVariants({ variant: "default", size: "sm" })}>
          <Plus className="h-3.5 w-3.5" />
          New School
        </Link>
      }
      stats={
        <KpiGrid>
          <KpiCard icon={Building2} label="Total Schools" value={rows.length} iconBg="bg-indigo-50" iconColor="text-indigo-600" />
          <KpiCard icon={CheckCircle2} label="Active" value={activeCount} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
          <KpiCard icon={XCircle} label="Inactive" value={inactiveCount} iconBg="bg-rose-50" iconColor="text-rose-600" />
        </KpiGrid>
      }
    />
  );
}
