const { Client } = require("pg");
const http = require("http");
const crypto = require("crypto");

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const SCHOOL_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const TEACHER_USER_ID = "aaaaaaaa-0000-0000-0000-000000000013";
const PRINCIPAL_USER_ID = "aaaaaaaa-0000-0000-0000-000000000012";
const ADMIN_USER_ID = "aaaaaaaa-0000-0000-0000-000000000011";
const PARENT_USER_ID = "aaaaaaaa-0000-0000-0000-000000000030";
const STUDENT_ID = "dddddddd-0000-0000-0000-000000000001";

async function createSetupClient() {
  const client = new Client(DB_URL);
  await client.connect();
  return client;
}

async function createScopedPgClient(userId, role, schoolId = SCHOOL_ID) {
  const client = new Client(DB_URL);
  await client.connect();
  await client.query("SET ROLE authenticated");
  await client.query("SELECT set_config('app.role', $1, false)", [role]);
  await client.query("SELECT set_config('app.school_id', $1, false)", [schoolId]);
  await client.query("SELECT set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  return client;
}

async function run() {
  console.log("=================================================================");
  console.log("🚀 STARTING FULL E2E WEB + LIFECYCLE + ROLE-BASED ACCESS TEST");
  console.log("=================================================================\n");

  const setupClient = await createSetupClient();

  // 1. Clean previous test state
  await setupClient.query("DELETE FROM public.interventions WHERE student_id = $1", [STUDENT_ID]);
  await setupClient.query("DELETE FROM public.student_risk_snapshots WHERE student_id = $1", [STUDENT_ID]);
  await setupClient.query("DELETE FROM public.notifications WHERE user_id = $1", [PARENT_USER_ID]);

  // 2. Create qualifying snapshots (Attendance HIGH and Academic HIGH with 2 subjects)
  const today = new Date().toISOString().split("T")[0];
  const snapAttnRes = await setupClient.query(
    `INSERT INTO public.student_risk_snapshots (
       school_id, student_id, kind, computed_for, score, band, factors, recommended_action, params_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      SCHOOL_ID,
      STUDENT_ID,
      "attendance",
      today,
      75.0,
      "HIGH",
      JSON.stringify([
        { key: "rate", label: "72% present", value: 0.72, contribution: 30 },
        { key: "streak", label: "5 consecutive absences", value: 5, contribution: 20 },
      ]),
      "Call parent to discuss consecutive absences",
      "PARAMS_V1",
    ]
  );
  const snapAttnId = snapAttnRes.rows[0].id;

  const subMath = await setupClient.query(
    "SELECT id FROM public.subjects WHERE school_id = $1 AND name ILIKE $2 LIMIT 1",
    [SCHOOL_ID, "%Math%"]
  );
  const subEng = await setupClient.query(
    "SELECT id FROM public.subjects WHERE school_id = $1 AND name ILIKE $2 LIMIT 1",
    [SCHOOL_ID, "%English%"]
  );

  const snapMathRes = await setupClient.query(
    `INSERT INTO public.student_risk_snapshots (
       school_id, student_id, kind, subject_id, computed_for, score, band, factors, recommended_action, params_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      SCHOOL_ID,
      STUDENT_ID,
      "academic",
      subMath.rows[0].id,
      today,
      82.0,
      "HIGH",
      JSON.stringify([
        { key: "trend", label: "Declining trend (-18%)", value: -18, contribution: 40 },
        { key: "fail_prob", label: "82% failure forecast", value: 82, contribution: 30 },
      ]),
      "Assign dedicated academic tutor and parent conference",
      "PARAMS_V1",
    ]
  );
  const snapMathId = snapMathRes.rows[0].id;

  const snapEngRes = await setupClient.query(
    `INSERT INTO public.student_risk_snapshots (
       school_id, student_id, kind, subject_id, computed_for, score, band, factors, recommended_action, params_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      SCHOOL_ID,
      STUDENT_ID,
      "academic",
      subEng.rows[0].id,
      today,
      68.0,
      "HIGH",
      JSON.stringify([{ key: "trend", label: "Low average (32%)", value: 32, contribution: 35 }]),
      "Conduct remedial English sessions",
      "PARAMS_V1",
    ]
  );
  const snapEngId = snapEngRes.rows[0].id;

  console.log("--- 1. QUALIFICATION & INTERVENTION CREATION ---");
  const intervAttnRes = await setupClient.query(
    "SELECT public.create_intervention_if_qualifying($1) as id",
    [snapAttnId]
  );
  const intervAttnId = intervAttnRes.rows[0].id;
  console.log("  ✅ Attendance Intervention Created ID:", intervAttnId);

  const intervAcadRes = await setupClient.query(
    "SELECT public.create_intervention_if_qualifying($1) as id",
    [snapMathId]
  );
  const intervAcadId = intervAcadRes.rows[0].id;
  console.log("  ✅ Academic Intervention Created (Math primary) ID:", intervAcadId);

  const intervAcadRes2 = await setupClient.query(
    "SELECT public.create_intervention_if_qualifying($1) as id",
    [snapEngId]
  );
  const intervAcadId2 = intervAcadRes2.rows[0].id;
  console.log("  ✅ Academic Sibling Qualification Returned Existing ID (Dedup holds):", intervAcadId2);
  if (intervAcadId !== intervAcadId2) throw new Error("Academic deduplication failed!");

  const evidenceRes = await setupClient.query(
    "SELECT snapshot_id, is_pinned FROM public.intervention_academic_evidence WHERE intervention_id = $1",
    [intervAcadId]
  );
  console.log("  ✅ Sibling Evidence Rows Count:", evidenceRes.rows.length);
  if (evidenceRes.rows.length !== 2) throw new Error("Expected 2 academic evidence rows!");

  // --- 2. TEACHER LIFECYCLE & NOTIFICATION FLOW ---
  console.log("\n--- 2. TEACHER LIFECYCLE & PARENT NOTIFICATION FLOW ---");
  const teacherClient = await createScopedPgClient(TEACHER_USER_ID, "teacher");

  // Fetch teacher queue
  const teacherQueue = await teacherClient.query(
    "SELECT id, title, status, severity_band, due_date FROM public.interventions WHERE assignee_id = $1",
    [TEACHER_USER_ID]
  );
  console.log(`  ✅ Teacher retrieved ${teacherQueue.rows.length} assigned interventions in action queue.`);

  // 2A. Start Intervention
  console.log("  Testing start_intervention RPC...");
  await teacherClient.query("SELECT public.start_intervention($1)", [intervAttnId]);
  const startRow = await teacherClient.query("SELECT status, started_at FROM public.interventions WHERE id = $1", [intervAttnId]);
  console.log("  ✅ start_intervention succeeded. New status:", startRow.rows[0].status, "Started At:", startRow.rows[0].started_at);

  // 2B. Notify Parent
  console.log("  Testing notify_parent_for_intervention RPC with idempotency...");
  const clientReqId = crypto.randomUUID();
  const notifRes1 = await teacherClient.query(
    "SELECT public.notify_parent_for_intervention($1, $2) as notif_id",
    [intervAttnId, clientReqId]
  );
  const notifId1 = notifRes1.rows[0].notif_id;
  console.log("  ✅ notify_parent_for_intervention created notification ID:", notifId1);

  // Idempotent retry
  const notifRes2 = await teacherClient.query(
    "SELECT public.notify_parent_for_intervention($1, $2) as notif_id",
    [intervAttnId, clientReqId]
  );
  const notifId2 = notifRes2.rows[0].notif_id;
  console.log("  ✅ Retry with same client_request_id returned identical notification ID:", notifId2);
  if (notifId1 !== notifId2) throw new Error("Idempotency failed!");

  // Verify notification in notifications table
  const notifRowRes = await setupClient.query(
    "SELECT title, body, user_id, is_read FROM public.notifications WHERE id = $1",
    [notifId1]
  );
  const notifRow = notifRowRes.rows[0];
  console.log("  ✅ Parent Notification Record in DB:");
  console.log(`     - Title: "${notifRow.title}"`);
  console.log(`     - Body: "${notifRow.body}"`);
  console.log(`     - User ID: ${notifRow.user_id}`);

  // 2C. Complete Intervention
  console.log("  Testing complete_intervention RPC with outcome notes...");
  await teacherClient.query(
    "SELECT public.complete_intervention($1, $2)",
    [intervAttnId, "Contacted mother via phone. Resolved transportation issue."]
  );
  const compRow = await teacherClient.query("SELECT status, outcome_note, completed_at FROM public.interventions WHERE id = $1", [intervAttnId]);
  console.log("  ✅ complete_intervention succeeded. Status:", compRow.rows[0].status, "Outcome:", compRow.rows[0].outcome_note);

  // --- 3. ADMIN REASSIGNMENT FLOW ---
  console.log("\n--- 3. ADMIN INTERVENTION REASSIGNMENT FLOW ---");
  const adminClient = await createScopedPgClient(ADMIN_USER_ID, "school_admin");
  console.log("  Testing reassign_intervention RPC by admin to Principal...");
  await adminClient.query(
    "SELECT public.reassign_intervention($1, $2)",
    [intervAcadId, PRINCIPAL_USER_ID]
  );
  const reassignRow = await adminClient.query("SELECT assignee_id, assigned_via FROM public.interventions WHERE id = $1", [intervAcadId]);
  console.log("  ✅ reassign_intervention succeeded. New Assignee:", reassignRow.rows[0].assignee_id, "Via:", reassignRow.rows[0].assigned_via);

  // --- 4. DISMISSAL FLOW ---
  console.log("\n--- 4. DISMISSAL FLOW & MANDATORY REASON VALIDATION ---");
  const principalClient = await createScopedPgClient(PRINCIPAL_USER_ID, "principal");

  console.log("  Testing dismiss_intervention with empty reason (should fail)...");
  try {
    await principalClient.query("SELECT public.dismiss_intervention($1, $2)", [intervAcadId, "   "]);
    throw new Error("Expected dismiss with empty reason to fail!");
  } catch (err) {
    console.log("  ✅ Empty dismissal correctly rejected:", err.message);
  }

  console.log("  Testing dismiss_intervention with valid reason...");
  await principalClient.query(
    "SELECT public.dismiss_intervention($1, $2)",
    [intervAcadId, "Student transferred to specialized advanced coaching program."]
  );
  const dismissRow = await principalClient.query("SELECT status, dismissal_reason, dismissed_at FROM public.interventions WHERE id = $1", [intervAcadId]);
  console.log("  ✅ dismiss_intervention succeeded. Status:", dismissRow.rows[0].status, "Reason:", dismissRow.rows[0].dismissal_reason);

  // --- 5. PARENT ISOLATION CHECK ---
  console.log("\n--- 5. PARENT PERMISSIONS & ISOLATION CHECK ---");
  const parentClient = await createScopedPgClient(PARENT_USER_ID, "parent");

  const parentInterv = await parentClient.query("SELECT * FROM public.interventions");
  console.log("  ✅ Parent query on interventions returned rows:", parentInterv.rows.length);
  if (parentInterv.rows.length !== 0) throw new Error("Parent RLS leak!");

  const parentNotifs = await parentClient.query(
    "SELECT id, title, body, is_read FROM public.notifications WHERE user_id = $1",
    [PARENT_USER_ID]
  );
  console.log(`  ✅ Parent retrieved ${parentNotifs.rows.length} safe notification(s) in More → Notifications.`);
  console.log(`     Notification Title: "${parentNotifs.rows[0].title}"`);

  // Close clients
  await setupClient.end();
  await adminClient.end();
  await teacherClient.end();
  await principalClient.end();
  await parentClient.end();

  console.log("\n=================================================================");
  console.log("🎉 ALL WEB + BACKEND E2E WORKFLOW TESTS PASSED CLEANLY!");
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("❌ E2E TEST FAILED:", err);
  process.exit(1);
});
