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

    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      return false;
    }

    if (passCount === 6) {  // 6 total tests
      console.log(`✓ All ${passCount} tests passed - feature flag enforcement working correctly`);
      return true;
    } else {
      console.error(`⚠ Expected 6 PASS messages, got ${passCount}`);
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
