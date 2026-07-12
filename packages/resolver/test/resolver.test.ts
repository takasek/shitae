import { describe, it, expect } from 'vitest';
import { resolve, resolveProject, effectiveResults, mergeInteractions } from '../src/index.js';
import { parse } from '../../parser/src/index.js';

describe('resolve', () => {
  it('componentIndex: 全 component が登録される', () => {
    const { document } = parse('# ホーム\nロゴ\n# ログイン\nID入力\n');
    const result = resolve(document);
    expect(result.componentIndex.size).toBe(2);
    expect(result.componentIndex.has('ホーム')).toBe(true);
    expect(result.componentIndex.has('ログイン')).toBe(true);
  });

  it('variantIndex: variant が登録される', () => {
    const { document } = parse('# マッチング\n## 検索中\n案内\n## 失敗\n案内\n');
    const result = resolve(document);
    const vars = result.variantIndex.get('マッチング');
    expect(vars?.has('検索中')).toBe(true);
    expect(vars?.has('失敗')).toBe(true);
  });

  it('elementIndex: alias 付き要素が登録される', () => {
    const { document } = parse('# 対戦\nme: プロフィールカード\nopponent: プロフィールカード\n');
    const result = resolve(document);
    const elems = result.elementIndex.get('対戦');
    expect(elems?.has('me')).toBe(true);
    expect(elems?.has('opponent')).toBe(true);
  });

  it('alias なし要素は elementIndex に登録されない', () => {
    const { document } = parse('# A\nロゴ\n名前\n');
    const result = resolve(document);
    const elems = result.elementIndex.get('A');
    expect(elems?.size).toBe(0);
  });

  it('重複 component は最初のものが使われる', () => {
    const { document } = parse('# A\nfoo\n# A\nbar\n');
    const result = resolve(document);
    expect(result.componentIndex.size).toBe(1);
    // 最初の A の common.elements[0].value.name が 'foo'
    const comp = result.componentIndex.get('A')!;
    const firstEl = comp.common.elements[0];
    expect(firstEl.value).toMatchObject({ kind: 'ref', name: 'foo' });
  });

  it('variant の alias も elementIndex に登録される', () => {
    const { document } = parse('# A\n## 姿1\ncontent: 本体\n');
    const result = resolve(document);
    const elems = result.elementIndex.get('A');
    expect(elems?.has('content')).toBe(true);
  });

  it('common と variant で同名 alias は common が優先', () => {
    const { document } = parse('# A\nfoo: 共通\n## 姿1\nfoo: 固有\n');
    const result = resolve(document);
    const elems = result.elementIndex.get('A');
    // common の foo が優先（!elemMap.has(el.alias) チェックにより）
    expect(elems?.get('foo')?.value).toMatchObject({ kind: 'ref', name: '共通' });
  });
});

describe('bodyElementIndex', () => {
  it('common の alias は null キーで引ける', () => {
    const { document } = parse('# A\nfoo: 共通\n');
    const result = resolve(document);
    const commonMap = result.bodyElementIndex.get('A')?.get(null);
    expect(commonMap?.get('foo')?.value).toMatchObject({ kind: 'ref', name: '共通' });
  });

  it('variant の alias は variant name キーで引ける', () => {
    const { document } = parse('# A\n## 姿1\ncontent: 本体\n');
    const result = resolve(document);
    const varMap = result.bodyElementIndex.get('A')?.get('姿1');
    expect(varMap?.get('content')?.value).toMatchObject({ kind: 'ref', name: '本体' });
  });

  it('common と variant で同名 alias でもそれぞれ独立して引ける', () => {
    const { document } = parse('# A\nfoo: 共通\n## 姿1\nfoo: 固有\n');
    const result = resolve(document);
    const commonFoo = result.bodyElementIndex.get('A')?.get(null)?.get('foo');
    const varFoo = result.bodyElementIndex.get('A')?.get('姿1')?.get('foo');
    expect(commonFoo?.value).toMatchObject({ kind: 'ref', name: '共通' });
    expect(varFoo?.value).toMatchObject({ kind: 'ref', name: '固有' });
  });
});

describe('resolveProject', () => {
  it('単一 document → modules に 1 エントリ', () => {
    const { document } = parse('# ホーム\nロゴ\n');
    const result = resolveProject(new Map([['main', document]]));
    expect(result.modules.size).toBe(1);
    expect(result.modules.get('main')?.componentIndex.has('ホーム')).toBe(true);
  });

  it('2 document で getByAlias がインポート先 ResolveResult を返す', () => {
    const { document: main } = parse('import auth as auth\n# ホーム\n---\nタップ -> push(auth::ログイン)\n');
    const { document: auth } = parse('# ログイン\nID入力\n');
    const result = resolveProject(new Map([['main', main], ['auth', auth]]));
    const authResult = result.getByAlias('main', 'auth');
    expect(authResult).toBeDefined();
    expect(authResult?.componentIndex.has('ログイン')).toBe(true);
  });

  it('未知の alias → undefined', () => {
    const { document } = parse('# A\nロゴ\n');
    const result = resolveProject(new Map([['main', document]]));
    expect(result.getByAlias('main', 'nonexistent')).toBeUndefined();
  });

  it('alias 宣言あり・ターゲット module が未ロード → undefined', () => {
    const { document } = parse('import missing as m\n# A\nロゴ\n');
    const result = resolveProject(new Map([['main', document]]));
    expect(result.getByAlias('main', 'm')).toBeUndefined();
  });

  it('未知の importing module → undefined', () => {
    const { document } = parse('# A\nロゴ\n');
    const result = resolveProject(new Map([['main', document]]));
    expect(result.getByAlias('unknown_module', 'auth')).toBeUndefined();
  });
});

describe('effectiveResults', () => {
  it('no labels at all → all results have null effective label', () => {
    const { document } = parse('# A\n> タップ -> back() ; goto(B)');
    const interaction = document.components[0].common.interactions[0];
    const effective = effectiveResults(interaction);
    expect(effective).toHaveLength(2);
    expect(effective[0].label).toBeNull();
    expect(effective[1].label).toBeNull();
  });

  it('first label partway through → leading results stay null, rest inherit', () => {
    const { document } = parse('# A\n> タップ ->\n> back() ; [成功] goto(B)');
    const interaction = document.components[0].common.interactions[0];
    const effective = effectiveResults(interaction);
    expect(effective).toHaveLength(2);
    expect(effective[0].label).toBeNull();
    expect(effective[0].result.label).toBeNull();
    expect(effective[1].label).toBe('成功');
    expect(effective[1].result.label).toBe('成功');
  });

  it('one label applies across multiple results', () => {
    const { document } = parse('# A\n> タップ -> [成功] goto(A) ; back() ; exit()');
    const interaction = document.components[0].common.interactions[0];
    const effective = effectiveResults(interaction);
    expect(effective).toHaveLength(3);
    expect(effective[0].label).toBe('成功');
    expect(effective[1].label).toBe('成功');
    expect(effective[2].label).toBe('成功');
  });

  it('multiple labels switch partway through', () => {
    const { document } = parse('# X\n> タップ(X) ->\n> [成功] A ; goto(B)\n> [失敗] C');
    const interaction = document.components[0].common.interactions[0];
    const effective = effectiveResults(interaction);
    expect(effective).toHaveLength(3);
    expect(effective[0].label).toBe('成功');
    expect(effective[0].result.label).toBe('成功');
    expect(effective[1].label).toBe('成功');
    expect(effective[1].result.label).toBeNull();
    expect(effective[2].label).toBe('失敗');
    expect(effective[2].result.label).toBe('失敗');
  });

  it('preserves original Result objects (not copied)', () => {
    const { document } = parse('# A\n> タップ -> [成功] goto(B) ; back()');
    const interaction = document.components[0].common.interactions[0];
    const effective = effectiveResults(interaction);
    expect(effective[0].result).toBe(interaction.results[0]);
    expect(effective[1].result).toBe(interaction.results[1]);
  });
});

describe('mergeInteractions', () => {
  it('shadow: identical action.text and target → common dropped, specific used', () => {
    const { document: commonDoc } = parse('# A\n> タップ(X) -> goto(B)');
    const { document: specDoc } = parse('# A\n> タップ(X) -> goto(C)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(1);
    expect(merged[0].results[0].body).toMatchObject({ word: 'goto' });
    expect((merged[0].results[0].body as any).target.name).toBe('C');
  });

  it('shadow: null target on both sides → still shadows', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()');
    const { document: specDoc } = parse('# A\n> タップ -> goto(B)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(1);
    expect(merged[0].results[0].body).toMatchObject({ word: 'goto' });
  });

  it('different action.text → NOT shadowed, both remain', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()');
    const { document: specDoc } = parse('# A\n> 長押し -> goto(B)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(2);
    expect(merged[0].action.text).toBe('タップ');
    expect(merged[1].action.text).toBe('長押し');
  });

  it('different target → NOT shadowed, both remain', () => {
    const { document: commonDoc } = parse('# A\nX\n> タップ(X) -> back()');
    const { document: specDoc } = parse('# A\nY\n> タップ(Y) -> goto(B)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(2);
  });

  it('whitespace folding: 行動文字列の連続空白は畳んで比較 → shadow される', () => {
    const { document: commonDoc } = parse('# A\nX\n> ダブル タップ(X) -> back()');
    const { document: specDoc } = parse('# A\nX\n> ダブル  タップ(X) -> goto(B)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(1);
    expect(merged[0].results[0].body).toMatchObject({ word: 'goto' });
  });

  it('existsGated differs but reference otherwise equal → still shadows', () => {
    const { document: commonDoc } = parse('# A\nX\n> タップ(X) -> back()');
    const { document: specDoc } = parse('# A\nX\n> タップ(X?) -> goto(B)');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(1);
    expect(merged[0].results[0].body).toMatchObject({ word: 'goto' });
  });

  it('common-only interactions with no matching specific → all pass through', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()\n> 長押し -> goto(B)');
    const { document: specDoc } = parse('# A\n> スワイプ -> exit()');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(3);
  });

  it('specific-only interactions with no matching common → all pass through', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()');
    const { document: specDoc } = parse('# A\n> 長押し -> goto(B)\n> スワイプ -> exit()');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(3);
  });

  it('order: survived common first, then all specific', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()\n> 長押し -> goto(B)');
    const { document: specDoc } = parse('# A\n> タップ -> exit()');
    const common = commonDoc.components[0].common.interactions;
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, specific);
    expect(merged).toHaveLength(2);
    expect(merged[0].action.text).toBe('長押し');
    expect(merged[1].action.text).toBe('タップ');
  });

  it('both common and specific empty → empty result', () => {
    const merged = mergeInteractions([], []);
    expect(merged).toHaveLength(0);
  });

  it('specific empty → all common preserved', () => {
    const { document: commonDoc } = parse('# A\n> タップ -> back()');
    const common = commonDoc.components[0].common.interactions;
    const merged = mergeInteractions(common, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].action.text).toBe('タップ');
  });

  it('common empty → all specific preserved', () => {
    const { document: specDoc } = parse('# A\n> タップ -> back()');
    const specific = specDoc.components[0].common.interactions;
    const merged = mergeInteractions([], specific);
    expect(merged).toHaveLength(1);
    expect(merged[0].action.text).toBe('タップ');
  });
});
