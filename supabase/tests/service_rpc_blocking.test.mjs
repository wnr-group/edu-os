// Test Finding #3 & #4: Verify anon and authenticated cannot call service-role-only RPCs
//
// SERVICE-ROLE-ONLY RPCs (per migration 20260824154000):
// - insights_recompute_dispatch()
// - claim_insight_run_chunk(...)
// - heartbeat_insight_run(...)
// - increment_insight_run_counter(...)
// - create_intervention_if_qualifying(...)
//
// Expected: All calls as anon or authenticated should fail with permission denied

import { readFileSync } from 'fs';
import pg from 'pg';
const { Client } = pg;

const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function runTest() {
  const client = new Client({ connectionString: DB_URL });
  const notices = [];

  try {
    await client.connect();
    console.log('✓ Connected to local Supabase database\n');

    // Capture NOTICE messages
    client.on('notice', (msg) => {
      notices.push(msg.message);
      console.log(msg.message);
    });

    const sql = readFileSync(new URL('./service_rpc_blocking.test.sql', import.meta.url), 'utf8');

    // Execute the SQL test
    const result = await client.query(sql);

    console.log('\n=== TEST EXECUTION COMPLETE ===\n');

    // Verify we got the expected PASS notices
    const passCount = notices.filter(n => n.startsWith('PASS')).length;
    const failCount = notices.filter(n => n.startsWith('FAIL')).length;

    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      return false;
    }

    // 5 anon (3.1-3.5) + 5 authenticated (4.1-4.5) + 4 service_role positive controls (6.1-6.4) = 14
    if (passCount === 14) {
      console.log(`✓ All ${passCount} tests passed - service-role-only RPCs are properly restricted`);
      return true;
    } else {
      console.error(`⚠ Expected 14 PASS messages, got ${passCount}`);
      return false;
    }

  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
    return false;
  } finally {
    await client.end();
  }
}

runTest().then(success => {
  process.exit(success ? 0 : 1);
});
