"use client";
import Link from "next/link";
import { Users } from "lucide-react";
import { FilterableDataTable } from "@/components/filterable-data-table";
import { EmptyState } from "@/components/empty-state";
import { InviteTeacherDialog } from "./invite-teacher-dialog";

interface TeacherRow {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export function TeachersTable({
  rows,
  schoolId,
}: {
  rows: TeacherRow[];
  schoolId: string;
}) {
  return (
    <FilterableDataTable
      data={rows}
      columns={[
        { header: "Name", accessor: "name" },
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
