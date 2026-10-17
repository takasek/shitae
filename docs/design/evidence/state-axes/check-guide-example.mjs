// Runs the AI_GUIDE "分ける例" through `shitae check` and the same combined-event expectations as the Sol derived model.
// Also runs the merged single-variant-set version the guide warns against and requires it to fail, so the check is not vacuous.
// Usage: node check-guide-example.mjs  (writes guide-example-check.json next to this file)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const here = import.meta.dirname;
const root = resolve(here, '../../../..');
const guide = readFileSync(resolve(root, 'docs/AI_GUIDE.md'), 'utf8');
const section = guide.split('### 一つの variant 集合にするか、component を分けるか')[1];
assert(section, 'AI_GUIDE section not found');
const block = section.match(/```shitae\n([\s\S]*?)```/);
assert(block, 'shitae block not found in the section');
const example = block[1];

const merged = `# 編集画面
状態: 文書状態
図欄: 図
> 構文エラー -> set(文書状態##不正) ; set(図##エラー)
> 構文が直る -> set(文書状態##妥当) ; set(図##表示)
> 外部で変更される -> set(文書状態##競合) ; show(競合通知)

#! 文書状態
## 妥当
## 不正
エラー一覧
## 競合
外部変更の表示

#! 図
## 表示
グラフ
## エラー
エラー一覧

# 競合通知
> 比較する -> hide(競合通知) ; present(版の比較)

# 版の比較
> 取り消す -> dismiss() ; show(競合通知)
> 別名で保存 -> [成功] 両方の版を残す ; dismiss() ; set(文書状態##妥当)
`;

const dir = mkdtempSync(join(tmpdir(), 'state-axes-guide-'));
const results = {};
try {
  for (const [name, text, profile, shouldPass] of [['guide', example, 'guide', true], ['merged', merged, 'guide-merged', false]]) {
    const model = join(dir, `${name}.shitae`);
    writeFileSync(model, text);
    const check = spawnSync(process.execPath, [resolve(root, 'packages/cli/dist/index.js'), 'check', model], { encoding: 'utf8' });
    assert.equal(check.status, 0, check.stdout + check.stderr);
    const errors = (check.stdout + check.stderr).split('\n').filter((l) => l.includes('[error]'));
    assert.deepEqual(errors, []);
    const out = join(dir, `${name}.json`);
    const run = spawnSync(process.execPath, [resolve(here, 'check-axes.mjs'), model, profile, '--out', out], { encoding: 'utf8' });
    const report = JSON.parse(readFileSync(out, 'utf8'));
    if (shouldPass) assert.equal(run.status, 0, run.stdout + run.stderr);
    else assert(report.failedCombos.includes('C1') && report.failedCombos.includes('C4'), `merged example should fail C1 and C4: ${run.stdout}`);
    results[name] = { checkWarnings: (check.stdout + check.stderr).split('\n').filter((l) => l.includes('[warning]')).length, failedCombos: report.failedCombos, combos: report.report.map((r) => r.combo) };
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
writeFileSync(resolve(here, 'guide-example-check.json'), JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results));
