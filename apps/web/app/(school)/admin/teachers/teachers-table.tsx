"use client";
import Link from "next/link";
import { Users, Mail } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";
import { InviteTeacherDialog } from "./invite-teacher-dialog";

interface TeacherRow {
  id: string;
  name: string;
  email: string;
  phone: string;
}

function Avatar({ name }: { name: string }) {
  const initials = (name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
      {initials || "?"}
    </div>
  );
}

export function TeachersTable({
  rows,
  schoolId,
  headerAction,
  stats,
}: {
  rows: TeacherRow[];
  schoolId: string;
  headerAction?: React.ReactNode;
  stats?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<TeacherRow>
      title="Teachers"
      description="Manage your school's teaching staff."
      headerAction={headerAction}
      stats={stats}
      data={rows}
      columns={[
        {
          header: "Name",
          accessor: (row) => (
            <div className="flex items-center gap-3">
              <Avatar name={row.name} />
              <Link href={`/admin/teachers/${row.id}`} className="font-medium text-foreground hover:text-indigo-600 hover:underline">
                {row.name || "—"}
              </Link>
            </div>
          ),
        },
        {
          header: "Phone",
          accessor: (row) =>
            row.phone ? (
              <a href={`tel:${row.phone}`} className="text-primary hover:underline">
                {row.phone}
              </a>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          header: "Email",
          accessor: (row) =>
            row.email ? row.email : <span className="text-muted-foreground">—</span>,
        },
      ]}
      searchKeys={["name", "email", "phone"]}
      searchPlaceholder="Search by name, phone or email…"
      renderActions={(row) => (
        <Link
          href={`/admin/teachers/${row.id}`}
          className="text-sm text-primary hover:underline"
        >
          View Profile
        </Link>
      )}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar name={row.name} />
            <div className="min-w-0 flex-1">
              <Link href={`/admin/teachers/${row.id}`} className="block truncate font-medium text-foreground">
                {row.name || "—"}
              </Link>
              {row.email && (
                <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  {row.email}
                </p>
              )}
            </div>
          </div>
          {row.phone && (
            <a href={`tel:${row.phone}`} className="mt-3 inline-block text-sm text-primary">
              {row.phone}
            </a>
          )}
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Users}
          title="No teachers yet"
          description="Invite your first teacher to get started."
          action={<InviteTeacherDialog schoolId={schoolId} />}
        />
      }
    />
  );
}