const test = require('node:test');
const assert = require('node:assert');
const { parseBugs, applyFlags } = require('./flags');

const src = ['a', '//#if B01', 'bug', '//#else', 'ok', '//#endif', '<!--#if B02-->', 'html-bug', '<!--#endif-->', 'z'].join('\n');

test('no bugs keeps the correct branch', () => {
  assert.strictEqual(applyFlags(src, parseBugs('')), 'a\nok\nz');
});

test('enabled bug swaps the branch and markers never leak', () => {
  const out = applyFlags(src, parseBugs(' b01 , B02'));
  assert.strictEqual(out, 'a\nbug\nhtml-bug\nz');
  assert.ok(!out.includes('#if'));
});

test('nested blocks need every flag on', () => {
  const nested = ['//#if B01', '//#if B02', 'both', '//#endif', '//#endif'].join('\n');
  assert.strictEqual(applyFlags(nested, parseBugs('B02')), '');
  assert.strictEqual(applyFlags(nested, parseBugs('B01,B02')), 'both');
});

test('unbalanced markers throw', () => {
  assert.throws(() => applyFlags('//#if B01\nx', parseBugs('')));
  assert.throws(() => applyFlags('//#endif', parseBugs('')));
});
