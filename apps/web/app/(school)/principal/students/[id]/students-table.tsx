"use client";

import Link from "next/link";
import { GraduationCap, Phone } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

interface StudentRow {
  id: string;
  name: string;
  roll: string;
  class_name: string;
  section: string;
  parent_phone: string;
}

interface ClassOption {
  label: string;
  value: string;
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

export function PrincipalStudentsTable({
  rows,
  classFilterOptions,
  stats,
}: {
  rows: StudentRow[];
  classFilterOptions: ClassOption[];
  stats?: React.ReactNode;
}) {
  return (
    <ListPageTemplate<StudentRow>
      title="Students"
      description="View student enrollment and profiles across your school."
      stats={stats}
      data={rows}
      columns={[
        {
          header: "Student Name",
          accessor: (row) => (
            <div className="flex items-center gap-3">
              <Avatar name={row.name} />
              <Link href={`/principal/students/${row.id}`} className="font-medium text-foreground hover:text-indigo-600 hover:underline">
                {row.name || "—"}
              </Link>
            </div>
          ),
        },
        { header: "Roll No.", accessor: "roll" },
        { header: "Class", accessor: "class_name" },
        { header: "Section", accessor: "section" },
        {
          header: "Parent Phone",
          accessor: (row) =>
            row.parent_phone ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />
                {row.parent_phone}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
      searchKeys={["name", "roll"]}
      searchPlaceholder="Search by name, roll number or phone..."
      filters={
        classFilterOptions.length > 0
          ? [
              {
                label: "All Classes",
                options: classFilterOptions,
                filterFn: (row: StudentRow, value: string) => row.class_name === value,
              },
            ]
          : []
      }
      renderActions={(row) => (
        <Link
          href={`/principal/students/${row.id}`}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          View Profile
        </Link>
      )}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar name={row.name} />
            <div className="min-w-0 flex-1">
              <Link href={`/principal/students/${row.id}`} className="block truncate font-medium text-foreground">
                {row.name || "—"}
              </Link>
              <p className="text-xs text-muted-foreground">
                Roll {row.roll || "—"} · {row.class_name}{row.section ? ` · ${row.section}` : ""}
              </p>
            </div>
          </div>
          {row.parent_phone && (
            <a href={`tel:${row.parent_phone}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {row.parent_phone}
            </a>
          )}
        </div>
      )}
      emptyState={
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          description="Students enrolled at your school will appear here."
        />
      }
    />
  );
}