/**
 * Comment 8 — Multi-worker lease-race test (FIXED)
 *
 * Correct scenario:
 *   W1 claims a chunk → W1 stops heartbeating (simulated: lease expires via direct UPDATE) →
 *   W2 reclaims it → W1 tries to mark completed/failed → must fail (worker_id guard).
 *   W2 completes → counters/status coherent.
 *
 * Key: do NOT heartbeat after expiry (that would renew the lease and prevent W2 claim).
 */
import pg from 'pg';
const { Client } = pg;
const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

let pass = 0; let fail = 0;
function PASS(msg) { console.log(`PASS: ${msg}`); pass++; }
function FAIL(msg) { console.error(`FAIL: ${msg}`); fail++; }

async function query(client, sql, params = []) {
  return client.query(sql, params);
}

async function run() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();

  // Find an insights-enabled school
  const schoolRow = await query(db, `
    SELECT s.id AS school_id
    FROM public.schools s
    WHERE public.feature_enabled(s.id, 'insights')
    LIMIT 1
  `);
  if (!schoolRow.rows.length) {
    console.log('SKIP: No insights-enabled school');
    await db.end(); process.exit(0);
  }
  const schoolId = schoolRow.rows[0].school_id;
  const testDate = '2099-12-31';   // far future, won't conflict with real runs
  const chunkOffset = 7777;
  const w1 = 'aaaa0001-0000-0000-0000-000000000001';
  const w2 = 'bbbb0002-0000-0000-0000-000000000002';

  // Cleanup leftover
  await query(db, `DELETE FROM public.insight_runs WHERE school_id=$1 AND run_date=$2 AND chunk_offset=$3`,
    [schoolId, testDate, chunkOffset]);

  // ─── STEP 1: W1 claims the chunk (60-second lease) ─────────────────────────
  const claim1 = await query(db, `SELECT public.claim_insight_run_chunk($1,$2,$3,$4,$5,$6) AS run_id`,
    [schoolId, testDate, chunkOffset, 100, w1, 60]);
  const runId = claim1.rows[0].run_id;
  if (!runId) { FAIL('W1 claim returned NULL'); await db.end(); process.exit(1); }
  PASS(`STEP 1: W1 claimed; run_id=${runId}`);

  // ─── STEP 2: Verify W1 owns the row and lease is valid ─────────────────────
  const s2 = await query(db, `SELECT worker_id, status, lease_expires_at FROM public.insight_runs WHERE id=$1`, [runId]);
  const row2 = s2.rows[0];
  if (row2.worker_id !== w1) { FAIL(`Step 2: W1 should own row, got worker_id=${row2.worker_id}`); }
  else PASS(`STEP 2: Row owned by W1, status=${row2.status}, lease_expires_at=${row2.lease_expires_at}`);

  // ─── STEP 3: Expire W1's lease (simulate crash — no heartbeat) ─────────────
  // Direct UPDATE: set lease to past. W1 does NOT heartbeat — just expires.
  await query(db, `UPDATE public.insight_runs SET lease_expires_at = now() - interval '10 seconds' WHERE id=$1`, [runId]);
  const s3 = await query(db, `SELECT lease_expires_at < now() AS expired FROM public.insight_runs WHERE id=$1`, [runId]);
  if (s3.rows[0].expired) {
    PASS(`STEP 3: Lease expired (lease_expires_at < now())`);
  } else {
    FAIL(`STEP 3: Lease not expired as expected`);
  }

  // ─── STEP 4: W2 claims the same chunk (should succeed — lease expired) ──────
  const claim2 = await query(db, `SELECT public.claim_insight_run_chunk($1,$2,$3,$4,$5,$6) AS run_id`,
    [schoolId, testDate, chunkOffset, 100, w2, 300]);
  const runId2 = claim2.rows[0].run_id;
  if (!runId2 || runId2 !== runId) {
    FAIL(`STEP 4: W2 reclaim failed — runId2=${runId2} (expected ${runId})`);
    await db.end(); process.exit(1);
  }
  PASS(`STEP 4: W2 reclaimed same run_id=${runId2}`);

  // ─── STEP 5: Verify W2 now owns the row and attempt counter incremented ──────
  const s5 = await query(db, `SELECT worker_id, status, attempt FROM public.insight_runs WHERE id=$1`, [runId]);
  const row5 = s5.rows[0];
  if (row5.worker_id !== w2) { FAIL(`STEP 5: Expected W2 to own row, got ${row5.worker_id}`); }
  else PASS(`STEP 5: Row now owned by W2, status=${row5.status}`);
  if (row5.attempt < 2) { FAIL(`STEP 5: attempt should be >=2 after reclaim, got ${row5.attempt}`); }
  else PASS(`STEP 5: attempt=${row5.attempt} incremented on reclaim (crash-recovery)`);

  // ─── STEP 6: W1 tries to mark completed — must fail (worker_id guard) ───────
  // This mirrors the exact UPDATE in insights-recompute/index.ts:
  //   .update({status:'completed',...}).eq('id',runId).eq('worker_id',workerId)
  const w1Complete = await query(db, `
    UPDATE public.insight_runs
    SET status='completed', finished_at=now(), students_processed=50
    WHERE id=$1 AND worker_id=$2 AND status='running'
    RETURNING id
  `, [runId, w1]);
  if (w1Complete.rows.length > 0) {
    FAIL(`STEP 6: W1 managed to mark run completed despite lease loss!`);
  } else {
    PASS(`STEP 6: W1 mark-completed correctly REJECTED — 0 rows updated (worker_id guard)`);
  }

  // ─── STEP 7: Verify status not poisoned ─────────────────────────────────────
  const s7 = await query(db, `SELECT status, worker_id FROM public.insight_runs WHERE id=$1`, [runId]);
  if (s7.rows[0].status === 'running' && s7.rows[0].worker_id === w2) {
    PASS(`STEP 7: Status=running, owner=W2 — row not poisoned by W1's rejected update`);
  } else {
    FAIL(`STEP 7: Row state corrupted: ${JSON.stringify(s7.rows[0])}`);
  }

  // ─── STEP 8: W1 tries to mark failed — must also fail ───────────────────────
  const w1Fail = await query(db, `
    UPDATE public.insight_runs
    SET status='failed', finished_at=now()
    WHERE id=$1 AND worker_id=$2 AND status='running'
    RETURNING id
  `, [runId, w1]);
  if (w1Fail.rows.length > 0) {
    FAIL(`STEP 8: W1 managed to mark run failed despite lease loss!`);
  } else {
    PASS(`STEP 8: W1 mark-failed correctly REJECTED — 0 rows updated`);
  }

  // ─── STEP 9: W2 heartbeats normally — should succeed ────────────────────────
  const hb2 = await query(db, `SELECT public.heartbeat_insight_run($1,$2,$3) AS ok`, [runId, w2, 300]);
  if (hb2.rows[0].ok) {
    PASS(`STEP 9: W2 heartbeat succeeded (lease renewed)`);
  } else {
    FAIL(`STEP 9: W2 heartbeat failed unexpectedly`);
  }

  // ─── STEP 10: W2 completes normally ─────────────────────────────────────────
  const w2Complete = await query(db, `
    UPDATE public.insight_runs
    SET status='completed', finished_at=now(),
        students_processed=42, students_total=42, students_failed=0
    WHERE id=$1 AND worker_id=$2 AND status='running'
    RETURNING id, status, students_processed, students_total, students_failed
  `, [runId, w2]);
  if (!w2Complete.rows.length) {
    FAIL(`STEP 10: W2 could not mark run completed`);
  } else {
    const r = w2Complete.rows[0];
    PASS(`STEP 10: W2 completed: status=${r.status}, processed=${r.students_processed}, total=${r.students_total}, failed=${r.students_failed}`);
  }

  // ─── STEP 11: Final coherence check ─────────────────────────────────────────
  const final = await query(db, `
    SELECT status, worker_id, students_processed, students_failed, attempt
    FROM public.insight_runs WHERE id=$1
  `, [runId]);
  const f = final.rows[0];
  const coherent = f.status === 'completed' && f.worker_id === w2
    && f.students_processed === 42 && f.students_failed === 0 && f.attempt >= 2;
  if (coherent) {
    PASS(`STEP 11: Final state coherent — status=completed, owner=W2, processed=42, failed=0, attempt=${f.attempt}`);
  } else {
    FAIL(`STEP 11: Final state incoherent: ${JSON.stringify(f)}`);
  }

  // Cleanup
  await query(db, `DELETE FROM public.insight_runs WHERE school_id=$1 AND run_date=$2 AND chunk_offset=$3`,
    [schoolId, testDate, chunkOffset]);

  await db.end();
  console.log(`\n=== LEASE RACE: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
