// Human audit: reads audit.csv sheets and computes judge-vs-human agreement.
// Humans edit runs/<runId>/audit.csv; syncAudits() copies them to results/audit/ so labels are committed.
// Columns: human_match (a bug id, none, or unplanted-real), labeled_by (who labeled), note.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { agreement, parseCsv } from './metrics.mts';

const ROOT = resolve(import.meta.dirname, '..');
const AUDIT_DIR = join(ROOT, 'results', 'audit');

export function syncAudits() {
  const runs = join(ROOT, 'runs');
  mkdirSync(AUDIT_DIR, { recursive: true });
  if (!existsSync(runs)) return;
  for (const run of readdirSync(runs)) {
    const f = join(runs, run, 'audit.csv');
    if (existsSync(f)) copyFileSync(f, join(AUDIT_DIR, `${run}.csv`));
  }
}

export type AuditRow = { runId: string; reportId: string; judge: string; human: string; labeledBy: string };

export function auditRows(): AuditRow[] {
  if (!existsSync(AUDIT_DIR)) return [];
  const rows: AuditRow[] = [];
  for (const f of readdirSync(AUDIT_DIR).filter((x) => x.endsWith('.csv'))) {
    const [head, ...body] = parseCsv(readFileSync(join(AUDIT_DIR, f), 'utf8'));
    const col = (r: string[], name: string) => (head.includes(name) ? r[head.indexOf(name)] ?? '' : '');
    for (const r of body) rows.push({ runId: col(r, 'run_id'), reportId: col(r, 'report_id'), judge: col(r, 'judge_match'), human: col(r, 'human_match'), labeledBy: col(r, 'labeled_by') });
  }
  return rows;
}

export function describe(rows: AuditRow[]) {
  const result = agreement(rows);
  return result
    ? `Judge-human agreement: ${result.agree}/${result.audited} reports audited by Guilherme (${Math.round(result.rate * 100)}%), out of ${rows.length} judged reports.`
    : `Judge-human agreement: pending human audit (0 of ${rows.length} judged reports audited by Guilherme).`;
}

if (import.meta.main) {
  syncAudits();
  console.log(describe(auditRows()));
}
