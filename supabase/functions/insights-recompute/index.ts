import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  computeAttendanceRisk,
  computePerformanceForecast,
} from "../../../packages/insights/src/index.ts";
import type {
  AttendanceRecord,
  AttendanceRiskInput,
  PerformanceInput,
} from "../../../packages/insights/src/types.ts";

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

  // Verify cron secret
  const secret = Deno.env.get("CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
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
    // Acquire advisory lock to prevent concurrent processing of same school
    // The lock is automatically released at transaction end
    const { error: lockError } = await admin.rpc("pg_advisory_xact_lock", {
      p_school_id: school_id,
    });

    if (lockError) {
      console.error("Failed to acquire advisory lock:", lockError);
      return json({ error: "lock_failed", details: lockError.message }, 500);
    }

    // Create/update insight_runs row (idempotent upsert)
    const { data: runData, error: runError } = await admin
      .from("insight_runs")
      .upsert(
        {
          school_id,
          run_date,
          chunk_offset: offset,
          chunk_limit: limit,
          status: "running",
          students_total: 0,
          students_processed: 0,
          students_failed: 0,
          params_hash: "INSIGHTS_PARAMS_V1",
          trigger: "cron",
          started_at: new Date().toISOString(),
        },
        {
          onConflict: "school_id,run_date,chunk_offset",
        }
      )
      .select("id")
      .single();

    if (runError || !runData) {
      console.error("Failed to create insight_runs row:", runError);
      return json({ error: "run_creation_failed", details: runError?.message }, 500);
    }

    const runId = runData.id;

    // Query active students for this chunk
    const { data: students, error: studentsError } = await admin
      .from("student_enrollments")
      .select("student_profile_id, student_profiles!inner(id)")
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

    const studentIds = [
      ...new Set(
        (students || []).map((s: any) => s.student_profile_id).filter(Boolean)
      ),
    ];

    // Update students_total
    await admin
      .from("insight_runs")
      .update({ students_total: studentIds.length })
      .eq("id", runId);

    // Process each student with failure isolation
    for (const studentId of studentIds) {
      try {
        // Process attendance risk
        await processAttendanceRisk(admin, studentId, school_id, run_date, runId);

        // Process academic risk (per subject)
        await processAcademicRisk(admin, studentId, school_id, run_date, runId);

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
  // Map database status values to what the pure function expects:
  // - present, late, half_day -> 'present' (student was there in some form)
  // - absent -> 'absent'
  // Note: 'excused' is not in our database, mapping absent to 'absent'
  const attendanceRecords: AttendanceRecord[] = (records || []).map(
    (r: any) => {
      const status =
        r.status === "absent" ? ("absent" as const) : ("present" as const);
      return {
        date: new Date(r.date),
        status,
      };
    }
  );

  // Call pure function from @eduos/insights
  const input: AttendanceRiskInput = {
    records: attendanceRecords,
    window: 30,
  };
  const insight = computeAttendanceRisk(input);

  // Upsert snapshot (idempotent - unique constraint handles conflicts)
  const { error: upsertError } = await admin
    .from("student_risk_snapshots")
    .upsert({
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
    });

  if (upsertError) {
    throw new Error(
      `Failed to upsert attendance snapshot: ${upsertError.message}`
    );
  }
}

/**
 * Process academic risk for one student (per subject with failure isolation)
 */
async function processAcademicRisk(
  admin: any,
  studentId: string,
  schoolId: string,
  runDate: string,
  runId: string
) {
  // Get student's active section
  const { data: enrollment, error: enrollmentError } = await admin
    .from("student_enrollments")
    .select("section_id")
    .eq("student_profile_id", studentId)
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  if (enrollmentError || !enrollment?.section_id) {
    throw new Error(
      `Failed to get student section: ${enrollmentError?.message || "No active enrollment"}`
    );
  }

  const sectionId = enrollment.section_id;

  // Get subjects for this section
  const { data: sectionSubjects, error: subjectsError } = await admin
    .from("section_subjects")
    .select("subject_id")
    .eq("section_id", sectionId);

  if (subjectsError) {
    throw new Error(`Failed to get section subjects: ${subjectsError.message}`);
  }

  // Process each subject with per-subject failure isolation
  for (const { subject_id } of sectionSubjects || []) {
    try {
      // Fetch exam scores for this subject (ordered by creation, approximates chronological)
      const { data: examResults, error: examError } = await admin
        .from("exam_results")
        .select("marks_obtained, max_marks")
        .eq("student_id", studentId)
        .eq("subject_id", subject_id)
        .order("created_at");

      if (examError) {
        throw new Error(`Failed to fetch exam results: ${examError.message}`);
      }

      // Convert to percentage scores
      const scores = (examResults || []).map((r: any) => {
        const percentage = (r.marks_obtained / r.max_marks) * 100;
        return percentage;
      });

      // Call pure function
      const input: PerformanceInput = {
        examScores: scores,
        passMarkCurrent: 35,
        passMarkTarget: 50,
      };
      const insight = computePerformanceForecast(input);

      // Upsert snapshot (idempotent - unique constraint handles conflicts)
      const { error: upsertError } = await admin
        .from("student_risk_snapshots")
        .upsert({
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
        });

      if (upsertError) {
        throw new Error(
          `Failed to upsert academic snapshot: ${upsertError.message}`
        );
      }
    } catch (error) {
      // Log per-subject failure, continue to next subject
      const errorMsg = error instanceof Error ? error.message : String(error);
      await admin.from("insight_run_failures").insert({
        run_id: runId,
        student_id: studentId,
        kind: "academic",
        subject_id: subject_id,
        error_message: errorMsg.substring(0, 500),
      });

      // Note: we don't increment students_failed here because the student might
      // succeed for other subjects. The outer try/catch handles overall student failure.

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
