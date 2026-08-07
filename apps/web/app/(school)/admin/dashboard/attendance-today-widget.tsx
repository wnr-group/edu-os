"use client";

import { useState } from "react";
import { DashboardWidget } from "@/components/dashboard-template";
import { AttendanceChart, type AttendanceSummary } from "./attendance-chart";
import { AttendanceDetailDrawer } from "./attendance-detail-drawer";

interface ClassAttendanceRow {
  id: string;
  className: string;
  sectionName: string;
  status: "marked" | "pending";
  markedStudents: number;
  totalStudents: number;
}

export function AttendanceTodayWidget({
  summary, classes,
}: {
  summary: AttendanceSummary; classes: ClassAttendanceRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <DashboardWidget
        title="Attendance Today"
        action={
          summary.totalCount > 0 ? (
            <button onClick={() => setOpen(true)} className="text-sm font-medium text-indigo-600 hover:underline">
              View Details →
            </button>
          ) : undefined
        }
      >
        <div className="flex justify-center">
          <AttendanceChart data={summary} />
        </div>
      </DashboardWidget>

      <AttendanceDetailDrawer
        open={open}
        onClose={() => setOpen(false)}
        classes={classes}
        markedCount={summary.markedCount}
        totalCount={summary.totalCount}
      />
    </>
  );
}