// Run only in an otherwise idle checkout. Every source mutation is restored.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../../../..');
const probes = [
  ['unverified-model-claim', 'packages/session/src/scenario.ts', "const modelChecked = code !== 'ENGINE_MISMATCH';", 'const modelChecked = true;', '@shitae/session', 'test/scenario.test.ts'],
  ['lost-complete-identity', 'packages/session/src/scenario.ts', 'modelChecked, expected, actual });', 'modelChecked, expected, actual: {} });', '@shitae/session', 'test/scenario.test.ts'],
  ['mixed-step-counts', 'packages/simulator/src/gui-session.js', "'dispatch ' + s.steps.dispatch", "'dispatch ' + (s.steps.dispatch + s.steps.seek + s.steps.reset + s.steps.setTestVariant)", '@shitae/simulator', 'test/scenario-ui.test.ts'],
];
const results = [];
for (const [name, path, before, after, pkg, test] of probes) {
  const file = resolve(root, path), original = readFileSync(file, 'utf8');
  assert.equal(original.split(before).length, 2, 'Unique mutation anchor: ' + name);
  try {
    writeFileSync(file, original.replace(before, after));
    const result = spawnSync('pnpm', ['--filter', pkg, 'exec', 'vitest', 'run', test], { cwd: root, encoding: 'utf8' });
    const output = result.stdout + result.stderr;
    writeFileSync(resolve(import.meta.dirname, name + '.log'), output.split('\n').map(line => line.trimEnd()).join('\n').trimEnd() + '\n');
    assert.notEqual(result.status, 0, name + ' was not detected');
    assert.match(output, /AssertionError/, name + ' must fail an assertion, not setup');
    results.push({ name, exitCode: result.status, detectedByAssertion: true });
  } finally { writeFileSync(file, original); }
}
writeFileSync(resolve(import.meta.dirname, 'counterexamples.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
