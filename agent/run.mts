// Runs the exploratory agent against the shop and records the run in runs/<runId>/.
// npm run agent -- --bugs B01,B04 --model claude-sonnet-5-5 --prompt v1 --runs 1
// npm run agent -- --random 4 --seed 7     (random subset of 4 bugs)
// npm run agent -- --bugs none             (baseline: correct app)
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { query, type SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { chromium } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const DEPS = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).dependencies;
const ALL_BUGS = [...readFileSync(join(ROOT, 'bugs.yaml'), 'utf8').matchAll(/^\s*- id: (B\d+)/gm)].map((m) => m[1]);

const { values: args } = parseArgs({
  options: {
    bugs: { type: 'string' },
    random: { type: 'string' },
    seed: { type: 'string' },
    model: { type: 'string', default: 'claude-sonnet-5-5' },
    prompt: { type: 'string', default: 'v1' },
    runs: { type: 'string', default: '1' },
    'max-turns': { type: 'string', default: '200' },
    'timeout-min': { type: 'string', default: '20' },
    'max-cost': { type: 'string', default: '3' },
  },
});

// Deterministic shuffle (mulberry32) so a seed always gives the same subset.
function pick(k: number, seed: number) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ids = [...ALL_BUGS];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, k).sort();
}

function chooseBugs(run: number): { bugs: string[]; seed: number | null } {
  if (args.random !== undefined) {
    const seed = (args.seed !== undefined ? Number(args.seed) : Math.floor(Math.random() * 2 ** 31)) + run;
    return { bugs: pick(Number(args.random), seed), seed };
  }
  const raw = (args.bugs ?? '').trim();
  const bugs = raw === '' || raw === 'none' ? [] : raw.split(',').map((s) => s.trim().toUpperCase());
  for (const b of bugs) if (!ALL_BUGS.includes(b)) throw new Error(`unknown bug ${b}`);
  return { bugs: bugs.sort(), seed: null };
}

const freePort = () =>
  new Promise<number>((ok, ko) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => ok(port));
    }).on('error', ko);
  });

async function startShop(bugs: string[]): Promise<{ url: string; proc: ChildProcess }> {
  const port = await freePort();
  // ALLOW_RESET is deliberately not set: the test-only reset endpoint stays off.
  const proc = spawn(process.execPath, [join(ROOT, 'app/server.js')], {
    env: { PATH: process.env.PATH ?? '', PORT: String(port), BUGS: bugs.join(',') },
    stdio: 'ignore',
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error('shop exited at startup');
    try {
      if ((await fetch(`${url}/api/me`)).ok) return { url, proc };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('shop did not start');
}

const STOP: Record<string, string> = {
  success: 'completed',
  error_max_turns: 'max_turns',
  error_max_budget_usd: 'max_cost',
  error_during_execution: 'error',
  error_max_structured_output_retries: 'error',
};

async function runOnce(run: number) {
  const { bugs, seed } = chooseBugs(run);
  const promptFile = join(ROOT, 'prompts', `${args.prompt}.md`);
  const limits = { maxTurns: Number(args['max-turns']), timeoutMin: Number(args['timeout-min']), maxCostUsd: Number(args['max-cost']) };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runId = `${stamp}_${args.model}_${args.prompt}_${bugs.join('-') || 'baseline'}`;
  const dir = join(ROOT, 'runs', runId);
  mkdirSync(dir, { recursive: true });
  const reportsFile = join(dir, 'reports.json');
  writeFileSync(reportsFile, '[]\n');

  // The agent's cwd is an empty temp dir: nothing of this repo is reachable from it.
  const work = mkdtempSync(join(tmpdir(), 'explorer-'));
  const { url, proc } = await startShop(bugs);
  const missionPrompt = readFileSync(promptFile, 'utf8').replaceAll('{{URL}}', url);
  console.log(`[${runId}] shop at ${url}, bugs: ${bugs.join(',') || 'none'}`);

  const abort = new AbortController();
  let timedOut = false;
  let q: ReturnType<typeof query> | undefined;
  // On timeout, interrupt first so the SDK still emits a result with cost and usage; abort if it hangs.
  const timer = setTimeout(() => {
    timedOut = true;
    q?.interrupt().catch(() => abort.abort());
    setTimeout(() => abort.abort(), 60_000).unref();
  }, limits.timeoutMin * 60_000);
  const started = Date.now();
  let result: SDKResultMessage | undefined;
  let init: { tools: string[]; mcp_servers: unknown; plugins: unknown; skills: unknown; model: string } | undefined;
  let lastAssistantTurns = 0;
  let error: string | undefined;

  try {
    q = query({
      prompt: 'Comece a exploração agora.',
      options: {
        model: args.model,
        systemPrompt: missionPrompt,
        cwd: work,
        abortController: abort,
        // No built-in tools at all (no Read, Bash, WebFetch, WebSearch, Task...): only the two MCP servers below.
        tools: [],
        allowedTools: ['mcp__playwright', 'mcp__qa'],
        // Playwright MCP tools that reach outside the browser page.
        disallowedTools: ['mcp__playwright__browser_run_code_unsafe', 'mcp__playwright__browser_file_upload'],
        permissionMode: 'dontAsk',
        settingSources: [], // no user/project settings, CLAUDE.md, hooks or user plugins
        skills: [],
        strictMcpConfig: true,
        mcpServersDelivery: 'initialize',
        mcpServers: {
          playwright: {
            command: process.execPath,
            args: [
              join(dirname(require.resolve('@playwright/mcp/package.json')), 'cli.js'),
              '--headless',
              '--isolated',
              '--executable-path', chromium.executablePath(),
              '--allowed-origins', url,
              '--output-dir', work,
              '--image-responses', 'omit',
            ],
            alwaysLoad: true,
          },
          qa: { command: process.execPath, args: [join(ROOT, 'qa-report/server.mts')], env: { QA_REPORT_FILE: reportsFile }, alwaysLoad: true },
        },
        maxTurns: limits.maxTurns,
        maxBudgetUsd: limits.maxCostUsd,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'ai-exploratory-tester/1.0' },
      },
    });
    for await (const msg of q) {
      appendFileSync(join(dir, 'transcript.jsonl'), JSON.stringify(msg) + '\n');
      if (msg.type === 'system' && msg.subtype === 'init') {
        init = { tools: msg.tools, mcp_servers: msg.mcp_servers, plugins: msg.plugins, skills: msg.skills, model: msg.model };
        const stray = msg.tools.filter((t) => !t.startsWith('mcp__playwright__') && !t.startsWith('mcp__qa__'));
        if (stray.length) throw new Error(`agent has tools beyond the two MCP servers: ${stray.join(', ')}`);
      }
      if (msg.type === 'assistant') lastAssistantTurns++;
      if (msg.type === 'result') result = msg;
    }
  } catch (e) {
    if (!timedOut) error = String((e as Error)?.message ?? e);
  } finally {
    clearTimeout(timer);
    proc.kill();
    rmSync(work, { recursive: true, force: true });
  }

  const reports = JSON.parse(readFileSync(reportsFile, 'utf8'));
  const meta = {
    runId,
    model: args.model,
    promptVersion: args.prompt,
    promptFile: `prompts/${args.prompt}.md`,
    enabledBugs: bugs,
    seed,
    limits,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    stopReason: timedOut ? 'timeout' : error ? 'error' : result ? STOP[result.subtype] ?? result.subtype : 'error',
    error: error ?? (result && 'errors' in result && result.errors.length ? result.errors : undefined),
    reportsFiled: reports.length,
    // From the SDK result message. Missing when the run was cut by the timeout before a result arrived.
    turns: result?.num_turns ?? null,
    assistantMessages: lastAssistantTurns,
    totalCostUsd: result?.total_cost_usd ?? null,
    usage: result?.usage ?? null,
    modelUsage: result?.modelUsage ?? null,
    sdkDurationMs: result?.duration_ms ?? null,
    resultSubtype: result?.subtype ?? null,
    terminalReason: result?.terminal_reason ?? null,
    permissionDenials: result?.permission_denials ?? [],
    agentTools: init?.tools ?? null,
    agentMcpServers: init?.mcp_servers ?? null,
    agentPlugins: init?.plugins ?? null,
    agentSkills: init?.skills ?? null,
    versions: { claudeAgentSdk: DEPS['@anthropic-ai/claude-agent-sdk'], playwrightMcp: DEPS['@playwright/mcp'] }, // pinned exact in package.json
  };
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`[${runId}] ${meta.stopReason}: ${reports.length} reports, ${meta.turns ?? '?'} turns, $${meta.totalCostUsd?.toFixed(2) ?? '?'}, ${(meta.durationMs / 60000).toFixed(1)} min`);
  console.log(`runs/${runId}`);
  return meta;
}

for (let i = 0; i < Number(args.runs); i++) await runOnce(i);
