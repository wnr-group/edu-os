"use client";

import { Wallet } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

export interface FeeLineItemRow {
  id: string;
  student: string;
  fee_type: string;
  amount: string;
  class_name: string;
  academic_year: string;
  due_date: string;
  status: string;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "paid" ? "default" : status === "partial" ? "secondary" : "destructive"}>
      {status || "pending"}
    </Badge>
  );
}

export function FeeLineItemsTable({ rows }: { rows: FeeLineItemRow[] }) {
  return (
    <ListPageTemplate<FeeLineItemRow>
      title="Fee Line Items"
      description="Most recent 100 fee line items across your school."
      data={rows}
      columns={[
        { header: "Student", accessor: "student" },
        { header: "Fee Type", accessor: "fee_type" },
        { header: "Amount", accessor: "amount" },
        { header: "Class", accessor: "class_name" },
        { header: "Academic Year", accessor: "academic_year" },
        { header: "Due Date", accessor: "due_date" },
        { header: "Status", accessor: (row) => <StatusBadge status={row.status} /> },
      ]}
      searchKeys={["student", "fee_type", "class_name"]}
      searchPlaceholder="Search by student or fee type..."
      renderMobileCard={(row) => (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{row.student}</p>
              <p className="text-xs text-muted-foreground">{row.fee_type} · {row.class_name}</p>
            </div>
            <StatusBadge status={row.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount</p>
              <p className="tabular-nums">{row.amount}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due Date</p>
              <p>{row.due_date}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{row.academic_year}</p>
        </div>
      )}
      emptyState={
        <EmptyState
          icon={Wallet}
          title="No fee line items yet"
          description="Push a fee to a class to get started."
        />
      }
    />
  );
}