import { describe, it, expect } from 'vitest';
import { parse } from '../src/index.js';
import { TRANSITION_WORDS } from '@shitae/ast';
import type {
  Document,
  Component,
  Variant,
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
// 1. Component / Variant / Section
// ---------------------------------------------------------------------------
describe('component / variant / section', () => {
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

  it('variant 付き component が正しく解析される', () => {
    const { document } = parseDoc('# A\n## B\n要素');
    const c = getComponent(document, 'A');
    expect(c.variants).toHaveLength(1);
    expect(c.variants[0].name).toBe('B');
    expect(c.variants[0].body.elements).toHaveLength(1);
  });

  it('common body に要素行とインタラクション行が混在できる', () => {
    const { document } = parseDoc('# A\n要素\n> タップ -> back()');
    const c = getComponent(document, 'A');
    expect(c.common.interactions).toHaveLength(1);
    expect(c.common.elements).toHaveLength(1);
  });

  it('> 行がなければ interactions は空', () => {
    const { document } = parseDoc('# A\n要素');
    const c = getComponent(document, 'A');
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

  it('common 部分と variant 固有部分が分かれる', () => {
    const { document } = parseDoc('# A\n共通要素\n## B\n固有要素');
    const c = getComponent(document, 'A');
    expect(c.common.elements[0].value.kind).toBe('ref');
    expect((c.common.elements[0].value as Ref).name).toBe('共通要素');
    expect(c.variants[0].body.elements[0].value.kind).toBe('ref');
    expect((c.variants[0].body.elements[0].value as Ref).name).toBe('固有要素');
  });

  it('variant body に要素行とインタラクション行が混在できる', () => {
    const { document } = parseDoc('# A\n## B\n要素\n> タップ -> back()');
    const c = getComponent(document, 'A');
    expect(c.variants[0].body.interactions).toHaveLength(1);
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
    const { document } = parseDoc('# A\n> タップ -> back()');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(1);
    expect(interactions[0].action.text).toBe('タップ');
    expect(interactions[0].action.target).toBeNull();
  });

  it('action に target (Reference)', () => {
    const { document } = parseDoc('# A\n> タップ(設定) -> back()');
    const action = document.components[0].common.interactions[0].action;
    expect(action.text).toBe('タップ');
    expect(action.target).not.toBeNull();
    expect(action.target!.name).toBe('設定');
  });

  it('action テキスト内のネスト () では外側の () が Reference として解釈される', () => {
    // "foo(bar(Target))" → 外側 () が reference → text="foo", target.name="bar(Target)"
    // バグ: 現状 findLastOpenParen が内側 ( を返し text="foo(bar" になる
    const { document } = parseDoc('# A\n> foo(bar(Target)) -> back()');
    const action = document.components[0].common.interactions[0].action;
    expect(action.text).toBe('foo');
    expect(action.target).not.toBeNull();
    expect(action.target!.name).toBe('bar(Target)');
  });

  it('parseReference: 末尾ドットで member が空になる場合 null を返す', () => {
    // "Screen." → member は null (空文字ではない)
    const { document } = parseDoc('# A\n> 行動(Screen.) -> back()');
    const action = document.components[0].common.interactions[0].action;
    expect(action.target).not.toBeNull();
    expect(action.target!.name).toBe('Screen');
    expect(action.target!.member).toBeNull();
  });

  it('Effect result', () => {
    const { document } = parseDoc('# A\n> 更新 -> リストが更新される');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(1);
    expect(results[0].body.kind).toBe('effect');
    expect((results[0].body as Effect).text).toBe('リストが更新される');
    expect(results[0].label).toBeNull();
  });

  it('条件ラベル付き result', () => {
    const { document } = parseDoc('# A\n> 行動 -> [成功] 完了する');
    const result = document.components[0].common.interactions[0].results[0];
    expect(result.label).toBe('成功');
    expect(result.body.kind).toBe('effect');
  });

  it('; で複数の result', () => {
    const { document } = parseDoc('# A\n> タップ(保存) -> [成功] goto(詳細) ; [失敗] エラーを表示する');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('成功');
    expect(results[0].body.kind).toBe('transition');
    expect(results[1].label).toBe('失敗');
    expect(results[1].body.kind).toBe('effect');
  });

  it('result の継続行（> 行で並ぶ）', () => {
    const { document } = parseDoc('# A\n> 行動 -> [成功] goto(A)\n> [失敗] back()');
    const results = document.components[0].common.interactions[0].results;
    expect(results).toHaveLength(2);
    expect(results[0].label).toBe('成功');
    expect(results[1].label).toBe('失敗');
  });

  it('複数の interaction', () => {
    const { document } = parseDoc('# A\n> タップ -> back()\n> 長押し -> goto(B)');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(2);
  });

  it('空行を挟んでも継続行は同じ body 内の直前 interaction に積まれる', () => {
    const { document } = parseDoc('# A\n> タップ -> [成功] back()\n> [失敗] goto(B)\n\n> 長押し -> goto(C)');
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(2);
    expect(interactions[0].results).toHaveLength(2);
    expect(interactions[1].action.text).toBe('長押し');
  });

  it('新しい interaction: > タップ(X) -> push(Y)', () => {
    const { document } = parseDoc('# X\n> タップ(X) -> push(Y)');
    const interaction = document.components[0].common.interactions[0];
    expect(interaction.action.text).toBe('タップ');
    expect(interaction.action.target!.name).toBe('X');
    const t = interaction.results[0].body as Transition;
    expect(t.kind).toBe('transition');
    expect(t.word).toBe('push');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('Y');
  });

  it('継続行が複数行にわたって 1 つの interaction の results に積まれる', () => {
    const { document } = parseDoc(
      '# X\n> タップ(X) ->\n> [成功] A ; goto(B)\n> [失敗] C'
    );
    const interactions = document.components[0].common.interactions;
    expect(interactions).toHaveLength(1);
    const results = interactions[0].results;
    expect(results).toHaveLength(3);
    expect(results[0].label).toBe('成功');
    expect((results[0].body as Effect).text).toBe('A');
    expect(results[1].label).toBeNull();
    expect((results[1].body as Transition).word).toBe('goto');
    expect(results[2].label).toBe('失敗');
    expect((results[2].body as Effect).text).toBe('C');
  });

  it('要素行とインタラクション行が混在しても両方正しく積まれる', () => {
    const { document } = parseDoc(
      '# A\n要素1\n> タップ -> back()\n要素2\n> 長押し -> goto(B)'
    );
    const c = document.components[0];
    expect(c.common.elements).toHaveLength(2);
    expect((c.common.elements[0].value as Ref).name).toBe('要素1');
    expect((c.common.elements[1].value as Ref).name).toBe('要素2');
    expect(c.common.interactions).toHaveLength(2);
    expect(c.common.interactions[0].action.text).toBe('タップ');
    expect(c.common.interactions[1].action.text).toBe('長押し');
  });

  it('> の後の空白・インデント量は結果に影響しない', () => {
    const a = parseDoc('# A\n>タップ->back()').document;
    const b = parseDoc('# A\n>      タップ   ->   back()').document;
    expect(a.components[0].common.interactions[0].action.text).toBe('タップ');
    expect(a.components[0].common.interactions[0].action.text).toBe(
      b.components[0].common.interactions[0].action.text
    );
    expect((a.components[0].common.interactions[0].results[0].body as Transition).word).toBe(
      (b.components[0].common.interactions[0].results[0].body as Transition).word
    );
  });

  it('単独行の --- は "---" という名の要素行として読まれる', () => {
    const { document, diagnostics } = parseDoc('# A\n---\n要素');
    const c = document.components[0];
    expect(c.common.elements).toHaveLength(2);
    expect((c.common.elements[0].value as Ref).name).toBe('---');
    expect((c.common.elements[1].value as Ref).name).toBe('要素');
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Transition (遷移語)
// ---------------------------------------------------------------------------
describe('transition', () => {
  it('back() — target null, session null', () => {
    const { document } = parseDoc('# A\n> タップ -> back()');
    const result = document.components[0].common.interactions[0].results[0];
    const t = result.body as Transition;
    expect(t.kind).toBe('transition');
    expect(t.word).toBe('back');
    expect(t.target).toBeNull();
    expect(t.session).toBeNull();
  });

  it('back(X) — target non-null', () => {
    const { document } = parseDoc('# A\n> タップ -> back(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('back');
    expect(t.target).not.toBeNull();
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('ホーム');
  });

  it('push(X) — target, session null', () => {
    const { document } = parseDoc('# A\n> タップ -> push(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('push');
    expect(t.target).not.toBeNull();
    expect(t.session).toBeNull();
  });

  it('push(X, @S) — target and session', () => {
    const { document } = parseDoc('# A\n> タップ -> push(ホーム, @login)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('push');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('ホーム');
    expect(t.session).not.toBeNull();
    expect(t.session!.name).toBe('login');
  });

  it('goto(X) — target, session null', () => {
    const { document } = parseDoc('# A\n> タップ -> goto(B)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('goto');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('B');
    expect(t.session).toBeNull();
  });

  it('exit(@S) — target null, session non-null', () => {
    const { document } = parseDoc('# A\n> タップ -> exit(@settings)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('exit');
    expect(t.target).toBeNull();
    expect(t.session!.name).toBe('settings');
  });

  it('present(X) — target, session null', () => {
    const { document } = parseDoc('# A\n> タップ -> present(設定)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('present');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('設定');
    expect(t.session).toBeNull();
  });

  it('present(X, @S)', () => {
    const { document } = parseDoc('# A\n> タップ(設定) -> present(設定, @settings)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('present');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('設定');
    expect(t.session!.name).toBe('settings');
  });

  it('dismiss() — target null, session null', () => {
    const { document } = parseDoc('# A\n> タップ -> dismiss()');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.word).toBe('dismiss');
    expect(t.target).toBeNull();
    expect(t.session).toBeNull();
  });

  it('dismiss(@S) — target null, session non-null', () => {
    const { document } = parseDoc('# A\n> タップ -> dismiss(@share)');
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
    const { document } = parseDoc('# A\n> タップ -> push(ホーム)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.module).toBeNull();
    expect(target.name).toBe('ホーム');
    expect(target.variant).toBeNull();
  });

  it('component##variant', () => {
    const { document } = parseDoc('# A\n> タップ -> goto(対戦##開始)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.name).toBe('対戦');
    expect(target.variant).toBe('開始');
  });

  it('##variant — same-component variant', () => {
    const { document } = parseDoc('# A\n> タップ -> goto(##失敗)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'variant' };
    expect(target.kind).toBe('variant');
    expect(target.name).toBe('失敗');
  });

  it('module::component', () => {
    const { document } = parseDoc('# A\n> タップ -> push(auth::ログイン)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.kind).toBe('component');
    expect(target.module).toBe('auth');
    expect(target.name).toBe('ログイン');
    expect(target.variant).toBeNull();
  });

  it('module::component##variant', () => {
    const { document } = parseDoc('# A\n> タップ -> push(auth::ログイン##入力)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.module).toBe('auth');
    expect(target.name).toBe('ログイン');
    expect(target.variant).toBe('入力');
  });
});

// ---------------------------------------------------------------------------
// 6. Reference（action の target）
// ---------------------------------------------------------------------------
describe('reference', () => {
  it('シンプルな name', () => {
    const { document } = parseDoc('# A\n> タップ(設定) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBeNull();
    expect(ref.name).toBe('設定');
    expect(ref.member).toBeNull();
    expect(ref.existsGated).toBe(false);
  });

  it('name.member', () => {
    const { document } = parseDoc('# A\n> タップ(フィード.サムネイル) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('フィード');
    expect(ref.member).toBe('サムネイル');
  });

  it('name? — existsGated', () => {
    const { document } = parseDoc('# A\n> タップ(button?) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('button');
    expect(ref.existsGated).toBe(true);
  });

  it('module::name', () => {
    const { document } = parseDoc('# A\n> タップ(auth::Login) -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBe('auth');
    expect(ref.name).toBe('Login');
    expect(ref.member).toBeNull();
  });

  it('module::name.member', () => {
    const { document } = parseDoc('# A\n> タップ(auth::Login.form) -> back()');
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
    const { diagnostics } = parseDoc('# A\n> 行動 -> 結果\n> -> 別結果');
    const e001 = diagnostics.filter((d) => d.code === 'E001');
    expect(e001.length).toBeGreaterThan(0);
    expect(e001[0].severity).toBe('error');
  });

  it('E002: exit() の引数が空', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> exit()');
    const e002 = diagnostics.filter((d) => d.code === 'E002');
    expect(e002.length).toBeGreaterThan(0);
    expect(e002[0].severity).toBe('error');
  });

  it('E003: 空 result-list', () => {
    const { diagnostics } = parseDoc('# A\n> 行動 ->');
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

  it('E006: 重複 variant — 両方 AST に残る', () => {
    const { document, diagnostics } = parseDoc('# A\n## B\n要素\n## B\n別要素');
    const e006 = diagnostics.filter((d) => d.code === 'E006');
    expect(e006.length).toBeGreaterThan(0);
    const c = document.components[0];
    expect(c.variants.filter((v) => v.name === 'B')).toHaveLength(2);
  });

  it('E011: 要素行に -> を含めると構文エラー（ヒント付き）', () => {
    const { diagnostics } = parseDoc('# A\nタップ -> back()');
    const e011 = diagnostics.filter((d) => d.code === 'E011');
    expect(e011.length).toBeGreaterThan(0);
    expect(e011[0].severity).toBe('error');
    expect(e011[0].message).toContain('>');
  });

  it('E011: コメント内の -> はエラーにならない（コメントは事前に除去される）', () => {
    const { diagnostics } = parseDoc('# A\n要素 // 矢印 -> はコメント内');
    const e011 = diagnostics.filter((d) => d.code === 'E011');
    expect(e011).toHaveLength(0);
  });

  it('E011: quoted name 内の -> はエラーにならない', () => {
    const { diagnostics } = parseDoc('# A\n"矢印 -> 矢印"');
    const e011 = diagnostics.filter((d) => d.code === 'E011');
    expect(e011).toHaveLength(0);
  });

  it('E010: 先行する interaction がない継続行はエラー', () => {
    const { diagnostics } = parseDoc('# A\n> [失敗] エラー表示');
    const e010 = diagnostics.filter((d) => d.code === 'E010');
    expect(e010.length).toBeGreaterThan(0);
    expect(e010[0].severity).toBe('error');
  });

  it('E010: 姿（##）をまたぐ継続行はエラー', () => {
    const { diagnostics } = parseDoc(
      '# A\n## B\n> タップ -> back()\n## C\n> [失敗] goto(B)'
    );
    const e010 = diagnostics.filter((d) => d.code === 'E010');
    expect(e010.length).toBeGreaterThan(0);
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

  it('E007: component の前に variant を書くとエラー', () => {
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

// ---------------------------------------------------------------------------
// 10. Span 精度 (offset / col)
// ---------------------------------------------------------------------------
describe('Span 精度 (offset / col)', () => {
  it('component header: 1行目 offset=0 col=1 length=5', () => {
    const { document } = parseDoc('# Foo\n');
    expect(document.components[0].span).toEqual({ offset: 0, length: 5, line: 1, col: 1 });
  });

  it('variant header: 2行目 offset=6 col=1 length=6', () => {
    const { document } = parseDoc('# Foo\n## Bar\n');
    expect(document.components[0].variants[0].span).toEqual({ offset: 6, length: 6, line: 2, col: 1 });
  });

  it('element line: 2行目 offset=6 col=1 length=6', () => {
    const { document } = parseDoc('# Foo\nButton\n');
    expect(document.components[0].common.elements[0].span).toEqual({ offset: 6, length: 6, line: 2, col: 1 });
  });

  it('インデント付き element: col は先頭非空白文字の 1-based 列', () => {
    // '# Foo\n  Button\n': line2 starts at offset 6, '  Button' → firstNonSpace=2 → col=3, offset=8, length=6
    const { document } = parseDoc('# Foo\n  Button\n');
    expect(document.components[0].common.elements[0].span).toEqual({ offset: 8, length: 6, line: 2, col: 3 });
  });

  it('interaction line span', () => {
    // '# Foo\n> click -> push(Bar)\n': '# Foo\n'=6chars, line2 starts at offset 6
    const { document } = parseDoc('# Foo\n> click -> push(Bar)\n');
    expect(document.components[0].common.interactions[0].span).toEqual({ offset: 6, length: 20, line: 2, col: 1 });
  });

  it('3行目 component: offset は累積行長', () => {
    // '# A\n# B\n# C\n': line1=4, line2=4, line3 starts at 8
    const { document } = parseDoc('# A\n# B\n# C\n');
    expect(document.components[2].span).toEqual({ offset: 8, length: 3, line: 3, col: 1 });
  });
});
