// Judge-vs-human agreement over the audit.csv rows a human filled (human_match column).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { agreement, parseCsv } from './metrics.mts';

export function auditAgreement(runsDir = resolve(import.meta.dirname, '..', 'runs')) {
  const rows: { judge: string; human: string }[] = [];
  if (existsSync(runsDir)) {
    for (const run of readdirSync(runsDir)) {
      const file = join(runsDir, run, 'audit.csv');
      if (!existsSync(file)) continue;
      const [head, ...body] = parseCsv(readFileSync(file, 'utf8'));
      const j = head.indexOf('judge_match');
      const h = head.indexOf('human_match');
      for (const r of body) rows.push({ judge: r[j] ?? '', human: r[h] ?? '' });
    }
  }
  return { reports: rows.length, result: agreement(rows) };
}

export const describe = ({ reports, result }: ReturnType<typeof auditAgreement>) =>
  result
    ? `Judge-human agreement: ${result.agree}/${result.audited} audited reports (${Math.round(result.rate * 100)}%), out of ${reports} judged reports.`
    : `Judge-human agreement: pending human audit (0 of ${reports} judged reports audited).`;

if (import.meta.main) console.log(describe(auditAgreement()));
