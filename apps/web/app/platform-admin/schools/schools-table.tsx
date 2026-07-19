"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ListPageTemplate } from "@/components/list-page-template";

interface SchoolRow {
  id: string;
  name: string;
  contact_email: string | null;
  is_active: boolean;
  created_at: string;
}

export function SchoolsTable({
  rows,
  headerAction,
  stats,
}: {
  rows: SchoolRow[];
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<SchoolRow>
      title="Schools"
      description="Manage every school on the platform."
      headerAction={headerAction}
      stats={stats}
      data={rows}
      columns={[
        { header: "Name", accessor: "name" },
        { header: "Email", accessor: (row) => row.contact_email || "—" },
        {
          header: "Status",
          accessor: (row) => (
            <Badge variant={row.is_active ? "default" : "secondary"}>
              {row.is_active ? "Active" : "Inactive"}
            </Badge>
          ),
        },
      ]}
      searchKeys={["name", "contact_email"]}
      searchPlaceholder="Search by school name or email..."
      filters={[
        {
          label: "All Status",
          options: [
            { label: "Active", value: "active" },
            { label: "Inactive", value: "inactive" },
          ],
          filterFn: (row: SchoolRow, value: string) =>
            value === "active" ? row.is_active : !row.is_active,
        },
      ]}
      renderActions={(row) => (
        <Link href={`/platform-admin/schools/${row.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          View
        </Link>
      )}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/platform-admin/schools/${row.id}`} className="truncate text-sm font-semibold text-foreground hover:underline">
                {row.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">{row.contact_email || "—"}</p>
            </div>
            <Badge variant={row.is_active ? "default" : "secondary"} className="shrink-0">
              {row.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      )}
      emptyState={
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-white py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-sm font-semibold text-foreground">No schools yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create one to get started.</p>
          <Link href="/platform-admin/schools/new" className={buttonVariants({ variant: "default", size: "sm" }) + " mt-6"}>
            New School
          </Link>
        </div>
      }
    />
  );
}
