// Test Finding #12 Part 2: Concurrent Transitions (FOR UPDATE verification)

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

    client.on('notice', (msg) => {
      notices.push(msg.message);
      console.log(msg.message);
    });

    const sql = readFileSync(new URL('./concurrent_transitions.test.sql', import.meta.url), 'utf8');
    await client.query(sql);

    console.log('\n=== TEST EXECUTION COMPLETE ===\n');

    const passCount = notices.filter(n => n.startsWith('PASS')).length;
    const failCount = notices.filter(n => n.startsWith('FAIL')).length;

    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      return false;
    }

    if (passCount === 6) {  // 6 tests: 12.5-12.10
      console.log(`✓ All ${passCount} tests passed - FOR UPDATE verified in all lifecycle RPCs`);
      return true;
    } else {
      console.error(`⚠ Expected 6 PASS messages, got ${passCount}`);
      return false;
    }

  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    return false;
  } finally {
    await client.end();
  }
}

runTest().then(success => {
  process.exit(success ? 0 : 1);
});
