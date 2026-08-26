"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, MoreHorizontal, CheckCircle2 } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type SeverityVariant = "default" | "secondary" | "destructive" | "outline";

function severityVariant(severity: string | null): SeverityVariant {
  if (severity === "high" || severity === "severe" || severity === "suspension") return "destructive";
  if (severity === "medium" || severity === "written") return "secondary";
  return "outline";
}

export interface DisciplineRow {
  id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  category: string;
  severity: string | null;
  status: string;
  description: string;
  date: string;
}

function RowActions({ row }: { row: DisciplineRow }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggleReviewStatus() {
    setLoading(true);
    const newStatus = row.status === "reviewed" ? "pending" : "reviewed";
    try {
      const res = await fetch("/api/discipline/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId: row.id, status: newStatus }),
      });
      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error ?? "Failed to update incident status.");
        return;
      }
      toast.success(newStatus === "reviewed" ? "Incident marked as reviewed." : "Incident marked as pending.");
      router.refresh();
    } catch {
      toast.error("Error updating incident status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Row actions" />}>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {row.student_id && (
          <DropdownMenuItem render={<Link href={`/principal/students/${row.student_id}`} />}>
            View Student
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={toggleReviewStatus} disabled={loading}>
          <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
          {row.status === "reviewed" ? "Mark as Pending" : "Mark as Reviewed"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DisciplineTable({
  rows,
  stats,
  categoryOptions,
}: {
  rows: DisciplineRow[];
  stats?: React.ReactNode;
  categoryOptions: { label: string; value: string }[];
}) {
  const severityOptions = [
    { label: "Verbal", value: "verbal" },
    { label: "Written", value: "written" },
    { label: "Suspension", value: "suspension" },
  ];

  return (
    <ListPageTemplate<DisciplineRow>
      title="Discipline"
      description="Manage and review all discipline incidents across the school."
      data={rows}
      stats={stats}
      columns={[
        {
          header: "Student",
          accessor: (row) => (
            <Link href={`/principal/students/${row.student_id}`} className="font-medium text-indigo-600 hover:underline">
              {row.student_name}
            </Link>
          ),
        },
        { header: "Roll No.", accessor: "roll_number" },
        { header: "Category", accessor: (row) => <span className="capitalize">{row.category}</span> },
        {
          header: "Severity",
          accessor: (row) => <Badge variant={severityVariant(row.severity)}>{row.severity ?? "verbal"}</Badge>,
        },
        {
          header: "Status",
          accessor: (row) =>
            row.status === "reviewed" ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                ✓ Reviewed
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                Pending
              </Badge>
            ),
        },
        { header: "Description", accessor: (row) => <span className="line-clamp-1 max-w-xs">{row.description}</span> },
        { header: "Date", accessor: "date" },
      ]}
      searchKeys={["student_name", "roll_number", "description"]}
      searchPlaceholder="Search by student, roll no, or keyword..."
      filters={[
        ...(categoryOptions.length > 0 ? [{ label: "All Categories", options: categoryOptions, filterFn: (row: DisciplineRow, v: string) => row.category === v }] : []),
        { label: "All Severity", options: severityOptions, filterFn: (row: DisciplineRow, v: string) => (row.severity ?? "verbal") === v },
      ]}
      renderActions={(row) => <RowActions row={row} />}
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/principal/students/${row.student_id}`} className="block truncate font-medium text-indigo-600">
                {row.student_name}
              </Link>
              <p className="text-xs text-muted-foreground">Roll {row.roll_number} · <span className="capitalize">{row.category}</span></p>
            </div>
            <Badge variant={severityVariant(row.severity)}>{row.severity ?? "low"}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{row.description}</p>
          <p className="mt-2 text-xs text-muted-foreground/80">{row.date}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={AlertTriangle}
          title="No discipline records"
          description="Incidents logged for students will appear here."
        />
      }
    />
  );
}