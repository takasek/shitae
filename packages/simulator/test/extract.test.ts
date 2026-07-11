import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { extractSimData } from '../src/extract.js';

function parseOk(src: string) {
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse error: ${errors[0]!.message}`);
  return document;
}

describe('extractSimData', () => {
  it('single component no variant', () => {
    const doc = parseOk('# ホーム\nロゴ\n> タップ(ロゴ) -> push(設定)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryModule).toBe('main');
    expect(data.entryComponent).toBe('ホーム');
    const comp = data.modules['main']!.components['ホーム']!;
    expect(comp.commonElements).toContain('ロゴ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.commonInteractions[0]!.actionText).toContain('タップ');
    expect(comp.variants).toEqual({});
  });

  it('component with variants', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n> タップ(コンテンツ) -> push(次)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['詳細']!;
    expect(Object.keys(comp.variants)).toEqual(['読込中', '表示']);
    expect(comp.variants['読込中']!.elements).toContain('スピナー');
    expect(comp.variants['表示']!.elements).toContain('コンテンツ');
    expect(comp.variants['表示']!.interactions).toHaveLength(1);
  });

  it('common elements appear in commonElements', () => {
    const doc = parseOk('# プロフィール\nヘッダ\n> タップ(ヘッダ) -> back()\n## 未フォロー\nフォローボタン\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['プロフィール']!;
    expect(comp.commonElements).toContain('ヘッダ');
    expect(comp.commonInteractions).toHaveLength(1);
    expect(comp.variants['未フォロー']!.elements).toContain('フォローボタン');
  });

  it('interaction with multiple labeled results → 1 ラベル 1 choice', () => {
    const doc = parseOk('# 保存\n保存\n> タップ(保存) -> [成功] goto(完了) ; [失敗] エラー表示\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['保存']!;
    const interaction = comp.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(0);
    expect(interaction.choices).toHaveLength(2);
    expect(interaction.choices[0]!.label).toBe('成功');
    expect(interaction.choices[0]!.results[0]!.type).toBe('transition');
    expect(interaction.choices[1]!.label).toBe('失敗');
    expect(interaction.choices[1]!.results[0]!.type).toBe('effect');
  });

  it('transition result contains word and target', () => {
    const doc = parseOk('# A\n> タップ -> push(B)\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const body = data.modules['main']!.components['A']!.commonInteractions[0]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition') {
      expect(body.word).toBe('push');
      expect(body.target?.kind).toBe('full');
      if (body.target?.kind === 'full') {
        expect(body.target.component).toBe('B');
      }
    }
  });

  it('ラベル継承: 無ラベル result は直前のラベルを引き継ぎ同じ choice にまとまる', () => {
    const doc = parseOk(
      '# A\nX\n> タップ(X) ->\n> [成功] 保存する ; goto(B)\n> [失敗] エラーを表示する\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(0);
    expect(interaction.choices).toHaveLength(2);
    expect(interaction.choices[0]!.label).toBe('成功');
    expect(interaction.choices[0]!.results).toHaveLength(2);
    expect(interaction.choices[0]!.results[0]!.type).toBe('effect');
    expect(interaction.choices[0]!.results[1]!.type).toBe('transition');
    expect(interaction.choices[1]!.label).toBe('失敗');
    expect(interaction.choices[1]!.results).toHaveLength(1);
  });

  it('ラベル継承: 最初のラベルより前の result は prelude（常に成立）', () => {
    const doc = parseOk('# A\nX\n> タップ(X) -> ログを送る ; [成功] goto(B) ; [失敗] エラー\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(1);
    expect(interaction.prelude[0]!.type).toBe('effect');
    expect(interaction.choices).toHaveLength(2);
  });

  it('ラベルなしの複数 result はすべて prelude（分岐ではなく順に全部起こる）', () => {
    const doc = parseOk('# A\nX\n> タップ(X) -> 保存する ; back()\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const interaction = data.modules['main']!.components['A']!.commonInteractions[0]!;
    expect(interaction.prelude).toHaveLength(2);
    expect(interaction.choices).toHaveLength(0);
  });

  it('shadow 合成: 各姿の interactions は共通と姿固有の mergeInteractions 結果', () => {
    const doc = parseOk(
      '# プロフィール\n戻る\n> タップ(戻る) -> back()\n> 長押し -> メニューを出す\n## 特殊\n> タップ(戻る) -> goto(別画面)\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const comp = data.modules['main']!.components['プロフィール']!;
    const merged = comp.variants['特殊']!.interactions;
    // 共通の タップ(戻る) は姿固有に shadow され、残るのは 長押し（共通）+ タップ(戻る)（姿固有）
    expect(merged).toHaveLength(2);
    expect(merged[0]!.actionText).toBe('長押し');
    expect(merged[1]!.actionText).toBe('タップ(戻る)');
    const body = merged[1]!.prelude[0]!;
    expect(body.type).toBe('transition');
    if (body.type === 'transition') expect(body.word).toBe('goto');
  });

  it('shadow 合成: (行動, 対象) が一致しなければ共通も姿固有も両方残る', () => {
    const doc = parseOk(
      '# A\nX\n> タップ(X) -> back()\n## 姿1\n> 長押し(X) -> goto(B)\n',
    );
    const data = extractSimData(new Map([['main', doc]]), 'main');
    const merged = data.modules['main']!.components['A']!.variants['姿1']!.interactions;
    expect(merged).toHaveLength(2);
  });

  it('初期姿: initialVariant は最初に定義された姿', () => {
    const doc = parseOk('# 詳細\n## 読込中\nスピナー\n## 表示\nコンテンツ\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['詳細']!.initialVariant).toBe('読込中');
  });

  it('初期姿: 姿を持たない component の initialVariant は null', () => {
    const doc = parseOk('# ホーム\nロゴ\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.modules['main']!.components['ホーム']!.initialVariant).toBeNull();
  });

  it('entryComponent is first component', () => {
    const doc = parseOk('# ログイン\nID入力\n\n# ホーム\nフィード\n');
    const data = extractSimData(new Map([['main', doc]]), 'main');
    expect(data.entryComponent).toBe('ログイン');
  });
});
