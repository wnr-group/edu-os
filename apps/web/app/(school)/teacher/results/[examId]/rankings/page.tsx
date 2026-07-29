import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSchoolId } from "@/lib/school";
import { getActiveSection } from "@/lib/section-context";
import { NoSectionPrompt } from "../../../no-section-prompt";
import { buttonVariants } from "@/components/ui/button";
import { getSchoolFeatures } from "@/lib/school-brand";
import { ModuleUnavailable } from "@/components/module-unavailable";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ExamRankingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<{ sectionId?: string }>;
}) {
  const { examId } = await params;
  const { sectionId: sectionIdParam } = await searchParams;
  const sectionId = sectionIdParam ?? (await getActiveSection());

  if (!sectionId) return <NoSectionPrompt />;

  const schoolId = (await getSchoolId())!;
  const features = await getSchoolFeatures(schoolId);
  if (features.exams !== true) return <ModuleUnavailable module="Exams" />;

  const supabase = await createServerSupabaseClient();

  const [{ data: examRow }, { data: resultsData }] = await Promise.all([
    supabase.from("exams").select("name, start_date, end_date").eq("id", examId).single(),
    supabase
      .from("exam_results")
      .select("student_id, marks_obtained, max_marks, grade, subjects(name), student_profiles!student_id(full_name)")
      .eq("exam_id", examId)
      .eq("school_id", schoolId),
  ]);

  // Aggregate per student
  const studentMap: Record<string, {
    name: string;
    totalObtained: number;
    totalMax: number;
    hasFail: boolean;
    subjectCount: number;
    subjects: { subject: string; marks: number; max: number; grade: string }[];
  }> = {};

  for (const r of resultsData ?? []) {
    const rr = r as any;
    const sid = rr.student_id;
    if (!studentMap[sid]) {
      studentMap[sid] = { name: rr.student_profiles?.full_name ?? "—", totalObtained: 0, totalMax: 0, hasFail: false, subjectCount: 0, subjects: [] };
    }
    studentMap[sid].totalObtained += rr.marks_obtained ?? 0;
    studentMap[sid].totalMax += rr.max_marks ?? 100;
    studentMap[sid].subjectCount += 1;
    if (rr.grade === "F") studentMap[sid].hasFail = true;
    studentMap[sid].subjects.push({
      subject: rr.subjects?.name ?? "—",
      marks: rr.marks_obtained ?? 0,
      max: rr.max_marks ?? 100,
      grade: rr.grade ?? "—",
    });
  }

  const subjectCounts = Object.values(studentMap).map((s) => s.subjectCount);
  const maxSubjectCount = subjectCounts.length > 0 ? Math.max(...subjectCounts) : 0;

  // Separate eligible (ranked) from excluded (fail/absent)
  const eligible = Object.entries(studentMap)
    .filter(([, s]) => !s.hasFail && s.subjectCount >= maxSubjectCount)
    .sort(([, a], [, b]) => b.totalObtained - a.totalObtained);

  const excluded = Object.entries(studentMap)
    .filter(([, s]) => s.hasFail || s.subjectCount < maxSubjectCount);

  const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // Competition ranking: tied students share rank, next rank skips (standard in Indian exams)
  let rank = 1;
  const ranked = eligible.map(([, s], i) => {
    if (i > 0 && eligible[i - 1][1].totalObtained > s.totalObtained) rank = i + 1;
    return { ...s, rankNum: rank, rank: `${MEDAL[rank] ?? `#${rank}`}` };
  });

  const unranked = excluded.map(([, s]) => ({
    ...s,
    rank: "—",
    rankLabel: s.hasFail ? "Fail" : "Absent",
  }));

  const isEmpty = ranked.length === 0 && unranked.length === 0;

  function SubjectChips({ subjects, muted }: { subjects: { subject: string; marks: number; max: number; grade: string }[]; muted?: boolean }) {
    return (
      <>
        {subjects.map((s, si) => (
          <span key={si} className={`mr-3 ${muted && s.grade === "F" ? "text-red-400" : ""}`}>
            {s.subject}: {s.marks}/{s.max} ({s.grade})
          </span>
        ))}
      </>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Link
        href={`/teacher/results/${examId}?sectionId=${sectionId}`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Back to Marks Entry
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Rankings — {examRow?.name ?? "Exam"}</h1>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rank</TableHead>
              <TableHead className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Student</TableHead>
              <TableHead className="h-10 px-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</TableHead>
              <TableHead className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subjects</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((r, i) => (
              <TableRow key={i} className={r.rankNum <= 3 ? "bg-amber-50" : ""}>
                <TableCell className="px-4 py-3 font-bold text-foreground">{r.rank}</TableCell>
                <TableCell className="px-4 py-3 font-medium text-foreground">{r.name}</TableCell>
                <TableCell className="px-4 py-3 text-right font-semibold text-foreground">{r.totalObtained}/{r.totalMax}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  <SubjectChips subjects={r.subjects} />
                </TableCell>
              </TableRow>
            ))}
            {unranked.map((r, i) => (
              <TableRow key={`u-${i}`} className="bg-muted/30 opacity-70">
                <TableCell className="px-4 py-3">
                  <span className="font-medium text-muted-foreground">—</span>
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    r.rankLabel === "Fail" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-600"
                  }`}>{r.rankLabel}</span>
                </TableCell>
                <TableCell className="px-4 py-3 font-medium text-muted-foreground">{r.name}</TableCell>
                <TableCell className="px-4 py-3 text-right text-muted-foreground">{r.totalObtained}/{r.totalMax}</TableCell>
                <TableCell className="px-4 py-3 text-sm text-muted-foreground">
                  <SubjectChips subjects={r.subjects} muted />
                </TableCell>
              </TableRow>
            ))}
            {isEmpty && (
              <TableRow>
                <TableCell colSpan={4} className="p-8 text-center text-muted-foreground">
                  No results entered for this exam yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {ranked.map((r, i) => (
          <div key={i} className={`rounded-lg border border-border p-4 shadow-sm ${r.rankNum <= 3 ? "bg-amber-50" : "bg-card"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-foreground">{r.rank}</span>
                <span className="font-medium text-foreground">{r.name}</span>
              </div>
              <span className="font-semibold text-foreground">{r.totalObtained}/{r.totalMax}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground"><SubjectChips subjects={r.subjects} /></p>
          </div>
        ))}
        {unranked.map((r, i) => (
          <div key={`u-${i}`} className="rounded-lg border border-border bg-muted/30 p-4 opacity-80 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  r.rankLabel === "Fail" ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-600"
                }`}>{r.rankLabel}</span>
                <span className="font-medium text-muted-foreground">{r.name}</span>
              </div>
              <span className="text-muted-foreground">{r.totalObtained}/{r.totalMax}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground"><SubjectChips subjects={r.subjects} muted /></p>
          </div>
        ))}
        {isEmpty && (
          <p className="py-10 text-center text-sm text-muted-foreground">No results entered for this exam yet.</p>
        )}
      </div>
    </div>
  );
}