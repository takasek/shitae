import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '../../../..');
const mutants = [
  ['ghost-as-retained', 'provenance.ts', "retained.get(point.id) ? 'ghost' : 'retained'", "retained.get(point.id) ? 'retained' : 'retained'"],
  ['discarded-as-ghost', 'provenance.ts', ": 'discarded';", ": 'ghost';"],
  ['observation-ordinal-collapsed', 'index.ts', 'ordinal: result ? result.observationIds.indexOf(o.id) : observation', 'ordinal: 0'],
];
const evidence = [];
for (const [name, file, from, to] of mutants) {
  const path = resolve(root, 'packages/session/src', file), original = readFileSync(path, 'utf8');
  assert.equal(original.split(from).length, 2, 'Mutation must match exactly once');
  try {
    writeFileSync(path, original.replace(from, to));
    const run = spawnSync('pnpm', ['--filter', '@shitae/session', 'exec', 'vitest', 'run', 'test/provenance.test.ts'], { cwd: root, encoding: 'utf8' });
    assert.equal(run.error, undefined);
    const assertionFailure = (run.stdout + run.stderr).includes('AssertionError');
    evidence.push({ name, status: run.status, assertionFailure });
    assert.notEqual(run.status, 0, `Surviving mutation: ${name}`);
    assert(assertionFailure, 'A failed import/syntax check is not a killed behavioral mutation');
  } finally { writeFileSync(path, original); }
}
const baseline = spawnSync('pnpm', ['--filter', '@shitae/session', 'exec', 'vitest', 'run', 'test/provenance.test.ts'], { cwd: root, encoding: 'utf8' });
assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
writeFileSync(resolve(import.meta.dirname, 'counterexamples.json'), JSON.stringify({ mutants: evidence, restoredBaseline: '4 passed' }, null, 2) + '\n');
console.log(JSON.stringify({ mutants: evidence, restoredBaseline: '4 passed' }));
