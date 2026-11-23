// MCP server (stdio) the agent uses to file structured bug reports.
// Reports go to the JSON file in QA_REPORT_FILE (runs/<runId>/reports.json).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const FILE = process.env.QA_REPORT_FILE;
if (!FILE) {
  console.error('QA_REPORT_FILE is not set');
  process.exit(1);
}

type Report = { id: string; filedAt: string; title: string; flow: string; steps: string[]; expected: string; actual: string; severity: string; evidence: string };
const load = (): Report[] => (existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []);

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const str = (max: number) => z.string().trim().min(1).max(max);

const server = new McpServer({ name: 'qa-report', version: '1.0.0' });

server.registerTool(
  'report_bug',
  {
    description:
      'File one bug you reproduced in the app. One call per distinct bug; call list_reported first to avoid duplicates.',
    inputSchema: {
      title: str(200).describe('Short summary of the bug'),
      flow: z.enum(['register', 'login', 'search', 'cart', 'checkout', 'profile', 'order', 'other']).describe('Flow where it happens'),
      steps: z.array(str(500)).min(1).max(30).describe('Numbered steps to reproduce, from a fresh browser'),
      expected: str(1000).describe('What should happen'),
      actual: str(1000).describe('What happens instead'),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      evidence: str(2000).describe('What you observed: exact messages, values, URLs'),
    },
  },
  async (input) => {
    const reports = load();
    const id = `R${String(reports.length + 1).padStart(2, '0')}`;
    reports.push({ id, filedAt: new Date().toISOString(), ...input });
    writeFileSync(FILE, JSON.stringify(reports, null, 2) + '\n');
    return text(`Filed ${id}: ${input.title}`);
  },
);

server.registerTool(
  'list_reported',
  { description: 'List the bugs already filed in this session (id, flow, title).' },
  async () => {
    const reports = load();
    return text(reports.length ? reports.map((r) => `${r.id} [${r.flow}] ${r.title}`).join('\n') : 'No bugs filed yet.');
  },
);

await server.connect(new StdioServerTransport());
