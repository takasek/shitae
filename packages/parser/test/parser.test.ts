import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';
import { TRANSITION_WORDS } from '@shitae/ast';
import type {
  Document,
  Component,
  Variation,
  Body,
  ElementLine,
  Ref,
  Inline,
  Interaction,
  Action,
  Reference,
  Result,
  Transition,
  Effect,
  NavTarget,
  Session,
} from '@shitae/ast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseDoc(source: string): { document: Document; diagnostics: ReturnType<typeof parse>['diagnostics'] } {
  return parse(source);
}

function getComponent(doc: Document, name: string): Component {
  const c = doc.components.find((c) => c.name === name);
  if (!c) throw new Error(`Component '${name}' not found`);
  return c;
}

// ---------------------------------------------------------------------------
// 1. Component / Variation / Section
// ---------------------------------------------------------------------------
describe('component / variation / section', () => {
  it('単一 component の名前が正しい', () => {
    const { document } = parseDoc('# ホーム\nロゴ');
    expect(document.components).toHaveLength(1);
    expect(document.components[0].name).toBe('ホーム');
  });

  it('component の common body に element が入る', () => {
    const { document } = parseDoc('# ホーム\nロゴ');
    const c = document.components[0];
    expect(c.common.elements).toHaveLength(1);
    expect(c.common.elements[0].value.kind).toBe('ref');
    expect((c.common.elements[0].value as Ref).name).toBe('ロゴ');
  });

  it('variation 付き component が正しく解析される', () => {
    const { document } = parseDoc('# A\n## B\n要素');
    const c = getComponent(document, 'A');
    expect(c.variations).toHaveLength(1);
    expect(c.variations[0].name).toBe('B');
    expect(c.variations[0].body.elements).toHaveLength(1);
  });

  it('interaction 節がある common body', () => {
    const { document } = parseDoc('# A\n要素\n---\nタップ -> back()');
    const c = getComponent(document, 'A');
    expect(c.common.hasInteractionSection).toBe(true);
    expect(c.common.interactions).toHaveLength(1);
    expect(c.common.elements).toHaveLength(1);
  });

  it('--- がなければ hasInteractionSection = false', () => {
    const { document } = parseDoc('# A\n要素');
    const c = getComponent(document, 'A');
    expect(c.common.hasInteractionSection).toBe(false);
    expect(c.common.interactions).toHaveLength(0);
  });

  it('複数の component が順に並ぶ', () => {
    const { document } = parseDoc('# A\n要素\n# B\n別要素');
    expect(document.components).toHaveLength(2);
    expect(document.components[0].name).toBe('A');
    expect(document.components[1].name).toBe('B');
  });

  it('import が document.imports に入る', () => {
    const { document } = parseDoc('import auth as auth\n# A\n要素');
    expect(document.imports).toHaveLength(1);
    expect(document.imports[0].module).toBe('auth');
    expect(document.imports[0].alias).toBe('auth');
  });

  it('common 部分と variation 固有部分が分かれる', () => {
    const { document } = parseDoc('# A\n共通要素\n## B\n固有要素');
    const c = getComponent(document, 'A');
    expect(c.common.elements[0].value.kind).toBe('ref');
    expect((c.common.elements[0].value as Ref).name).toBe('共通要素');
    expect(c.variations[0].body.elements[0].value.kind).toBe('ref');
    expect((c.variations[0].body.elements[0].value as Ref).name).toBe('固有要素');
  });

  it('variation の interaction 節', () => {
    const { document } = parseDoc('# A\n## B\n要素\n---\nタップ -> back()');
    const c = getComponent(document, 'A');
    expect(c.variations[0].body.hasInteractionSection).toBe(true);
    expect(c.variations[0].body.interactions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. element-line
// ---------------------------------------------------------------------------
describe('element-line', () => {
  it('シンプルな ref', () => {
    const { document } = parseDoc('# A\nロゴ');
    const el = document.components[0].common.elements[0];
    expect(el.collection).toBe(false);
    expect(el.alias).toBeNull();
    expect(el.value.kind).toBe('ref');
    expect((el.value as Ref).name).toBe('ロゴ');
  });

  it('* で collection = true', () => {
    const { document } = parseDoc('# A\n*サムネイル');
    const el = document.components[0].common.elements[0];
    expect(el.collection).toBe(true);
    expect(el.alias).toBeNull();
    expect((el.value as Ref).name).toBe('サムネイル');
  });

  it('alias: Ref', () => {
    const { document } = parseDoc('# A\nalias: Ref');
    const el = document.components[0].common.elements[0];
    expect(el.collection).toBe(false);
    expect(el.alias).toBe('alias');
    expect((el.value as Ref).name).toBe('Ref');
  });

  it('* alias: Ref', () => {
    const { document } = parseDoc('# A\n*手札: カード');
    const el = document.components[0].common.elements[0];
    expect(el.collection).toBe(true);
    expect(el.alias).toBe('手札');
    expect((el.value as Ref).name).toBe('カード');
  });

  it('inline の解析', () => {
    const { document } = parseDoc('# A\nフィード: { *サムネイル }');
    const el = document.components[0].common.elements[0];
    expect(el.alias).toBe('フィード');
    expect(el.value.kind).toBe('inline');
    const inline = el.value as Inline;
    expect(inline.elements).toHaveLength(1);
    expect(inline.elements[0].collection).toBe(true);
    expect((inline.elements[0].value as Ref).name).toBe('サムネイル');
  });

  it('inline が複数行から連結される（セミコロン区切り）', () => {
    const { document } = parseDoc('# A\nフィード: {\n  *サムネイル\n}');
    const el = document.components[0].common.elements[0];
    expect(el.value.kind).toBe('inline');
    const inline = el.value as Inline;
    expect(inline.elements).toHaveLength(1);
    expect(inline.elements[0].collection).toBe(true);
  });

  it('複数の element-line', () => {
    const { document } = parseDoc('# A\n要素1\n要素2\n要素3');
    expect(document.components[0].common.elements).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 3. interaction / action / result
// ---------------------------------------------------------------------------
describe('interaction', () => {
  it('シンプルな interaction', () => {
    const { document } = parseDoc('# A\n---\nタップ -> back()');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(1);
    expect(interactions[0].action.text).toBe('タップ');
    expect(interactions[0].action.target).toBeNull();
  });

  it('action に target (Reference)', () => {
    const { document } = parseDoc('# A\n---\nタップ(設定) -> back()');
    const action = document.components[0].common.interactions[0].action;
    expect(action.text).toBe('タップ');
    expect(action.target).not.toBeNull();
    expect(action.target!.name).toBe('設定');
  });

  it('Effect result', () => {
    const { document } = parseDoc('# A\n---\n更新 -> リストが更新される');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].body.kind).toBe('effect');
    expect((results[0].body as Effect).text).toBe('リストが更新される');
    expect(results[0].label).toBeNull();
  });

  it('条件ラベル付き result', () => {
    const { document } = parseDoc('# A\n---\n行動 -> [成功] 完了する');
    const result = document.components[0].common.interactions[0].results[0];
    expect(result.label).toBe('成功');
    expect(result.body.kind).toBe('effect');
  });

  it('; で複数の result', () => {
    const { document } = parseDoc('# A\n---\nタップ(保存) -> [成功] goto(詳細) ; [失敗] エラーを表示する');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('成功');
    expect(results[0].body.kind).toBe('transition');
    expect(results[1].label).toBe('失敗');
    expect(results[1].body.kind).toBe('effect');
  });

  it('result の継続行（改行で並ぶ）', () => {
    const { document } = parseDoc('# A\n---\n行動 -> [成功] goto(A)\n[失敗] back()');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('成功');
    expect(results[1].label).toBe('失敗');
  });

  it('複数の interaction', () => {
    const { document } = parseDoc('# A\n---\nタップ -> back()\n長押し -> goto(B)');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(2);
  });

  it('空行で result-list 終了後、次の interaction が始まる', () => {
    const { document } = parseDoc('# A\n---\nタップ -> [成功] back()\n[失敗] goto(B)\n\n長押し -> goto(C)');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(2);
    expect(interactions[0].results).toHaveLength(2);
    expect(interactions[1].action.text).toBe('長押し');
  });
});

// ---------------------------------------------------------------------------
// 4. Transition (遷移語)
// ---------------------------------------------------------------------------
describe('transition', () => {
  it('back() — target null, session null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> back()');
    const result = document.components[0].common.interactions[0].results[0];
    const t = result.body as Transition;
    expect(t.kind).toBe('transition');
    expect(t.word).toBe('back');
    expect(t.target).toBeNull();
    expect(t.session).toBeNull();
  });

  it('back(X) — target non-null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> back(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('back');
    expect(t.target).not.toBeNull();
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('ホーム');
  });

  it('push(X) — target, session null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> push(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('push');
    expect(t.target).not.toBeNull();
    expect(t.session).toBeNull();
  });

  it('push(X, @S) — target and session', () => {
    const { document } = parseDoc('# A\n---\nタップ -> push(ホーム, @login)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('push');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('ホーム');
    expect(t.session).not.toBeNull();
    expect(t.session!.name).toBe('login');
  });

  it('goto(X) — target, session null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> goto(B)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('goto');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('B');
    expect(t.session).toBeNull();
  });

  it('exit(@S) — target null, session non-null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> exit(@settings)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('exit');
    expect(t.target).toBeNull();
    expect(t.session!.name).toBe('settings');
  });

  it('present(X) — target, session null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> present(設定)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('present');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('設定');
    expect(t.session).toBeNull();
  });

  it('present(X, @S)', () => {
    const { document } = parseDoc('# A\n---\nタップ(設定) -> present(設定, @settings)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('present');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('設定');
    expect(t.session!.name).toBe('settings');
  });

  it('dismiss() — target null, session null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> dismiss()');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('dismiss');
    expect(t.target).toBeNull();
    expect(t.session).toBeNull();
  });

  it('dismiss(@S) — target null, session non-null', () => {
    const { document } = parseDoc('# A\n---\nタップ -> dismiss(@share)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('dismiss');
    expect(t.session!.name).toBe('share');
  });
});

// ---------------------------------------------------------------------------
// 5. NavTarget
// ---------------------------------------------------------------------------
describe('nav-target', () => {
  it('シンプルな component 参照', () => {
    const { document } = parseDoc('# A\n---\nタップ -> push(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.module).toBeNull();
    expect(target.name).toBe('ホーム');
    expect(target.variation).toBeNull();
  });

  it('component##variation', () => {
    const { document } = parseDoc('# A\n---\nタップ -> goto(対戦##開始)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.name).toBe('対戦');
    expect(target.variation).toBe('開始');
  });

  it('##variation — same-component variation', () => {
    const { document } = parseDoc('# A\n---\nタップ -> goto(##失敗)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'variation' };
    expect(target.kind).toBe('variation');
    expect(target.name).toBe('失敗');
  });

  it('module::component', () => {
    const { document } = parseDoc('# A\n---\nタップ -> push(auth::ログイン)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.module).toBe('auth');
    expect(target.name).toBe('ログイン');
    expect(target.variation).toBeNull();
  });

  it('module::component##variation', () => {
    const { document } = parseDoc('# A\n---\nタップ -> push(auth::ログイン##入力)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.module).toBe('auth');
    expect(target.name).toBe('ログイン');
    expect(target.variation).toBe('入力');
  });
});

// ---------------------------------------------------------------------------
// 6. Reference（action の target）
// ---------------------------------------------------------------------------
describe('reference', () => {
  it('シンプルな name', () => {
    const { document } = parseDoc('# A\n---\nタップ(設定) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBeNull();
    expect(ref.name).toBe('設定');
    expect(ref.member).toBeNull();
    expect(ref.existsGated).toBe(false);
  });

  it('name.member', () => {
    const { document } = parseDoc('# A\n---\nタップ(フィード.サムネイル) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('フィード');
    expect(ref.member).toBe('サムネイル');
  });

  it('name? — existsGated', () => {
    const { document } = parseDoc('# A\n---\nタップ(button?) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('button');
    expect(ref.existsGated).toBe(true);
  });

  it('module::name', () => {
    const { document } = parseDoc('# A\n---\nタップ(auth::Login) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBe('auth');
    expect(ref.name).toBe('Login');
    expect(ref.member).toBeNull();
  });

  it('module::name.member', () => {
    const { document } = parseDoc('# A\n---\nタップ(auth::Login.form) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBe('auth');
    expect(ref.name).toBe('Login');
    expect(ref.member).toBe('form');
  });
});

// ---------------------------------------------------------------------------
// 7. 診断（エラー）
// ---------------------------------------------------------------------------
describe('diagnostics', () => {
  it('E001: 二重矢印（継続行に -> がある）', () => {
    const { diagnostics } = parseDoc('# A\n---\n行動 -> 結果\n-> 別結果');
    const e001 = diagnostics.filter((d) => d.code === 'E001');
    expect(e001.length).toBeGreaterThan(0);
    expect(e001[0].severity).toBe('error');
  });

  it('E002: exit() の引数が空', () => {
    const { diagnostics } = parseDoc('# A\n---\nタップ -> exit()');
    const e002 = diagnostics.filter((d) => d.code === 'E002');
    expect(e002.length).toBeGreaterThan(0);
    expect(e002[0].severity).toBe('error');
  });

  it('E003: 空 result-list', () => {
    const { diagnostics } = parseDoc('# A\n---\n行動 ->');
    const e003 = diagnostics.filter((d) => d.code === 'E003');
    expect(e003.length).toBeGreaterThan(0);
    expect(e003[0].severity).toBe('error');
  });

  it('E004: mid-file import', () => {
    const { diagnostics } = parseDoc('# A\n要素\nimport x as y');
    const e004 = diagnostics.filter((d) => d.code === 'E004');
    expect(e004.length).toBeGreaterThan(0);
    expect(e004[0].severity).toBe('error');
  });

  it('E005: 重複 component — 両方 AST に残る', () => {
    const { document, diagnostics } = parseDoc('# A\n要素\n# A\n別要素');
    const e005 = diagnostics.filter((d) => d.code === 'E005');
    expect(e005.length).toBeGreaterThan(0);
    expect(document.components.filter((c) => c.name === 'A')).toHaveLength(2);
  });

  it('E006: 重複 variation — 両方 AST に残る', () => {
    const { document, diagnostics } = parseDoc('# A\n## B\n要素\n## B\n別要素');
    const e006 = diagnostics.filter((d) => d.code === 'E006');
    expect(e006.length).toBeGreaterThan(0);
    const c = document.components[0];
    expect(c.variations.filter((v) => v.name === 'B')).toHaveLength(2);
  });

  it('W001: --- の前の interaction 行', () => {
    const { diagnostics } = parseDoc('# A\nタップ -> back()\n---\n別タップ -> goto(B)');
    const w001 = diagnostics.filter((d) => d.code === 'W001');
    expect(w001.length).toBeGreaterThan(0);
    expect(w001[0].severity).toBe('warning');
  });

  it('W002: stray 継続行（interaction 未開始）', () => {
    const { diagnostics } = parseDoc('# A\n---\n[失敗] エラー表示');
    const w002 = diagnostics.filter((d) => d.code === 'W002');
    expect(w002.length).toBeGreaterThan(0);
    expect(w002[0].severity).toBe('warning');
  });
});

// ---------------------------------------------------------------------------
// 8. コメント除去
// ---------------------------------------------------------------------------
describe('comment stripping', () => {
  it('// コメントは除去される', () => {
    const { document } = parseDoc('# A // comment\nロゴ // another comment');
    expect(document.components[0].name).toBe('A');
    const el = document.components[0].common.elements[0];
    expect((el.value as Ref).name).toBe('ロゴ');
  });
});

// ---------------------------------------------------------------------------
// 9. 実サンプル（smoke test）
// ---------------------------------------------------------------------------
describe('sample files smoke test', () => {
  it('example-battle.shitae — エラーが出ない', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile(
      new URL('../../../docs/example-battle.shitae', import.meta.url),
      'utf-8'
    );
    const { document, diagnostics } = parse(source);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(document.components.length).toBeGreaterThan(0);
  });

  it('example-ecommerce.shitae — エラーが出ない', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile(
      new URL('../../../docs/example-ecommerce.shitae', import.meta.url),
      'utf-8'
    );
    const { document, diagnostics } = parse(source);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(document.components.length).toBeGreaterThan(0);
  });

  it('TRANSITION_WORDS は @shitae/ast からインポートできる', () => {
    expect(TRANSITION_WORDS).toContain('push');
    expect(TRANSITION_WORDS).toContain('back');
    expect(TRANSITION_WORDS).toContain('goto');
    expect(TRANSITION_WORDS).toContain('exit');
    expect(TRANSITION_WORDS).toContain('present');
    expect(TRANSITION_WORDS).toContain('dismiss');
  });

  it('E007: component の前に variation を書くとエラー', () => {
    const { diagnostics } = parse('## Loading\nspinner\n# Screen\nfoo\n');
    const e007 = diagnostics.filter((d) => d.code === 'E007');
    expect(e007.length).toBeGreaterThan(0);
    expect(e007[0].severity).toBe('error');
  });

  it('E008: コンポーネント名が空（bare #）はエラー', () => {
    const { diagnostics } = parse('#\nfoo\n');
    const e008 = diagnostics.filter((d) => d.code === 'E008');
    expect(e008.length).toBeGreaterThan(0);
    expect(e008[0].severity).toBe('error');
  });

  it('E009: 不正な import 構文はエラー診断を出す', () => {
    // "import foo" は "as alias" がないので不正
    const { diagnostics } = parse('import foo\n# A\nbar\n');
    const e009 = diagnostics.filter((d) => d.code === 'E009');
    expect(e009.length).toBeGreaterThan(0);
    expect(e009[0].severity).toBe('error');
  });
});
