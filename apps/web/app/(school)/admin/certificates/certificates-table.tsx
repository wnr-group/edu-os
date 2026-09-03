"use client";

import { useState } from "react";
import Link from "next/link";
import { Award } from "lucide-react";
import { ListPageTemplate } from "@/components/list-page-template";
import { EmptyState } from "@/components/empty-state";

interface StudentRow {
  id: string;
  name: string;
  admission: string;
  class_name: string;
  section: string;
}

interface HistoryRow {
  id: string;
  student_profile_id: string;
  student_name: string;
  class_name: string;
  academic_year: string;
  generated_by_name: string;
  generated_at: string;
}

interface Option { label: string; value: string }

export function CertificatesTable({
  students,
  history,
  classOptions,
  baseHref,
  studentDetailHrefPrefix,
  stats,
}: {
  students: StudentRow[];
  history: HistoryRow[];
  classOptions: Option[];
  baseHref: string;
  studentDetailHrefPrefix?: string;
  stats?: React.ReactNode;
}) {
  const [tab, setTab] = useState<"students" | "history">("students");
  const studentsBase = studentDetailHrefPrefix ?? baseHref.replace(/\/certificates$/, "/students");
  const studentHref = (id: string) => `${studentsBase}/${id}?from=certificates`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {(["students", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "students" ? "Students" : "History"}
          </button>
        ))}
      </div>

      {tab === "students" ? (
        <ListPageTemplate<StudentRow>
          title="Certificates"
          description="Generate bonafide certificates for students."
          stats={stats}
          data={students}
          columns={[
            {
              header: "Name",
              accessor: (row) => (
                <Link href={studentHref(row.id)} className="font-medium text-indigo-600 hover:underline">
                  {row.name}
                </Link>
              ),
            },
            { header: "Admission No.", accessor: "admission" },
            { header: "Class", accessor: "class_name" },
            { header: "Section", accessor: "section" },
          ]}
          searchKeys={["name", "admission"]}
          searchPlaceholder="Search by name or admission number..."
          filters={
            classOptions.length > 0
              ? [
                  {
                    label: "All Classes",
                    options: classOptions,
                    filterFn: (row: StudentRow, value: string) => row.class_name === value,
                  },
                ]
              : []
          }
          renderActions={(row) => (
            <Link
              href={`${baseHref}/${row.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              <Award className="h-3.5 w-3.5" />
              Generate
            </Link>
          )}
          renderMobileCard={(row) => (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={studentHref(row.id)} className="block truncate font-medium text-indigo-600">
                    {row.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Adm {row.admission || "—"} · {row.class_name}{row.section ? ` · ${row.section}` : ""}
                  </p>
                </div>
                <Link
                  href={`${baseHref}/${row.id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-700"
                >
                  <Award className="h-3.5 w-3.5" />
                  Generate
                </Link>
              </div>
            </div>
          )}
          emptyState={
            <EmptyState icon={Award} title="No students found" description="Add students to generate certificates." />
          }
        />
      ) : (
        <ListPageTemplate<HistoryRow>
          title="Certificate History"
          data={history}
          columns={[
            {
              header: "Student",
              accessor: (row) => (
                <Link href={studentHref(row.student_profile_id)} className="font-medium text-indigo-600 hover:underline">
                  {row.student_name}
                </Link>
              ),
            },
            { header: "Class", accessor: "class_name" },
            { header: "Academic Year", accessor: "academic_year" },
            { header: "Generated By", accessor: "generated_by_name" },
            { header: "Date", accessor: "generated_at" },
          ]}
          searchKeys={["student_name"]}
          searchPlaceholder="Search by student name..."
          renderMobileCard={(row) => (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <Link href={studentHref(row.student_profile_id)} className="font-medium text-indigo-600">
                {row.student_name}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">{row.class_name} · {row.academic_year}</p>
              <p className="mt-2 text-xs text-muted-foreground">By {row.generated_by_name} · {row.generated_at}</p>
            </div>
          )}
          emptyState={
            <EmptyState icon={Award} title="No certificates issued yet" description="Generate a certificate to see history here." />
          }
        />
      )}
    </div>
  );
}