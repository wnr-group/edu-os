// Test Finding #5: Verify insights feature flag enforcement in RLS policies

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

    const sql = readFileSync(new URL('./feature_flag_enforcement.test.sql', import.meta.url), 'utf8');

    // Execute the SQL test
    await client.query(sql);

    console.log('\n=== TEST EXECUTION COMPLETE ===\n');

    // Verify results
    const passCount = notices.filter(n => n.startsWith('PASS')).length;
    const failCount = notices.filter(n => n.startsWith('FAIL')).length;
    const skipCount = notices.filter(n => n.startsWith('SKIP')).length;

    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      return false;
    }

    // The fixture (test.interv_id, carried via set_config so RLS on the
    // intervention read can't hide it from the test itself) guarantees tests
    // 5.1-5.10 all run deterministically — none of them may legitimately SKIP.
    // A SKIP here means the fixture regressed, not an acceptable edge case.
    if (skipCount > 0) {
      console.error(`❌ ${skipCount} test(s) SKIPPED — fixture did not produce the required state`);
      return false;
    }

    const EXPECTED_PASS_COUNT = 10; // 5.1-5.10, one PASS each
    if (passCount === EXPECTED_PASS_COUNT) {
      console.log(`✓ ${passCount} tests passed - feature flag enforcement working correctly`);
      return true;
    } else {
      console.error(`⚠ Expected exactly ${EXPECTED_PASS_COUNT} PASS messages, got ${passCount}`);
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
