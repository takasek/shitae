// Confirms check-axes.mjs is not vacuous: each known way of merging the two axes back, or tying the notice/gate to the conflict, must fail the expected combination.
// Usage: node check-mutants.mjs  (writes mutants.json next to this file)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const here = import.meta.dirname;
const source = readFileSync(resolve(here, 'model/proposed.shitae'), 'utf8');
const mutants = [
  ['valid-input-clears-conflict', '> ValidInput -> set(SyntaxStatus##Valid);', '> ValidInput -> set(SyntaxStatus##Valid); set(DiskStatus##InSync);', ['C1', 'C5']],
  ['resolve-also-fixes-syntax', 'dismiss(); hide(RecoveryNotice); set(DiskStatus##InSync)\n> ReplaceReviewedDisk', 'dismiss(); hide(RecoveryNotice); set(DiskStatus##InSync); set(SyntaxStatus##Valid)\n> ReplaceReviewedDisk', ['C4']],
  ['review-resolves-conflict', '> Review -> hide(RecoveryNotice);', '> Review -> hide(RecoveryNotice); set(DiskStatus##InSync);', ['C2', 'C3-SaveCopy', 'C3-ReplaceReviewedDisk', 'C3-UseDiskVersion', 'C3-DiskChangedAgain', 'C4']],
  ['keep-editing-drops-notice', '> KeepEditing -> dismiss(); show(RecoveryNotice)', '> KeepEditing -> dismiss()', ['C2']],
  ['node-gate-ignores-diagram', '> NodeDoubleClick(DiagramView.graph?)', '> NodeDoubleClick(DiagramView.graph)', ['C5']],
];
const evidence = [];
const dir = mkdtempSync(join(tmpdir(), 'state-axes-mutant-'));
try {
  for (const [name, from, to, expectedFailures] of mutants) {
    assert.equal(source.split(from).length, 2, `Mutation must match exactly once: ${name}`);
    const model = join(dir, 'proposed.shitae');
    writeFileSync(model, source.replace(from, to));
    const out = join(dir, 'result.json');
    const run = spawnSync(process.execPath, [resolve(here, 'check-axes.mjs'), model, 'split', '--out', out], { encoding: 'utf8' });
    assert.notEqual(run.status, 0, `Surviving mutation: ${name}\n${run.stdout}${run.stderr}`);
    const failed = JSON.parse(readFileSync(out, 'utf8')).failedCombos;
    for (const combo of expectedFailures) assert(failed.includes(combo), `${name} should fail ${combo}, failed ${failed}`);
    evidence.push({ name, failedCombos: failed });
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
const baseline = spawnSync(process.execPath, [resolve(here, 'check-axes.mjs'), resolve(here, 'model/proposed.shitae'), 'split'], { encoding: 'utf8' });
assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
writeFileSync(resolve(here, 'mutants.json'), JSON.stringify({ mutants: evidence, baseline: 'all combinations pass' }, null, 2) + '\n');
console.log(JSON.stringify(evidence));
