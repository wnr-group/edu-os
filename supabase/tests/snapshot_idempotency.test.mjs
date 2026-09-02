// Test Finding #12 Part 1: Snapshot Idempotency

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

    const sql = readFileSync(new URL('./snapshot_idempotency.test.sql', import.meta.url), 'utf8');
    await client.query(sql);

    console.log('\n=== TEST EXECUTION COMPLETE ===\n');

    const passCount = notices.filter(n => n.startsWith('PASS')).length;
    const failCount = notices.filter(n => n.startsWith('FAIL')).length;

    if (failCount > 0) {
      console.error(`❌ ${failCount} test(s) failed`);
      return false;
    }

    // SQL test covers 7 idempotency scenarios + 1 upsert test = 8 PASS notices
    if (passCount === 8) {
      console.log(`✓ All ${passCount} tests passed - snapshot idempotency verified`);
      return true;
    } else {
      console.error(`⚠ Expected 8 PASS messages, got ${passCount}`);
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
