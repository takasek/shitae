import { describe, it, expect } from 'vitest';
import { check } from '../src/index.js';
import { resolve } from '../../resolver/src/index.js';
import { parse } from '../../parser/src/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('check', () => {
  it('クリーンなファイルで警告なし', () => {
    const { document } = parse('# ホーム\nロゴ\n> タップ -> push(設定)\n# 設定\n項目\n');
    const diags = check(document, resolve(document));
    expect(diags).toHaveLength(0);
  });

  it('W101: 同一 body 内で alias 重複', () => {
    const { document } = parse('# A\nfoo: X\nfoo: Y\n');
    const diags = check(document, resolve(document));
    const w101 = diags.filter(d => d.code === 'W101');
    expect(w101.length).toBeGreaterThan(0);
    expect(w101[0].message).toContain('foo');
  });

  it('W101: 別 body（common vs variant）では重複にならない', () => {
    // common に foo、variant に foo → 別 body なので W101 なし
    const { document } = parse('# A\nfoo: X\n## 姿1\nfoo: Y\n');
    const diags = check(document, resolve(document));
    const w101 = diags.filter(d => d.code === 'W101');
    expect(w101).toHaveLength(0);
  });

  it('W102: variant 名を component として参照', () => {
    // '検索中' は component でなく マッチング の variant
    const src = '# A\n> 行動 -> goto(検索中)\n# マッチング\n## 検索中\n案内\n## 失敗\n案内\n';
    const { document } = parse(src);
    const diags = check(document, resolve(document));
    const w102 = diags.filter(d => d.code === 'W102');
    expect(w102.length).toBeGreaterThan(0);
    expect(w102[0].message).toContain('検索中');
    expect(w102[0].message).toContain('##検索中');
  });

  it('W102: component として存在するなら警告なし', () => {
    // '検索中' が component として定義されている
    const src = '# A\n> 行動 -> goto(検索中)\n# 検索中\n結果\n';
    const { document } = parse(src);
    const diags = check(document, resolve(document));
    const w102 = diags.filter(d => d.code === 'W102');
    expect(w102).toHaveLength(0);
  });

  it('W103: 要素もインタラクションも持たない component', () => {
    const { document } = parse('# A\n# B\nロゴ\n');
    const diags = check(document, resolve(document));
    const w103 = diags.filter(d => d.code === 'W103');
    expect(w103).toHaveLength(1);
    expect(w103[0].message).toContain("'A'");
  });

  it('W103: variant を持つがすべて空 → 警告', () => {
    const { document } = parse('# A\n## 姿1\n## 姿2\n');
    const diags = check(document, resolve(document));
    const w103 = diags.filter(d => d.code === 'W103');
    expect(w103).toHaveLength(1);
  });

  it('W102: cross-module 参照（module::Name）は誤検知しない', () => {
    // 'other::検索中' は別モジュールのコンポーネント参照なので W102 を出さない
    // （ローカルに '検索中' という variant があっても）
    const src = '# A\n> 行動 -> goto(other::検索中)\n# マッチング\n## 検索中\n案内\n## 失敗\n案内\n';
    const { document } = parse(src);
    const diags = check(document, resolve(document));
    const w102 = diags.filter(d => d.code === 'W102');
    expect(w102).toHaveLength(0);
  });

  it('両サンプルで severity=error なし', () => {
    const root = join(import.meta.dirname, '../../..');
    for (const f of ['docs/examples/battle.shitae', 'docs/examples/ecommerce.shitae']) {
      const src = readFileSync(join(root, f), 'utf8');
      const { document } = parse(src);
      const diags = check(document, resolve(document));
      expect(diags.filter(d => d.severity === 'error')).toHaveLength(0);
    }
  });
});
