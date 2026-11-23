// Proves the answer key: the suite passes with no bugs, and each bug, alone,
// fails its own @Bxx detector without breaking many unrelated tests.
// Writes the table to test-results/verify-bugs.json.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const MAX_BLAST = 2; // other tests allowed to fail with one bug on
const BUG_IDS = [...readFileSync('bugs.yaml', 'utf8').matchAll(/^\s*- id: (B\d+)/gm)].map((m) => m[1]);
mkdirSync('test-results', { recursive: true });

function run(bugs) {
  const out = `test-results/run-${bugs || 'none'}.json`;
  spawnSync('npx', ['playwright', 'test', '--reporter=json'], {
    env: { ...process.env, BUGS: bugs, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const failed = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) if (!spec.ok) failed.push(spec.title);
    for (const s of suite.suites ?? []) walk(s);
  };
  const report = JSON.parse(readFileSync(out, 'utf8'));
  report.suites.forEach(walk);
  if (report.errors?.length) failed.push(...report.errors.map((e) => `run error: ${e.message}`));
  return failed;
}

const baseline = run('');
const rows = [{ bug: 'none', detected: baseline.length === 0, blastRadius: baseline }];
for (const id of BUG_IDS) {
  const failed = run(id);
  const tag = new RegExp(`@${id}\\b`);
  rows.push({ bug: id, detected: failed.some((t) => tag.test(t)), blastRadius: failed.filter((t) => !tag.test(t)) });
}

const ok = (r) => r.detected && r.blastRadius.length <= (r.bug === 'none' ? 0 : MAX_BLAST);
console.log('\nbug   detector  other failures');
for (const r of rows) {
  const det = r.bug === 'none' ? (r.detected ? 'all pass' : 'FAILED') : r.detected ? 'fails ok' : 'MISSED';
  console.log(`${r.bug.padEnd(5)} ${det.padEnd(9)} ${r.blastRadius.length}${r.blastRadius.length ? `  (${r.blastRadius.join('; ')})` : ''}${ok(r) ? '' : '  <-- problem'}`);
}
writeFileSync('test-results/verify-bugs.json', JSON.stringify({ maxBlast: MAX_BLAST, rows }, null, 2) + '\n');
if (BUG_IDS.length === 0 || !rows.every(ok)) {
  console.error('\nverify:bugs failed');
  process.exit(1);
}
console.log(`\nverify:bugs ok: ${BUG_IDS.length} bugs, each detected, no baseline failures`);
