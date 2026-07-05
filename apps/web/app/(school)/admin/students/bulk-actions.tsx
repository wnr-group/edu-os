"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCsv } from "@/lib/csv-parser";

interface StudentRow {
  id: string;
  name: string;
  roll: string;
  admission_number: string;
  class_name: string;
  section: string;
  email: string;
  parent_phone: string;
  parent_name: string;
  date_of_birth: string;
  gender: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: number;
  errorRows: { row: number; error: string }[];
}

interface BulkActionsProps {
  students: StudentRow[];
}

export function BulkActions({ students }: BulkActionsProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleDownload() {
    const headers = ["full_name", "email", "roll_number", "admission_number", "class_name", "section_name", "parent_phone", "parent_name", "date_of_birth", "gender"];
    const csvRows = students.map((s) =>
      [s.name, s.email, s.roll, s.admission_number, s.class_name, s.section, s.parent_phone, s.parent_name, s.date_of_birth, s.gender]
        .map((v) => `"${(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students.csv";
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  function handleDownloadTemplate() {
    const headers = "full_name,email,roll_number,admission_number,class_name,section_name,parent_phone,parent_name,date_of_birth,gender\n";
    const blob = new Blob([headers], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);
    setOpen(false);

    const text = await file.text();
    const { rows } = parseCsv(text);

    const importRows = rows.map((r) => ({
      full_name: r.full_name ?? "",
      email: r.email ?? "",
      roll_number: r.roll_number ?? "",
      admission_number: r.admission_number ?? "",
      class_name: r.class_name ?? "",
      section_name: r.section_name ?? "",
      parent_phone: r.parent_phone ?? "",
      parent_name: r.parent_name ?? "",
      date_of_birth: r.date_of_birth ?? "",
      gender: r.gender ?? "",
    }));

    try {
      const res = await fetch("/api/students/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importRows }),
      });
      const data = await res.json();
      const results = data.results ?? [];
      const errorRows = results
        .filter((r: any) => r.status === "error")
        .map((r: any) => ({ row: (r.row as number) + 2, error: r.error ?? "Unknown error" }));
      // row + 2: +1 for 0-index, +1 for header row → matches spreadsheet row number

      setResult({
        created: results.filter((r: any) => r.status === "created").length,
        updated: results.filter((r: any) => r.status === "updated").length,
        errors: errorRows.length,
        errorRows,
      });
      router.refresh();
    } catch {
      setResult({
        created: 0,
        updated: 0,
        errors: 1,
        errorRows: [{ row: -1, error: "Network or server error. Please try again." }],
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="relative z-50">
      <Button
        variant="outline"
        onClick={() => setOpen(!open)}
        disabled={uploading}
      >
        {uploading ? "Importing..." : "Bulk Actions"}
        <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-border bg-background p-1 shadow-lg">
            <button
              onClick={handleDownload}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download Students
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download Template
            </button>
            <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted">
              <Upload className="h-4 w-4" />
              Upload CSV
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUpload}
              />
            </label>
          </div>
        </>
      )}

      {result && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-border bg-background p-3 shadow-lg">
          <p className="text-sm font-medium text-foreground">Import Complete</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <li className="text-green-600">{result.created} created</li>
            <li className="text-blue-600">{result.updated} updated</li>
            {result.errors > 0 && (
              <li className="text-red-600">{result.errors} error{result.errors > 1 ? "s" : ""}</li>
            )}
          </ul>

          {result.errorRows.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-xs font-medium text-red-600">Error Details</p>
              <div className="max-h-48 overflow-y-auto rounded border border-red-100 bg-red-50">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-100">
                      <th className="px-2 py-1 text-left font-medium text-red-700">Row</th>
                      <th className="px-2 py-1 text-left font-medium text-red-700">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errorRows.map((e, idx) => (
                      <tr key={idx} className="border-b border-red-100 last:border-0">
                        <td className="px-2 py-1 tabular-nums text-red-800">{e.row === -1 ? "—" : e.row}</td>
                        <td className="px-2 py-1 text-red-700">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button
            onClick={() => setResult(null)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
