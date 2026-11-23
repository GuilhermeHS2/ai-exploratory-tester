// Pure metric math, kept apart so it can be unit tested with fixed fixtures.
export type Match = { reportId: string; bugId: string }; // bugId is an enabled bug id or 'none'

export function computeMetrics(enabled: string[], matches: Match[]) {
  const real = matches.filter((m) => m.bugId !== 'none');
  for (const m of real) if (!enabled.includes(m.bugId)) throw new Error(`${m.reportId} matched ${m.bugId}, which is not enabled`);
  const found = [...new Set(real.map((m) => m.bugId))].sort();
  return {
    enabledCount: enabled.length,
    reports: matches.length,
    found,
    missed: enabled.filter((b) => !found.includes(b)),
    recall: enabled.length ? found.length / enabled.length : null, // undefined on a baseline run
    precision: matches.length ? real.length / matches.length : null, // undefined with no reports
    truePositiveReports: real.length,
    duplicates: real.length - found.length, // extra reports of a bug already found
    falsePositives: matches.length - real.length,
  };
}

export function agreement(rows: { judge: string; human: string }[]) {
  const filled = rows.filter((r) => r.human.trim() !== '');
  if (!filled.length) return null;
  const agree = filled.filter((r) => r.human.trim().toUpperCase() === r.judge.trim().toUpperCase()).length;
  return { audited: filled.length, agree, rate: agree / filled.length };
}

// Minimal RFC 4180 CSV, enough for audit.csv (quoted fields, commas, quotes, newlines).
export const toCsv = (rows: string[][]) =>
  rows.map((r) => r.map((v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n') + '\n';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
