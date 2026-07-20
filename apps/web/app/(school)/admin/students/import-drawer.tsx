"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X, FileText, Upload, CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseCsv } from "@/lib/csv-parser";

interface ImportResult {
  created: number;
  updated: number;
  errors: number;
  errorRows: { row: number; error: string }[];
  warningRows: { row: number; warning: string }[];
  serverError?: string;
}

const IMPORT_COLUMNS = [
  { key: "full_name", req: "Required", desc: "Student's full name", example: "Aarav Sharma" },
  { key: "email", req: "Optional", desc: "Student email", example: "aarav.sharma@demo.edu" },
  { key: "roll_number", req: "Optional", desc: "Roll number within the section", example: "1A-12" },
  { key: "admission_number", req: "Optional", desc: "School admission number", example: "ADM2026-0047" },
  { key: "class_name", req: "Required", desc: "Must match an existing class name", example: "Class 5" },
  { key: "section_name", req: "Required", desc: "Must match an existing section in that class", example: "A" },
  { key: "parent_phone", req: "Required", desc: "10-digit phone, used to find or create the parent", example: "9876543210" },
  { key: "parent_name", req: "Optional", desc: "Parent / guardian full name", example: "Ramesh Sharma" },
  { key: "date_of_birth", req: "Optional", desc: "YYYY-MM-DD or DD/MM/YYYY", example: "2015-08-21" },
  { key: "gender", req: "Optional", desc: "male, female, or other", example: "male" },
];

export function ImportDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  function handleDownloadTemplate() {
    const headers = IMPORT_COLUMNS.map((c) => c.key).join(",") + "\n";
    const blob = new Blob([headers], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function processFile(file: File) {
    setFileName(file.name);
    setUploading(true);
    setResult(null);

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

      if (!res.ok) {
        setResult({
          created: 0,
          updated: 0,
          errors: 0,
          errorRows: [],
          warningRows: [],
          serverError: data.error ?? `Request failed (${res.status})`,
        });
        return;
      }

      const results = data.results ?? [];
      const errorRows = results
        .filter((r: any) => r.status === "error")
        .map((r: any) => ({ row: (r.row as number) + 2, error: r.error ?? "Unknown error" }));
      const warningRows = results
        .filter((r: any) => r.warning)
        .map((r: any) => ({ row: (r.row as number) + 2, warning: r.warning as string }));

      setResult({
        created: results.filter((r: any) => r.status === "created").length,
        updated: results.filter((r: any) => r.status === "updated").length,
        errors: errorRows.length,
        errorRows,
        warningRows,
      });
      router.refresh();
    } catch {
      setResult({
        created: 0,
        updated: 0,
        errors: 0,
        errorRows: [],
        warningRows: [],
        serverError: "Network error. Please check your connection and try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleClose() {
    setFileName("");
    setResult(null);
    onClose();
  }

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div onClick={handleClose} className="fixed inset-0 z-50 bg-slate-900/45" />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <div className="text-lg font-bold text-foreground">Import students from CSV</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Bulk-create or update records. Download the template, fill it in, and upload.
            </div>
          </div>
          <button type="button" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>
            <span className="text-[15px] font-bold text-foreground">Download the template</span>
          </div>
          <div className="mb-2 flex items-center justify-between gap-3.5 rounded-xl border border-border px-[18px] py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <FileText className="h-5 w-5 text-green-700" />
              </span>
              <div>
                <div className="text-sm font-semibold text-foreground">students_template.csv</div>
                <div className="text-xs text-muted-foreground">{IMPORT_COLUMNS.length} columns · UTF-8 · comma-separated</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              Download
            </Button>
          </div>

          <div className="mb-2 mt-5 text-xs font-bold tracking-wide text-muted-foreground">COLUMN REFERENCE</div>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1.3fr_0.7fr_2fr] gap-2.5 bg-muted/40 px-3.5 py-2.5 text-[11px] font-bold tracking-wide text-muted-foreground">
              <div>COLUMN</div>
              <div>REQUIRED</div>
              <div>DESCRIPTION &amp; EXAMPLE</div>
            </div>
            {IMPORT_COLUMNS.map((col) => (
              <div key={col.key} className="grid grid-cols-[1.3fr_0.7fr_2fr] items-start gap-2.5 border-t border-border/70 px-3.5 py-2.5">
                <div className="font-mono text-[12.5px] font-semibold text-indigo-700">{col.key}</div>
                <div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                      (col.req === "Required" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {col.req}
                  </span>
                </div>
                <div>
                  <div className="text-[13px] text-slate-700">{col.desc}</div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">e.g. {col.example}</div>
                </div>
              </div>
            ))}
          </div>

          <details className="group mt-4 overflow-hidden rounded-xl border border-blue-200 bg-blue-50/60">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[13px] font-semibold text-blue-800">
              How matching works &amp; edge cases
              <ChevronDown className="h-4 w-4 text-blue-500 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="space-y-2 border-t border-blue-200/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-blue-900">
              <li>
                <strong>admission_number is the match key.</strong> If it matches an existing student in this school, that student is updated instead of duplicated. Leave it blank to always create a new student.
              </li>
              <li>
                <strong>class_name and section_name must exactly match</strong> (case-insensitive) a class/section already set up under Classes &amp; Sections — e.g. <span className="font-mono">Class 5</span>, not <span className="font-mono">5</span>. If they don&apos;t match, the student is still created but left <strong>unassigned</strong>, and won&apos;t appear in the student list until you fix the name and re-import.
              </li>
              <li>
                <strong>Enrolling also needs an active academic year</strong> for the school. If none is active, students are created but left unassigned, same as above.
              </li>
              <li>
                <strong>Duplicate admission_number within one file:</strong> the later row updates the same student created by the earlier row — it doesn&apos;t create a second student.
              </li>
              <li>
                <strong>parent_phone finds or creates a parent</strong> by phone number. If that number already belongs to a parent account, the student is linked to the existing parent rather than creating a duplicate.
              </li>
              <li>
                Rows with <strong>warnings</strong> (shown in amber after upload) are still created — only rows with <strong>errors</strong> (shown in red) are skipped entirely.
              </li>
            </ul>
          </details>

          <div className="mb-3 mt-6 flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">2</span>
            <span className="text-[15px] font-bold text-foreground">Upload your filled CSV</span>
          </div>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed px-6 py-8 text-center transition-colors " +
              (dragOver ? "border-indigo-500 bg-indigo-50/50" : "border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-slate-50")
            }
          >
            <Upload className="h-7 w-7 text-muted-foreground" />
            <div className="text-sm font-semibold text-slate-700">
              Drag &amp; drop your CSV here, or <span className="text-indigo-600">browse</span>
            </div>
            <div className="text-xs text-muted-foreground">Maximum 5,000 rows per upload · .csv only</div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleFilePick} className="hidden" />
          </label>

          {uploading && <div className="mt-3 text-sm text-muted-foreground">Importing {fileName}…</div>}

          {result?.serverError && (
            <div className="mt-3.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800">
              {fileName} — import failed: {result.serverError}
            </div>
          )}

          {result && !result.serverError && (
            <div className="mt-3.5 rounded-xl border border-green-200 bg-green-50 px-4 py-3.5">
              <div className="flex items-center gap-2.5 text-sm text-green-800">
                <CheckCircle2 className="h-[18px] w-[18px] text-green-700" />
                {fileName} — {result.created} created, {result.updated} updated
                {result.errors > 0 ? `, ${result.errors} error${result.errors > 1 ? "s" : ""}` : ""}
                {result.warningRows.length > 0 ? `, ${result.warningRows.length} warning${result.warningRows.length > 1 ? "s" : ""}` : ""}
              </div>
              {result.errorRows.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-red-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-red-100">
                        <th className="px-2.5 py-1.5 text-left font-medium text-red-700">Row</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-red-700">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errorRows.map((e, idx) => (
                        <tr key={idx} className="border-b border-red-50 last:border-0">
                          <td className="px-2.5 py-1.5 tabular-nums text-red-800">{e.row === -1 ? "—" : e.row}</td>
                          <td className="px-2.5 py-1.5 text-red-700">{e.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.warningRows.length > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-amber-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-100">
                        <th className="px-2.5 py-1.5 text-left font-medium text-amber-700">Row</th>
                        <th className="px-2.5 py-1.5 text-left font-medium text-amber-700">Warning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.warningRows.map((w, idx) => (
                        <tr key={idx} className="border-b border-amber-50 last:border-0">
                          <td className="px-2.5 py-1.5 tabular-nums text-amber-800">{w.row}</td>
                          <td className="px-2.5 py-1.5 text-amber-700">{w.warning}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2.5 border-t border-border px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="outline" onClick={handleClose}>
            {result ? "Done" : "Cancel"}
          </Button>
        </div>
      </div>
    </>,
    document.body
  );
}
