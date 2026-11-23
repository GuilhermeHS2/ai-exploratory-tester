import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, agreement, toCsv, parseCsv } from './metrics.mts';

test('metrics: recall, precision, duplicates and false positives', () => {
  const m = computeMetrics(['B01', 'B04', 'B07', 'B08'], [
    { reportId: 'R01', bugId: 'B01' },
    { reportId: 'R02', bugId: 'B04' },
    { reportId: 'R03', bugId: 'B04' }, // duplicate
    { reportId: 'R04', bugId: 'none' }, // false positive
    { reportId: 'R05', bugId: 'none' },
  ]);
  assert.deepEqual(m.found, ['B01', 'B04']);
  assert.deepEqual(m.missed, ['B07', 'B08']);
  assert.equal(m.recall, 0.5);
  assert.equal(m.precision, 3 / 5);
  assert.equal(m.duplicates, 1);
  assert.equal(m.falsePositives, 2);
});

test('metrics: baseline run has no recall, every report is a false positive', () => {
  const m = computeMetrics([], [{ reportId: 'R01', bugId: 'none' }]);
  assert.equal(m.recall, null);
  assert.equal(m.precision, 0);
  assert.equal(m.falsePositives, 1);
});

test('metrics: no reports gives zero recall and undefined precision', () => {
  const m = computeMetrics(['B01'], []);
  assert.equal(m.recall, 0);
  assert.equal(m.precision, null);
});

test('metrics: a match to a bug that is not enabled is an error', () => {
  assert.throws(() => computeMetrics(['B01'], [{ reportId: 'R01', bugId: 'B02' }]), /not enabled/);
});

test('agreement: only rows Guilherme labeled count', () => {
  assert.equal(agreement([{ judge: 'B01', human: '', labeledBy: '' }]), null);
  assert.equal(agreement([{ judge: 'none', human: 'unplanted-real', labeledBy: 'orchestrator' }]), null);
  assert.deepEqual(agreement([
    { judge: 'B01', human: 'b01', labeledBy: 'Guilherme' },
    { judge: 'none', human: 'B04', labeledBy: 'Guilherme' },
    { judge: 'none', human: 'unplanted-real', labeledBy: 'guilherme' }, // counts as agreeing with 'none'
    { judge: 'B04', human: ' ', labeledBy: 'Guilherme' },
    { judge: 'B04', human: 'none', labeledBy: 'orchestrator' },
  ]), { audited: 3, agree: 2, rate: 2 / 3 });
});

test('csv: round trip with commas, quotes and newlines', () => {
  const rows = [['a', 'b,c', 'say "hi"'], ['line\nbreak', '', 'x']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});
