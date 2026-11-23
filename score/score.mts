// Scores agent runs: an LLM judge matches each report to an enabled planted bug or "none",
// then the metrics are computed in code. npm run score -- runs/<runId> [runs/<runId> ...]
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { computeMetrics, toCsv, type Match } from './metrics.mts';

const ROOT = resolve(import.meta.dirname, '..');
const { values: args, positionals: dirs } = parseArgs({
  allowPositionals: true,
  options: {
    'judge-model': { type: 'string', default: 'claude-sonnet-5-5' },
    'judge-prompt': { type: 'string', default: 'judge-v1' },
  },
});
if (!dirs.length) throw new Error('usage: npm run score -- runs/<runId> [...]');

// The YAML block of each bug in bugs.yaml, keyed by id (no YAML parser needed: blocks start at "  - id:").
const BUG_BLOCKS = Object.fromEntries(
  readFileSync(join(ROOT, 'bugs.yaml'), 'utf8')
    .split(/^(?=  - id: )/m)
    .slice(1)
    .map((b) => [/- id: (B\d+)/.exec(b)![1], b.trimEnd()]),
);

type Report = { id: string; title: string; flow: string; steps: string[]; expected: string; actual: string; severity: string; evidence: string };

async function judge(enabled: string[], reports: Report[]) {
  // Nothing to match against on a baseline run: every report is a false positive by definition.
  if (!enabled.length || !reports.length) {
    return { matches: reports.map((r) => ({ reportId: r.id, bugId: 'none', reason: enabled.length ? '' : 'baseline run: no planted bug enabled' })), costUsd: 0, usage: null };
  }
  const prompt = readFileSync(join(ROOT, 'score/prompts', `${args['judge-prompt']}.md`), 'utf8')
    .replace('{{BUGS}}', enabled.map((id) => BUG_BLOCKS[id]).join('\n\n'))
    .replace('{{REPORTS}}', JSON.stringify(reports.map(({ id, title, flow, steps, expected, actual, evidence }) => ({ id, title, flow, steps, expected, actual, evidence })), null, 2));
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['matches'],
    properties: {
      matches: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['report_id', 'bug_id', 'reason'],
          properties: {
            report_id: { type: 'string', enum: reports.map((r) => r.id) },
            bug_id: { type: 'string', enum: [...enabled, 'none'] },
            reason: { type: 'string' },
          },
        },
      },
    },
  };
  const work = mkdtempSync(join(tmpdir(), 'judge-'));
  try {
    for await (const msg of query({
      prompt,
      options: {
        model: args['judge-model'],
        systemPrompt: 'You are a careful QA lead grading bug reports against an answer key. Answer only with the requested JSON.',
        cwd: work,
        tools: [],
        settingSources: [],
        skills: [],
        strictMcpConfig: true,
        permissionMode: 'dontAsk',
        maxTurns: 4,
        maxBudgetUsd: 1,
        outputFormat: { type: 'json_schema', schema },
      },
    })) {
      if (msg.type !== 'result') continue;
      if (msg.subtype !== 'success') throw new Error(`judge failed: ${msg.subtype}`);
      const out = msg.structured_output as { matches: { report_id: string; bug_id: string; reason: string }[] };
      const byId = new Map(out.matches.map((m) => [m.report_id, m]));
      // Every report needs exactly one answer.
      if (byId.size !== reports.length || out.matches.length !== reports.length || reports.some((r) => !byId.has(r.id))) {
        throw new Error(`judge did not answer each report exactly once: ${JSON.stringify(out.matches.map((m) => m.report_id))}`);
      }
      return {
        matches: reports.map((r) => ({ reportId: r.id, bugId: byId.get(r.id)!.bug_id, reason: byId.get(r.id)!.reason })),
        costUsd: msg.total_cost_usd,
        usage: msg.usage,
      };
    }
    throw new Error('judge returned no result');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

for (const dir of dirs) {
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
  const reports: Report[] = JSON.parse(readFileSync(join(dir, 'reports.json'), 'utf8'));
  const j = await judge(meta.enabledBugs, reports);
  const metrics = computeMetrics(meta.enabledBugs, j.matches as Match[]);
  const score = {
    runId: meta.runId,
    model: meta.model,
    promptVersion: meta.promptVersion,
    enabledBugs: meta.enabledBugs,
    baseline: meta.enabledBugs.length === 0,
    ...metrics,
    costUsd: meta.totalCostUsd,
    durationMs: meta.durationMs,
    turns: meta.turns,
    stopReason: meta.stopReason,
    judge: { model: args['judge-model'], prompt: args['judge-prompt'], costUsd: j.costUsd, usage: j.usage },
    matches: j.matches.map((m) => ({ ...m, title: reports.find((r) => r.id === m.reportId)!.title })),
    scoredAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'score.json'), JSON.stringify(score, null, 2) + '\n');

  // Human audit sheet. Never overwrite one that may already hold human answers.
  const audit = join(dir, 'audit.csv');
  if (existsSync(audit)) console.log(`${audit} exists, left as is`);
  else {
    const rows = [['run_id', 'report_id', 'title', 'actual', 'judge_match', 'judge_reason', 'human_match', 'labeled_by', 'note']];
    for (const m of score.matches) {
      const r = reports.find((x) => x.id === m.reportId)!;
      rows.push([meta.runId, m.reportId, r.title, r.actual, m.bugId, m.reason, '', '', '']);
    }
    writeFileSync(audit, toCsv(rows));
  }
  const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);
  console.log(`${basename(dir)}: recall ${pct(metrics.recall)}, precision ${pct(metrics.precision)}, ${metrics.reports} reports, ${metrics.falsePositives} false positives, found ${metrics.found.join(',') || '-'}`);
}
