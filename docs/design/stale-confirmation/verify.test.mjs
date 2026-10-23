import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
function verifyMutation(model, mutate) {
  const root = mkdtempSync(join(tmpdir(), 'shitae-verify-'));
  try {
    const dir = join(root, 'docs', 'design', 'stale-confirmation');
    mkdirSync(dir, { recursive: true });
    symlinkSync(fileURLToPath(new URL('../../../packages', import.meta.url)), join(root, 'packages'), 'dir');
    for (const file of ['verify.mjs', 'unsafe.shitae', 'guarded.shitae', 'maintained.shitae']) {
      copyFileSync(join(here, file), join(dir, file));
    }
    const target = join(dir, model + '.shitae');
    const original = readFileSync(target, 'utf8');
    const mutated = original.split('\n').map(line => line.startsWith('> DiscardA(') ? mutate(line) : line).join('\n');
    assert.notEqual(mutated, original, 'mutation must change a cancellation result');
    writeFileSync(target, mutated);
    const result = spawnSync(process.execPath, [join(dir, 'verify.mjs')], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, 'verifier must reject the wrong post-cancellation state');
    assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('normal verification matches the recorded nine cases', () => {
  const result = spawnSync(process.execPath, [join(here, 'verify.mjs')], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(readFileSync(join(here, 'results.json'), 'utf8')));
});

test('rejects an incorrect RowA after the unsafe StartB cancellation', () => {
  verifyMutation('unsafe', line => line.replace('set(RowA##None)', 'set(RowA##Desk)'));
});

for (const model of ['unsafe', 'guarded', 'maintained']) {
  test('rejects a confirmation left visible by ' + model, () => {
    verifyMutation(model, line => line.replace(' ; hide(ConfirmA)', ''));
  });
}

