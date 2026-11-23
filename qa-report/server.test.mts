import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const bug = {
  title: 'Total errado no carrinho',
  flow: 'cart',
  steps: ['Abrir /', 'Adicionar Mouse', 'Abrir /carrinho'],
  expected: 'Total com frete',
  actual: 'Total sem frete',
  severity: 'high',
  evidence: 'Total R$ 89,90',
};
const textOf = (r: any) => r.content.map((c: any) => c.text).join('');

test('qa-report: files, lists and validates reports', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'qa-report-')), 'reports.json');
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [new URL('./server.mts', import.meta.url).pathname], env: { ...process.env, QA_REPORT_FILE: file } as Record<string, string> }),
  );
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['list_reported', 'report_bug']);

    assert.match(textOf(await client.callTool({ name: 'list_reported', arguments: {} })), /No bugs filed/);
    assert.match(textOf(await client.callTool({ name: 'report_bug', arguments: bug })), /Filed R01/);
    assert.match(textOf(await client.callTool({ name: 'report_bug', arguments: { ...bug, title: 'Outro' } })), /Filed R02/);
    assert.match(textOf(await client.callTool({ name: 'list_reported', arguments: {} })), /R01 \[cart\] Total errado[\s\S]*R02/);

    const bad = await client.callTool({ name: 'report_bug', arguments: { ...bug, severity: 'urgent', steps: [] } });
    assert.equal(bad.isError, true);

    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.length, 2);
    assert.deepEqual(saved[0].steps, bug.steps);
    assert.equal(saved[0].id, 'R01');
  } finally {
    await client.close();
  }
  assert.ok(existsSync(file));
});
