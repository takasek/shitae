import { describe, it, expect } from 'vitest';
import { check } from '../src/index.js';
import { resolve, resolveProject } from '../../resolver/src/index.js';
import { parse } from '../../parser/src/index.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Document } from '../../ast/src/index.js';

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

  it('全サンプルで severity=error なし', () => {
    const root = join(import.meta.dirname, '../../..');
    for (const f of ['docs/examples/battle.shitae', 'docs/examples/ecommerce.shitae', 'docs/examples/music.shitae', 'docs/examples/delivery.shitae', 'docs/examples/langlearn.shitae']) {
      const src = readFileSync(join(root, f), 'utf8');
      const { document } = parse(src);
      const diags = check(document, resolve(document));
      expect(diags.filter(d => d.severity === 'error')).toHaveLength(0);
    }
  });
});

describe('r3: W105 / E028 / E030', () => {
  it('W105: goto(##X) の X が未定義 variant', () => {
    const { document } = parse('# A\n## 一\n> 行動 -> goto(##存在しない)\n## 二\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(1);
  });

  it('W105: goto(##X) の X が定義済み variant なら警告なし', () => {
    const { document } = parse('# A\n## 一\n> 行動 -> goto(##二)\n## 二\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(0);
  });

  it('W105: set(X##v) の v が X に未定義', () => {
    const { document } = parse('#! 学習\n## 通常\nボタン\n# B\n> 行動 -> set(学習##無い姿)\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(1);
  });

  it('W105: set(X##v) の v が定義済みなら警告なし', () => {
    const { document } = parse('#! 学習\n## 通常\nボタン\n## ハート切れ\n表示\n# B\n> 行動 -> set(学習##ハート切れ)\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(0);
  });

  it('E028: singleton の宣言側 collection（*バッジ 要素行）', () => {
    const { document } = parse('#! バッジ\n## 未読\nマーク\n# 一覧\n*バッジ\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E028')).toHaveLength(1);
  });

  it('E028: singleton の参照側 collection（行動対象 *バッジ）', () => {
    const { document } = parse('#! バッジ\n## 未読\nマーク\n# 一覧\nバッジ\n> 全部見る(*バッジ) -> 一括既読\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E028')).toHaveLength(1);
  });

  it('E028: 非 singleton の collection は従来どおり許容', () => {
    const { document } = parse('# 一覧\n*サムネイル\n> タップ(サムネイル) -> push(詳細)\n# 詳細\n本文\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E028')).toHaveLength(0);
  });

  it('E030: set の対象が定義済み非 singleton', () => {
    const { document } = parse('# 学習\n## 通常\nボタン\n# B\n> 行動 -> set(学習##通常)\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E030')).toHaveLength(1);
  });

  it('E030: set の対象が singleton ならエラーなし', () => {
    const { document } = parse('#! 学習\n## 通常\nボタン\n# B\n> 行動 -> set(学習##通常)\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E030')).toHaveLength(0);
  });

  it('E030: set の対象が未定義 component なら素通り（ラフさ優先）', () => {
    const { document } = parse('# B\nボタン\n> 行動 -> set(謎##通常)\n');
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'E030')).toHaveLength(0);
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(0);
  });
});

describe('r4 A5: set(X)（##variant なし）の W105 二重出力を解消', () => {
  it('set(X) — X が singleton でも W105 は重ねて出さない（parser の E029 のみ）', () => {
    const src = '#! 学習\n## 通常\nボタン\n# B\n> 行動 -> set(学習)\n';
    const { document, diagnostics: parseDiags } = parse(src);
    const checkDiags = check(document, resolve(document));
    const all = [...parseDiags, ...checkDiags];
    expect(all.filter(d => d.code === 'E029')).toHaveLength(1);
    expect(all.filter(d => d.code === 'W105')).toHaveLength(0);
  });

  it('set(X) — X が非 singleton でも W105 は重ねて出さない（E030 も対象外。parser の E029 のみ）', () => {
    const src = '# 学習\n## 通常\nボタン\n# B\n> 行動 -> set(学習)\n';
    const { document, diagnostics: parseDiags } = parse(src);
    const checkDiags = check(document, resolve(document));
    const all = [...parseDiags, ...checkDiags];
    expect(all.filter(d => d.code === 'E029')).toHaveLength(1);
    expect(all.filter(d => d.code === 'W105')).toHaveLength(0);
    expect(all.filter(d => d.code === 'E030')).toHaveLength(0);
  });
});

describe('r4 A2+B2: プロジェクト単位の検査（module 修飾つき参照の cross-module check）', () => {
  function twoModuleProject(entrySrc: string, modSrc: string) {
    const entry = parse(entrySrc).document;
    const mod = parse(modSrc).document;
    const documents = new Map<string, Document>([
      ['entry', entry],
      ['mod', mod],
    ]);
    const project = resolveProject(documents);
    return { entry, project };
  }

  it('E030: 別モジュールの非 singleton component への set(mod::X##v)', () => {
    const { entry, project } = twoModuleProject(
      'import mod as mod\n# ホーム\n> a -> set(mod::通常##x)\n',
      '# 通常\n## x\n要素\n'
    );
    const diags = check(entry, resolve(entry), { project });
    expect(diags.filter(d => d.code === 'E030')).toHaveLength(1);
  });

  it('W105: 別モジュールの singleton への set(mod::X##v) — 未定義 variant', () => {
    const { entry, project } = twoModuleProject(
      'import mod as mod\n# ホーム\n> a -> set(mod::クーポン##ない)\n',
      '#! クーポン\n## 未受取\n受取ボタン\n## 受取済\n'
    );
    const diags = check(entry, resolve(entry), { project });
    expect(diags.filter(d => d.code === 'W105')).toHaveLength(1);
  });

  it('E028: 別モジュールの singleton への collection 参照 *mod::X', () => {
    const { entry, project } = twoModuleProject(
      'import mod as mod\n# 一覧\nバッジ\n> 全部見る(*mod::バッジ) -> 一括既読\n',
      '#! バッジ\n## 未読\nマーク\n'
    );
    const diags = check(entry, resolve(entry), { project });
    expect(diags.filter(d => d.code === 'E028')).toHaveLength(1);
  });

  it('projectCtx なしなら従来どおり cross-module skip（後方互換）', () => {
    const { entry } = twoModuleProject(
      'import mod as mod\n# ホーム\n> a -> set(mod::通常##x)\n',
      '# 通常\n## x\n要素\n'
    );
    const diags = check(entry, resolve(entry));
    expect(diags.filter(d => d.code === 'E030')).toHaveLength(0);
  });
});

describe('r4 B4: W106 — singleton への show(X##v)（明示 variant）', () => {
  it('singleton への show(X##v) は W106', () => {
    const { document } = parse(
      '#! クーポン\n## 未受取\n受取ボタン\n## 受取済\n\n# A\n> a -> show(クーポン##未受取)\n'
    );
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W106')).toHaveLength(1);
  });

  it('singleton への show(X)（省略形）は W106 が出ない', () => {
    const { document } = parse(
      '#! クーポン\n## 未受取\n受取ボタン\n## 受取済\n\n# A\n> a -> show(クーポン)\n'
    );
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W106')).toHaveLength(0);
  });

  it('非 singleton への show(X##v) は W106 が出ない', () => {
    const { document } = parse(
      '# 通常\n## a\n要素\n## b\n要素\n\n# A\n> a -> show(通常##a)\n'
    );
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W106')).toHaveLength(0);
  });

  it('set(X##v) には W106 が出ない', () => {
    const { document } = parse(
      '#! クーポン\n## 未受取\n受取ボタン\n## 受取済\n\n# A\n> a -> set(クーポン##未受取)\n'
    );
    const diags = check(document, resolve(document));
    expect(diags.filter(d => d.code === 'W106')).toHaveLength(0);
  });
});
