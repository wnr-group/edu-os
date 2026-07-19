"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecordPaymentForm } from "./record-payment-form";

export interface FeeRow {
  lineItemId: string;
  studentId: string;
  studentName: string;
  feeTypeName: string;
  totalAmount: number;
  amountPaid: number;
  status: string;
  dueDate: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const classes =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : status === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${classes}`}>
      {status}
    </span>
  );
}

export function FeesTable({ rows, schoolId }: { rows: FeeRow[]; schoolId: string }) {
  const [payingFor, setPayingFor] = useState<FeeRow | null>(null);

  return (
    <div>
      {payingFor && (
        <RecordPaymentForm
          schoolId={schoolId}
          studentId={payingFor.studentId}
          studentName={payingFor.studentName}
          lineItemId={payingFor.lineItemId}
          feeTypeName={payingFor.feeTypeName}
          totalAmount={payingFor.totalAmount}
          amountPaid={payingFor.amountPaid}
          onClose={() => setPayingFor(null)}
        />
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          No fee line items for this section yet.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-card shadow-sm md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {["Student", "Fee Type", "Due (₹)", "Paid (₹)", "Due Date", "Status", ""].map((h, i) => (
                    <TableHead
                      key={i}
                      className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow
                    key={row.lineItemId}
                    className={`transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                  >
                    <TableCell className="px-4 py-3 text-sm font-medium">{row.studentName}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{row.feeTypeName}</TableCell>
                    <TableCell className="px-4 py-3 text-sm tabular-nums">{row.totalAmount.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="px-4 py-3 text-sm tabular-nums text-emerald-700">{row.amountPaid.toLocaleString("en-IN")}</TableCell>
                    <TableCell className="px-4 py-3 text-sm">{row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-IN") : "—"}</TableCell>
                    <TableCell className="px-4 py-3"><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {row.status !== "paid" && (
                        <button
                          onClick={() => setPayingFor(row)}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          Record Payment
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <div key={row.lineItemId} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.studentName}</p>
                    <p className="text-xs text-muted-foreground">{row.feeTypeName}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due</p>
                    <p className="tabular-nums">₹{row.totalAmount.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid</p>
                    <p className="tabular-nums text-emerald-700">₹{row.amountPaid.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Due Date</p>
                    <p>{row.dueDate ? new Date(row.dueDate).toLocaleDateString("en-IN") : "—"}</p>
                  </div>
                </div>
                {row.status !== "paid" && (
                  <button
                    onClick={() => setPayingFor(row)}
                    className="mt-3 text-sm font-medium text-blue-600 hover:underline"
                  >
                    Record Payment
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}