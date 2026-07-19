"use client";

import { useRef } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SubjectResult {
  subject: string;
  marks_obtained: number;
  max_marks: number;
  percentage: number;
  grade: string;
}

interface ReportData {
  schoolName: string;
  schoolColor: string;
  studentName: string;
  rollNumber: string;
  admissionNumber: string;
  className: string;
  section: string;
  examName: string;
  academicYear: string;
  subjects: SubjectResult[];
  totalObtained: number;
  totalMax: number;
  overallPercentage: number;
  overallGrade: string;
  overallLabel: string;
  attendancePercent: number | null;
}

export function ReportCardView({ data }: { data: ReportData }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Report Card - ${data.studentName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px; color: #1a1a1a; }
            .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid ${data.schoolColor}; padding-bottom: 16px; }
            .header h1 { font-size: 22px; color: ${data.schoolColor}; margin-bottom: 4px; }
            .header p { font-size: 13px; color: #666; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; font-size: 13px; }
            .info-grid span { color: #666; }
            .info-grid strong { color: #1a1a1a; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
            th { background: #f5f5f5; padding: 10px 12px; text-align: left; font-weight: 600; border: 1px solid #e5e5e5; }
            td { padding: 10px 12px; border: 1px solid #e5e5e5; }
            .total-row { font-weight: 600; background: #fafafa; }
            .summary { display: flex; gap: 24px; margin-bottom: 24px; }
            .summary-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; text-align: center; flex: 1; }
            .summary-card .value { font-size: 24px; font-weight: 700; color: ${data.schoolColor}; }
            .summary-card .label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 4px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          ${content.innerHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/report-cards"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Report Cards
        </Link>
        <Button onClick={handlePrint} variant="outline">
          <Download className="mr-1.5 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <div ref={printRef} className="mx-auto max-w-2xl rounded-xl border border-border bg-white p-8 shadow-sm">
        <div className="header" style={{ textAlign: "center", marginBottom: 32, borderBottom: `2px solid ${data.schoolColor}`, paddingBottom: 16 }}>
          <h1 style={{ fontSize: 22, color: data.schoolColor, marginBottom: 4 }}>{data.schoolName}</h1>
          <p style={{ fontSize: 13, color: "#666" }}>Report Card — {data.examName} ({data.academicYear})</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6 text-sm">
          <p><span className="text-muted-foreground">Student: </span><strong>{data.studentName}</strong></p>
          <p><span className="text-muted-foreground">Roll No: </span><strong>{data.rollNumber}</strong></p>
          <p><span className="text-muted-foreground">Class: </span><strong>{data.className} – {data.section}</strong></p>
          <p><span className="text-muted-foreground">Admission No: </span><strong>{data.admissionNumber}</strong></p>
        </div>

        {data.subjects.length > 0 ? (
          <>
            <table className="w-full border-collapse mb-6 text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border px-3 py-2.5 text-left font-semibold">Subject</th>
                  <th className="border border-border px-3 py-2.5 text-center font-semibold">Marks</th>
                  <th className="border border-border px-3 py-2.5 text-center font-semibold">Max</th>
                  <th className="border border-border px-3 py-2.5 text-center font-semibold">%</th>
                  <th className="border border-border px-3 py-2.5 text-center font-semibold">Grade</th>
                </tr>
              </thead>
              <tbody>
                {data.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="border border-border px-3 py-2.5">{s.subject}</td>
                    <td className="border border-border px-3 py-2.5 text-center">{s.marks_obtained}</td>
                    <td className="border border-border px-3 py-2.5 text-center">{s.max_marks}</td>
                    <td className="border border-border px-3 py-2.5 text-center">{s.percentage}%</td>
                    <td className="border border-border px-3 py-2.5 text-center font-medium">{s.grade}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-semibold">
                  <td className="border border-border px-3 py-2.5">Total</td>
                  <td className="border border-border px-3 py-2.5 text-center">{data.totalObtained}</td>
                  <td className="border border-border px-3 py-2.5 text-center">{data.totalMax}</td>
                  <td className="border border-border px-3 py-2.5 text-center">{data.overallPercentage}%</td>
                  <td className="border border-border px-3 py-2.5 text-center">{data.overallGrade}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex gap-4 mb-6">
              <div className="flex-1 rounded-lg border border-border p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: data.schoolColor }}>{data.overallPercentage}%</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1">Percentage</p>
              </div>
              <div className="flex-1 rounded-lg border border-border p-4 text-center">
                <p className="text-2xl font-bold" style={{ color: data.schoolColor }}>{data.overallGrade}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1">{data.overallLabel}</p>
              </div>
              {data.attendancePercent !== null && (
                <div className="flex-1 rounded-lg border border-border p-4 text-center">
                  <p className="text-2xl font-bold" style={{ color: data.schoolColor }}>{data.attendancePercent}%</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mt-1">Attendance</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">No exam results found for this student.</p>
        )}
      </div>
    </div>
  );
}