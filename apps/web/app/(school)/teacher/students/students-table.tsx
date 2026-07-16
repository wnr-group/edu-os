"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ListPageTemplate } from "@/components/list-page-template";
import { cn } from "@/lib/utils";

export interface TeacherStudentRow {
  id: string;
  full_name: string | null;
  roll_number: string | null;
  admission_number: string | null;
  photo_url: string | null;
  parent_phone: string | null;
}

function Avatar({ row }: { row: TeacherStudentRow }) {
  const initials = (row.full_name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-xs font-bold text-emerald-600">
      {row.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.photo_url} alt={row.full_name ?? ""} className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}

export function TeacherStudentsTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: TeacherStudentRow[];
}) {
  return (
    <ListPageTemplate<TeacherStudentRow>
      title={title}
      description={description}
      data={rows}
      searchKeys={["full_name", "roll_number", "admission_number"]}
      searchPlaceholder="Search by name or roll number…"
      columns={[
        {
          header: "Student",
          accessor: (row) => (
            <div className="flex items-center gap-3">
              <Avatar row={row} />
              <span className="font-medium text-foreground">{row.full_name ?? "—"}</span>
            </div>
          ),
        },
        { header: "Roll No.", accessor: (row) => row.roll_number ?? "—" },
        { header: "Admission No.", accessor: (row) => row.admission_number ?? "—" },
        { header: "Parent Phone", accessor: (row) => row.parent_phone ?? "—" },
      ]}
      renderActions={(row) => (
        <Link
          href={`/teacher/students/${row.id}`}
          className="text-sm font-medium text-indigo-600 hover:underline"
        >
          View Profile
        </Link>
      )}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar row={row} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-foreground">{row.full_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                Roll {row.roll_number ?? "—"} · Adm {row.admission_number ?? "—"}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{row.parent_phone ?? "No phone"}</span>
            <Link
              href={`/teacher/students/${row.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              View Profile
            </Link>
          </div>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Users}
          title="No students in this section"
          description="Students enrolled in the selected section will appear here."
        />
      }
    />
  );
}