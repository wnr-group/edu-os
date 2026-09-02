import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  computeAttendanceRisk,
  computePerformanceForecast,
  type AttendanceRecord,
  type AttendanceRiskInput,
  type PerformanceInput,
} from "../_shared/insights/index.ts";

interface RequestBody {
  school_id: string;
  run_date: string; // YYYY-MM-DD
  offset: number;
  limit: number;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Verify cron secret — fail closed: secret MUST be configured
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  // Parse request body
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const { school_id, run_date, offset, limit } = body;
  if (!school_id || !run_date || offset === undefined || !limit) {
    return json({ error: "missing_fields" }, 400);
  }

  // Create Supabase client with service role key
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Defensive check: re-verify insights feature is enabled for this school
    // Prevents TOCTOU race where feature is disabled between dispatcher and execution
    const { data: school } = await admin
      .from("schools")
      .select("features_enabled")
      .eq("id", school_id)
      .single();

    if (!school?.features_enabled?.insights) {
      return json({
        result: "skipped",
        message: "Insights feature is disabled for this school",
      }, 200);
    }

    const workerId = crypto.randomUUID();

    // Claim chunk atomically using durable expiring lease
    const { data: runId, error: claimError } = await admin.rpc("claim_insight_run_chunk", {
      p_school_id: school_id,
      p_run_date: run_date,
      p_chunk_offset: offset,
      p_chunk_limit: limit,
      p_worker_id: workerId,
      p_lease_seconds: 300,
    });

    if (claimError) {
      console.error("Failed to claim insight run chunk:", claimError);
      return json({ error: "claim_failed", details: claimError.message }, 500);
    }

    if (!runId) {
      // Chunk is already completed or currently held by another active worker lease
      return json({
        result: "skipped",
        message: "Chunk already completed or actively leased by another worker",
      }, 200);
    }

    // Query active student enrollments for this chunk with class_id
    const { data: enrollments, error: studentsError } = await admin
      .from("student_enrollments")
      .select("student_profile_id, section_id, sections!inner(class_id)")
      .eq("school_id", school_id)
      .eq("is_active", true)
      .not("academic_year_id", "is", null)
      .order("student_profile_id")
      .range(offset, offset + limit - 1);

    if (studentsError) {
      console.error("Failed to query students:", studentsError);
      await admin
        .from("insight_runs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", runId);
      return json({ error: "query_failed", details: studentsError.message }, 500);
    }

    // Map student to classId
    const studentClassMap = new Map<string, string>();
    const uniqueClassIds = new Set<string>();

    for (const e of enrollments || []) {
      const studentId = e.student_profile_id;
      const classId = (e.sections as any)?.class_id;
      if (studentId && classId) {
        studentClassMap.set(studentId, classId);
        uniqueClassIds.add(classId);
      }
    }

    const studentIds = Array.from(studentClassMap.keys());

    // Update students_total
    await admin
      .from("insight_runs")
      .update({ students_total: studentIds.length })
      .eq("id", runId);

    // Pre-fetch subjects (id, name) for all relevant classes in one query
    const classSubjectsMap = new Map<string, string[]>();
    const subjectNameMap = new Map<string, string>();
    if (uniqueClassIds.size > 0) {
      const { data: subjectsData, error: subjectsError } = await admin
        .from("subjects")
        .select("id, name, class_id")
        .in("class_id", Array.from(uniqueClassIds));

      if (!subjectsError && subjectsData) {
        for (const sub of subjectsData) {
          const list = classSubjectsMap.get(sub.class_id) || [];
          list.push(sub.id);
          classSubjectsMap.set(sub.class_id, list);
          if (sub.name) subjectNameMap.set(sub.id, sub.name);
        }
      }
    }

    // Process students sequentially or with controlled concurrency
    const CONCURRENCY = 5;
    for (let i = 0; i < studentIds.length; i += CONCURRENCY) {
      const batch = studentIds.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (studentId) => {
          try {
            const classId = studentClassMap.get(studentId)!;
            const subjectIds = classSubjectsMap.get(classId) || [];

            // Process attendance risk
            await processAttendanceRisk(admin, studentId, school_id, run_date, runId);

            // Process academic risk
            await processAcademicRisk(admin, studentId, school_id, run_date, runId, subjectIds, subjectNameMap);

            // Increment students_processed counter
            await admin.rpc("increment_insight_run_counter", {
              p_run_id: runId,
              p_counter: "students_processed",
            });
          } catch (error) {
            // Log overall student failure
            const errorMsg = error instanceof Error ? error.message : String(error);
            await admin.from("insight_run_failures").insert({
              run_id: runId,
              student_id: studentId,
              kind: null,
              subject_id: null,
              error_message: errorMsg.substring(0, 500),
            });

            // Increment students_failed counter
            await admin.rpc("increment_insight_run_counter", {
              p_run_id: runId,
              p_counter: "students_failed",
            });

            console.error(`Failed to process student ${studentId}:`, errorMsg);
          }
        })
      );
    }

    // Mark run as completed
    await admin
      .from("insight_runs")
      .update({ status: "completed", finished_at: new Date().toISOString() })
      .eq("id", runId);

    return json({
      result: "ok",
      run_id: runId,
      students_total: studentIds.length,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Unexpected error in insights-recompute:", errorMsg);
    return json({ error: "internal_error", details: errorMsg }, 500);
  }
});

/**
 * Process attendance risk for one student
 */
async function processAttendanceRisk(
  admin: any,
  studentId: string,
  schoolId: string,
  runDate: string,
  runId: string
) {
  // Calculate date 30 days before run_date
  const runDateObj = new Date(runDate);
  const startDate = new Date(runDateObj);
  startDate.setDate(startDate.getDate() - 30);
  const startDateStr = startDate.toISOString().split("T")[0];

  // Fetch last 30 days of attendance records
  const { data: records, error } = await admin
    .from("attendance_records")
    .select("date, status")
    .eq("student_id", studentId)
    .gte("date", startDateStr)
    .lte("date", runDate)
    .order("date");

  if (error) {
    throw new Error(`Failed to fetch attendance records: ${error.message}`);
  }

  // Transform records to match AttendanceRecord type
  const attendanceRecords: AttendanceRecord[] = (records || []).map(
    (r: any) => {
      // Map database status to algorithm type, with safe default for unknown statuses
      let status: "present" | "absent" | "excused";
      if (r.status === "absent") {
        status = "absent";
      } else if (r.status === "excused") {
        status = "excused";
      } else if (r.status === "present") {
        status = "present";
      } else {
        // Unknown status - fail safely by treating as absent (conservative)
        console.warn(`Unknown attendance status: ${r.status}, treating as absent`);
        status = "absent";
      }
      return {
        date: new Date(r.date),
        status,
      };
    }
  );

  // Call pure function
  const input: AttendanceRiskInput = {
    records: attendanceRecords,
    window: 30,
  };
  const insight = computeAttendanceRisk(input);

  // Upsert snapshot
  const { data: snapshotData, error: upsertError } = await admin
    .from("student_risk_snapshots")
    .upsert(
      {
        school_id: schoolId,
        student_id: studentId,
        kind: "attendance",
        computed_for: runDate,
        score: insight.score,
        band: insight.band,
        factors: insight.factors,
        recommended_action: insight.recommended_action,
        subject_id: null,
        params_hash: "INSIGHTS_PARAMS_V1",
      },
      {
        onConflict: "school_id,student_id,kind,computed_for,subject_id",
      }
    )
    .select("id")
    .single();

  if (upsertError) {
    throw new Error(
      `Failed to upsert attendance snapshot: ${upsertError.message}`
    );
  }

  if (insight.band !== "LOW" && snapshotData?.id) {
    const { error: interventionError } = await admin.rpc(
      "create_intervention_if_qualifying",
      { p_snapshot_id: snapshotData.id }
    );
    if (interventionError) {
      console.error(
        `Failed to create attendance intervention for student ${studentId}:`,
        interventionError
      );
    }
  }
}

/**
 * Process academic risk for one student across their subjects
 */
async function processAcademicRisk(
  admin: any,
  studentId: string,
  schoolId: string,
  runDate: string,
  runId: string,
  subjectIds: string[],
  subjectNameMap: Map<string, string> = new Map()
) {
  if (!subjectIds || subjectIds.length === 0) {
    return;
  }

  // Fetch all exam results for this student in one query
  const { data: allExamResults, error: examError } = await admin
    .from("exam_results")
    .select("subject_id, marks_obtained, max_marks, exams(start_date)")
    .eq("student_id", studentId)
    .in("subject_id", subjectIds);

  if (examError) {
    throw new Error(`Failed to fetch exam results: ${examError.message}`);
  }

  // Group exam results by subject_id
  const resultsBySubject = new Map<string, any[]>();
  for (const r of allExamResults || []) {
    const list = resultsBySubject.get(r.subject_id) || [];
    list.push(r);
    resultsBySubject.set(r.subject_id, list);
  }

  // Process each subject with failure isolation
  for (const subject_id of subjectIds) {
    try {
      const examResults = resultsBySubject.get(subject_id) || [];

      // Sort chronologically by exam start_date
      const sortedResults = examResults.sort((a: any, b: any) => {
        const dateA = a.exams?.start_date ? new Date(a.exams.start_date).getTime() : 0;
        const dateB = b.exams?.start_date ? new Date(b.exams.start_date).getTime() : 0;
        return dateA - dateB;
      });

      // Convert to percentage scores
      const scores = sortedResults
        .filter((r: any) => typeof r.max_marks === "number" && r.max_marks > 0 && typeof r.marks_obtained === "number")
        .map((r: any) => (r.marks_obtained / r.max_marks) * 100);

      // Call pure function
      const input: PerformanceInput = {
        examScores: scores,
        passMarkCurrent: 35,
        passMarkTarget: 50,
        subjectName: subjectNameMap.get(subject_id),
      };
      const insight = computePerformanceForecast(input);

      // Upsert snapshot
      const { data: snapshotData, error: upsertError } = await admin
        .from("student_risk_snapshots")
        .upsert(
          {
            school_id: schoolId,
            student_id: studentId,
            kind: "academic",
            computed_for: runDate,
            score: insight.score,
            band: insight.band,
            factors: insight.factors,
            recommended_action: insight.recommended_action,
            subject_id: subject_id,
            params_hash: "INSIGHTS_PARAMS_V1",
          },
          {
            onConflict: "school_id,student_id,kind,computed_for,subject_id",
          }
        )
        .select("id")
        .single();

      if (upsertError) {
        throw new Error(
          `Failed to upsert academic snapshot: ${upsertError.message}`
        );
      }

      if (insight.band !== "LOW" && snapshotData?.id) {
        const { error: interventionError } = await admin.rpc(
          "create_intervention_if_qualifying",
          { p_snapshot_id: snapshotData.id }
        );
        if (interventionError) {
          console.error(
            `Failed to create academic intervention for student ${studentId}, subject ${subject_id}:`,
            interventionError
          );
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await admin.from("insight_run_failures").insert({
        run_id: runId,
        student_id: studentId,
        kind: "academic",
        subject_id: subject_id,
        error_message: errorMsg.substring(0, 500),
      });

      console.error(
        `Failed to process subject ${subject_id} for student ${studentId}:`,
        errorMsg
      );
    }
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
