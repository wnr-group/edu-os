"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
interface ClassAttendanceRow {
  id: string;
  className: string;
  sectionName: string;
  status: "marked" | "pending";
  markedStudents: number;
  totalStudents: number;
}

export function AttendanceDetailDrawer({
  open, onClose, classes, markedCount, totalCount,
}: {
  open: boolean; onClose: () => void; classes: ClassAttendanceRow[]; markedCount: number; totalCount: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const percent = totalCount > 0 ? Math.round((markedCount / totalCount) * 100) : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold text-foreground">Attendance Overview</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="border-b border-border p-5">
          <p className="text-sm font-medium text-foreground">
            {totalCount > 0 ? `${markedCount} of ${totalCount} classes marked` : "No classes scheduled today"}
          </p>
          {totalCount > 0 && (
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {classes.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No classes have a timetable today.</p>
          ) : (
            <ul className="divide-y divide-border">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.className}</p>
                    <p className="text-xs text-muted-foreground">Section {c.sectionName}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        c.status === "marked" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {c.status === "marked" ? "Marked" : "Pending"}
                    </span>
                    {c.status === "marked" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.markedStudents}/{c.totalStudents} Students
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="border-t border-border p-4 text-center text-xs text-muted-foreground">
          Only classes with a timetable for today are counted.
        </p>
      </div>
    </div>,
    document.body
  );
}