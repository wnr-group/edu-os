/**
 * Comment 7 — Systematic mutation test runner
 *
 * Applies mutations one at a time to the canonical source files,
 * runs the full pnpm test suite, and records kill/survive for each.
 * Each mutation is restored before the next one runs.
 */
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const AR = path.join(REPO, 'supabase/functions/_shared/insights/attendance-risk.ts');
const PF = path.join(REPO, 'supabase/functions/_shared/insights/performance-forecast.ts');
const RE = path.join(REPO, 'packages/shared/src/rpc-errors.ts');

function read(f) { return readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); }
function write(f, c) { writeFileSync(f, c, 'utf8'); }

function runTests() {
  try {
    const out = execSync('pnpm test --filter "!@erp/web" 2>&1', {
      cwd: REPO,
      timeout: 60000,
      encoding: 'utf8',
    });
    // Count pass/fail from vitest output
    const passMatch = out.match(/Tests\s+(\d+) passed/);
    const failMatch = out.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    return { ok: failed === 0 && passed > 0, passed, failed, out: out.slice(-500) };
  } catch (e) {
    // If execSync throws, tests failed
    const out = (e.stdout || '') + (e.stderr || '');
    const passMatch = out.match(/Tests\s+(\d+) passed/);
    const failMatch = out.match(/(\d+) failed/);
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    return { ok: false, passed, failed, out: out.slice(-500) };
  }
}

const mutations = [
  // ─── attendance-risk.ts ───────────────────────────────────────────────────
  {
    id: 'M01', file: AR, description: 'collapse: any→every (present rule weakened)',
    from: `sessions.some((s) => s.status === 'present')`,
    to:   `sessions.every((s) => s.status === 'present')`,
  },
  {
    id: 'M02', file: AR, description: 'collapse: every→some (absent rule widened)',
    from: `sessions.every((s) => s.status === 'absent')`,
    to:   `sessions.some((s) => s.status === 'absent')`,
  },
  {
    id: 'M03', file: AR, description: 'streak: absent→present (counts present not absent)',
    from: `if (countedRecords[i].status === 'absent') {`,
    to:   `if (countedRecords[i].status === 'present') {`,
  },
  {
    id: 'M04', file: AR, description: 'streak: use raw records instead of countedRecords',
    from: `for (let i = countedRecords.length - 1; i >= 0; i--) {\n    if (countedRecords[i].status === 'absent') {`,
    to:   `for (let i = records.length - 1; i >= 0; i--) {\n    if (records[i].status === 'absent') {`,
  },
  {
    id: 'M05', file: AR, description: 'filter: include excused (remove != excused filter)',
    from: `const countedRecords = records.filter(r => r.status !== 'excused');`,
    to:   `const countedRecords = records;`,
  },
  {
    id: 'M06', file: AR, description: 'drop: remove Math.max(0) (allow negative drop)',
    from: `const drop = Math.max(0, priorRate - recentRate);`,
    to:   `const drop = priorRate - recentRate;`,
  },
  {
    id: 'M07', file: AR, description: 'band HIGH: >= 60 → > 60 (off-by-one)',
    from: `if (score >= 60) {`,
    to:   `if (score > 60) {`,
  },
  {
    id: 'M08', file: AR, description: 'band MED: >= 35 → > 35 (off-by-one)',
    from: `} else if (score >= 35) {`,
    to:   `} else if (score > 35) {`,
  },
  {
    id: 'M09', file: AR, description: 'streak component: min(streak/5,1) → min(streak/10,1)',
    from: `const streakComponent = 0.20 * Math.min(streak / 5, 1);`,
    to:   `const streakComponent = 0.20 * Math.min(streak / 10, 1);`,
  },
  {
    id: 'M10', file: AR, description: 'rate weight: 0.40 → 0.50 (changes total score)',
    from: `const rateComponent = 0.40 * (1 - rate);`,
    to:   `const rateComponent = 0.50 * (1 - rate);`,
  },
  // ─── performance-forecast.ts ─────────────────────────────────────────────
  {
    id: 'M11', file: PF, description: 'remedial: remove Math.max(1) floor (KEY mutation)',
    from: `const remedial = Math.max(1, Math.ceil(gap / 5));`,
    to:   `const remedial = Math.ceil(gap / 5);`,
  },
  {
    id: 'M12', file: PF, description: 'remedial: Math.ceil → Math.floor (wrong rounding)',
    from: `const remedial = Math.max(1, Math.ceil(gap / 5));`,
    to:   `const remedial = Math.max(1, Math.floor(gap / 5));`,
  },
  {
    id: 'M13', file: PF, description: 'remedial: gap/5 → gap/10 (wrong divisor)',
    from: `const remedial = Math.max(1, Math.ceil(gap / 5));`,
    to:   `const remedial = Math.max(1, Math.ceil(gap / 10));`,
  },
  {
    id: 'M14', file: PF, description: 'subject: ?? → || (empty string passthrough broken)',
    from: `const subject = subjectName ?? 'the subject';`,
    to:   `const subject = subjectName || 'the subject';`,
  },
  {
    id: 'M15', file: PF, description: 'HIGH band: pred < passMarkCurrent → pred <= passMarkCurrent',
    from: `if (pred < passMarkCurrent || slope < -8) {`,
    to:   `if (pred <= passMarkCurrent || slope < -8) {`,
  },
  {
    id: 'M16', file: PF, description: 'improve: slope > 5 → slope >= 5 (boundary shift)',
    from: `} else if (slope > 5) {`,
    to:   `} else if (slope >= 5) {`,
  },
  {
    id: 'M17', file: PF, description: 'pred clamp: remove Math.max(0, ...) (pred can be negative)',
    from: `const pred = Math.max(0, Math.min(100, rawPred)); // Clamp to [0, 100]`,
    to:   `const pred = Math.min(100, rawPred); // Clamp to [0, 100]`,
  },
  // ─── rpc-errors.ts ───────────────────────────────────────────────────────
  {
    id: 'M18', file: RE, description: 'instanceof: check object before Error (ordering bug reinstated)',
    from: `  if (err instanceof Error) return err.message || fallback;\n  if (err && typeof err === "object") {`,
    to:   `  if (err && typeof err === "object") {\n    if (err instanceof Error) return err.message || fallback;`,
  },
  {
    id: 'M19', file: RE, description: 'fallback: || → ?? (empty string from map passes through)',
    from: `    return RPC_ERROR_MESSAGES[msg] || fallback;`,
    to:   `    return RPC_ERROR_MESSAGES[msg] ?? fallback;`,
  },
  {
    id: 'M20', file: RE, description: 'map: remove module_disabled entry',
    from: `  module_disabled: "Insights is switched off for this school.",`,
    to:   ``,
  },
  {
    id: 'M21', file: RE, description: 'not_authorized: empty string value (breaks message lookup)',
    from: `  not_authorized: "You are not authorized to perform this action.",`,
    to:   `  not_authorized: "",`,
  },
];

const results = [];

for (const mutation of mutations) {
  const original = read(mutation.file);

  // Apply mutation
  const mutated = original.replace(mutation.from, mutation.to);
  if (mutated === original) {
    console.log(`⚠️  ${mutation.id} SKIPPED — search string not found in ${path.basename(mutation.file)}`);
    results.push({ ...mutation, result: 'SKIPPED (not found)' });
    continue;
  }

  write(mutation.file, mutated);
  console.log(`\n🔪 ${mutation.id}: ${mutation.description}`);

  const { ok, passed, failed, out } = runTests();

  // Restore original
  write(mutation.file, original);

  if (!ok) {
    console.log(`   ✅ KILLED (${failed} test(s) failed, ${passed} passed)`);
    results.push({ ...mutation, result: `KILLED (${failed} fail, ${passed} pass)` });
  } else {
    console.log(`   ❌ SURVIVED (all ${passed} tests passed — mutation not caught!)`);
    results.push({ ...mutation, result: `SURVIVED (${passed} pass, ${failed} fail)` });
  }
}

console.log('\n\n════ MUTATION RESULTS ════');
let killed = 0; let survived = 0; let skipped = 0;
for (const r of results) {
  const emoji = r.result.startsWith('KILLED') ? '✅' : r.result.startsWith('SURVIVED') ? '❌' : '⚠️';
  console.log(`${emoji} ${r.id} [${path.basename(r.file)}] — ${r.description}: ${r.result}`);
  if (r.result.startsWith('KILLED')) killed++;
  else if (r.result.startsWith('SURVIVED')) survived++;
  else skipped++;
}
console.log(`\nTotal: ${killed} KILLED | ${survived} SURVIVED | ${skipped} SKIPPED`);
process.exit(survived > 0 ? 1 : 0);
