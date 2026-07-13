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
  Overlay,
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
// 1a2. singleton component（#!）
// ---------------------------------------------------------------------------
describe('singleton component (#!)', () => {
  it('#! で宣言した component は singleton = true', () => {
    const { document, diagnostics } = parseDoc('#! クーポン\n## 未受取\nx\n## 受取済\ny');
    const c = getComponent(document, 'クーポン');
    expect(c.singleton).toBe(true);
    expect(c.variants).toHaveLength(2);
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('通常の # で宣言した component は singleton = false', () => {
    const { document } = parseDoc('# ホーム\nx');
    expect(getComponent(document, 'ホーム').singleton).toBe(false);
  });

  it('#! の名前も quote を剥いだ正準値になる', () => {
    const { document } = parseDoc('#! "再生 速度"\nx');
    expect(document.components[0].name).toBe('再生 速度');
    expect(document.components[0].singleton).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 1b. document common（最初の "#" より前）
// ---------------------------------------------------------------------------
describe('document common', () => {
  it('最初の # より前のインタラクション行が document.common.interactions に入る', () => {
    const { document } = parseDoc('> プッシュ通知をタップ -> push(記事詳細)\n\n# スプラッシュ\nロゴ');
    expect(document.common.interactions).toHaveLength(1);
    expect(document.common.interactions[0].action.text).toBe('プッシュ通知をタップ');
    const t = document.common.interactions[0].results[0].body as Transition;
    expect(t.kind).toBe('transition');
    expect(t.word).toBe('push');
  });

  it('最初の # より前の要素行が document.common.elements に入る', () => {
    const { document } = parseDoc('バナー\n\n# A\n要素');
    expect(document.common.elements).toHaveLength(1);
    expect((document.common.elements[0].value as Ref).name).toBe('バナー');
  });

  it('# が無ければ全行が document.common に入り component は 0（E018 は別途）', () => {
    const { document, diagnostics } = parseDoc('> 通知 -> push(X)');
    expect(document.common.interactions).toHaveLength(1);
    expect(document.components).toHaveLength(0);
    expect(diagnostics.some((d) => d.code === 'E018')).toBe(true);
  });

  it('document common には複数のインタラクション行・要素行を混在できる', () => {
    const { document } = parseDoc(
      '> プッシュ通知をタップ -> push(記事詳細)\n> セッション切れを検知 -> exit(@loggedIn)\n\n# スプラッシュ\nロゴ'
    );
    expect(document.common.interactions).toHaveLength(2);
    expect(document.components).toHaveLength(1);
  });

  it('E010: document common 内の継続行境界規則（先行 interaction が無い継続行はエラー）', () => {
    const { diagnostics } = parseDoc('> [失敗] エラー表示\n\n# A\n要素');
    const e010 = diagnostics.filter((d) => d.code === 'E010');
    expect(e010.length).toBeGreaterThan(0);
  });

  it('E010: document common → 最初の component をまたぐ継続行はエラー', () => {
    const { diagnostics } = parseDoc('> 通知 -> push(X)\n\n# A\n> [失敗] goto(B)');
    const e010 = diagnostics.filter((d) => d.code === 'E010');
    expect(e010.length).toBeGreaterThan(0);
  });

  it('document common が空でも document.common は空の Body として存在する', () => {
    const { document } = parseDoc('# A\n要素');
    expect(document.common.elements).toEqual([]);
    expect(document.common.interactions).toEqual([]);
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

  it('quoted alias は quote を剥いだ名前になる', () => {
    const { document } = parseDoc('# A\n"別名": Ref');
    const el = document.components[0].common.elements[0];
    expect(el.alias).toBe('別名');
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

  it('quoted なセッション名は quote を剥いだ名前になる', () => {
    const { document } = parseDoc('# A\n> タップ -> exit(@"my session")');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.session!.name).toBe('my session');
  });

  it('switch(X, @S) — target と session を両方持つ transition になる', () => {
    const { document, diagnostics } = parseDoc('# A\n> タップ -> switch(検索, @tabSearch)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    expect(t.kind).toBe('transition');
    expect(t.word).toBe('switch');
    expect((t.target as NavTarget & { kind: 'component' }).name).toBe('検索');
    expect(t.session!.name).toBe('tabSearch');
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('switch は TRANSITION_WORDS に含まれる（effect に落ちない）', () => {
    expect(TRANSITION_WORDS).toContain('switch');
  });

  it('E019: switch(X) — session 引数が無いとエラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> switch(検索)');
    const e019 = diagnostics.filter((d) => d.code === 'E019');
    expect(e019.length).toBeGreaterThan(0);
    expect(e019[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// 4b. overlay (show / hide)
// ---------------------------------------------------------------------------
describe('overlay', () => {
  it('show(X) — result body の種類は overlay、verb は show', () => {
    const { document, diagnostics } = parseDoc('# A\n> 曲をタップ -> show(ミニプレイヤー)');
    const body = document.components[0].common.interactions[0].results[0].body;
    expect(body.kind).toBe('overlay');
    const ov = body as Overlay;
    expect(ov.verb).toBe('show');
    expect(ov.target.name).toBe('ミニプレイヤー');
    expect(ov.target.module).toBeNull();
    expect(ov.target.variant).toBeNull();
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('hide(X) — result body の種類は overlay、verb は hide', () => {
    const { document, diagnostics } = parseDoc('# A\n> 停止 -> hide(ミニプレイヤー)');
    const body = document.components[0].common.interactions[0].results[0].body;
    expect(body.kind).toBe('overlay');
    const ov = body as Overlay;
    expect(ov.verb).toBe('hide');
    expect(ov.target.name).toBe('ミニプレイヤー');
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('show(X##v) — variant 指定を持てる', () => {
    const { document } = parseDoc('# A\n> タップ -> show(カード詳細##拡大)');
    const ov = document.components[0].common.interactions[0].results[0].body as Overlay;
    expect(ov.target.name).toBe('カード詳細');
    expect(ov.target.variant).toBe('拡大');
  });

  it('show(module::X) — module 指定を持てる', () => {
    const { document } = parseDoc('# A\n> タップ -> show(other::トースト)');
    const ov = document.components[0].common.interactions[0].results[0].body as Overlay;
    expect(ov.target.module).toBe('other');
    expect(ov.target.name).toBe('トースト');
  });

  it('E020: hide(X##v) — hide への ##variant 指定は構文エラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> hide(カード詳細##拡大)');
    const e020 = diagnostics.filter((d) => d.code === 'E020');
    expect(e020.length).toBeGreaterThan(0);
    expect(e020[0].severity).toBe('error');
  });

  it('show/hide は TRANSITION_WORDS には含まれない（別カテゴリの overlay verb）', () => {
    expect(TRANSITION_WORDS).not.toContain('show');
    expect(TRANSITION_WORDS).not.toContain('hide');
  });
});

// ---------------------------------------------------------------------------
// 4c. collection の対称参照（行動対象の先頭 "*"）
// ---------------------------------------------------------------------------
describe('collection reference (対称参照)', () => {
  it('*サムネイル — 行動対象の先頭 * で collection = true', () => {
    const { document, diagnostics } = parseDoc('# A\n> スクロール(*サムネイル) -> 続きを読む');
    const target = document.components[0].common.interactions[0].action.target!;
    expect(target.collection).toBe(true);
    expect(target.name).toBe('サムネイル');
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
  });

  it('* なしの参照は collection = false（1 インスタンス）', () => {
    const { document } = parseDoc('# A\n> タップ(サムネイル) -> push(詳細)\n\n# 詳細\nx');
    const target = document.components[0].common.interactions[0].action.target!;
    expect(target.collection).toBe(false);
  });

  it('E021: nav-target への * は構文エラー（collection への遷移は無い）', () => {
    const { diagnostics } = parseDoc('# A\n> だめ -> push(*一覧)');
    const e021 = diagnostics.filter((d) => d.code === 'E021');
    expect(e021.length).toBeGreaterThan(0);
    expect(e021[0].severity).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// 4e. 記号の name 混入の施行（E024 / E025 / E026 / W104。ADR-0012）
// ---------------------------------------------------------------------------
describe('symbol-in-name enforcement (E024/E025/E026/W104)', () => {
  it('E024: overlay 引数に * を書くとエラー（show(*X)）', () => {
    const { diagnostics } = parseDoc('# A\n> 通知 -> show(*トースト)');
    const e024 = diagnostics.filter((d) => d.code === 'E024');
    expect(e024.length).toBeGreaterThan(0);
    expect(e024[0].severity).toBe('error');
  });

  it('E024: hide(*X) もエラー', () => {
    const { diagnostics } = parseDoc('# A\n> 消す -> hide(*バナー)');
    expect(diagnostics.filter((d) => d.code === 'E024').length).toBeGreaterThan(0);
  });

  it('E025: 要素行の参照末尾に ? を書くとエラー', () => {
    const { diagnostics } = parseDoc('# A\nストーリー?');
    const e025 = diagnostics.filter((d) => d.code === 'E025');
    expect(e025.length).toBeGreaterThan(0);
    expect(e025[0].severity).toBe('error');
  });

  it('E025: 行動対象の ? は正常（presence gate、E025 は出ない）', () => {
    const { diagnostics } = parseDoc('# A\n> タップ(枠?) -> push(次)\n\n# 次\nx');
    expect(diagnostics.filter((d) => d.code === 'E025')).toHaveLength(0);
  });

  it('E026: 空の対象参照 行動() はエラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ() -> push(次)\n\n# 次\nx');
    const e026 = diagnostics.filter((d) => d.code === 'E026');
    expect(e026.length).toBeGreaterThan(0);
    expect(e026[0].severity).toBe('error');
  });

  it('W104: [ で始まる要素名は警告', () => {
    const { diagnostics } = parseDoc('# A\n[いいね通知] 対象のサムネイル');
    const w104 = diagnostics.filter((d) => d.code === 'W104');
    expect(w104.length).toBeGreaterThan(0);
    expect(w104[0].severity).toBe('warning');
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

  it('quoted な nav-target は quote を剥いだ名前になる', () => {
    const { document } = parseDoc('# A\n> タップ -> push("次の画面")');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.name).toBe('次の画面');
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

  it('quoted name は正準化され bare の同名と一致する（quote を剥ぐ）', () => {
    const { document } = parseDoc('# A\n> タップ("戻る") -> back()');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('戻る');
  });

  it('quoted な component 定義名は quote を剥いだ正準値になる', () => {
    const { document } = parseDoc('# "保存 画面"\n本文');
    expect(document.components[0].name).toBe('保存 画面');
  });

  it('quoted な variant 定義名は quote を剥いだ正準値になり、参照側と一致する', () => {
    const { document } = parseDoc('# 再生速度\n## "1.5x"\n表示\n> タップ -> goto(##"1.5x")');
    expect(document.components[0].variants[0].name).toBe('1.5x');
    const tr = document.components[0].variants[0].body.interactions[0].results[0].body as {
      target: { name: string };
    };
    expect(tr.target.name).toBe('1.5x');
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

  it('E017: 同名 alias の再 import はエラー', () => {
    const { diagnostics } = parseDoc('import x as m\nimport y as m\n# A\n要素');
    const e017 = diagnostics.filter((d) => d.code === 'E017');
    expect(e017.length).toBeGreaterThan(0);
    expect(e017[0].severity).toBe('error');
  });

  it('E017: 異なる alias の import はエラーにならない', () => {
    const { diagnostics } = parseDoc('import x as m\nimport y as n\n# A\n要素');
    const e017 = diagnostics.filter((d) => d.code === 'E017');
    expect(e017).toHaveLength(0);
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

  it('E012: 1 行に矢印が 2 つ（-> R -> R）はエラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ(保存) -> goto(詳細) -> back()');
    const e012 = diagnostics.filter((d) => d.code === 'E012');
    expect(e012.length).toBeGreaterThan(0);
    expect(e012[0].severity).toBe('error');
  });

  it('E012: ; の後に来る 2 つめの矢印もエラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> back() ; goto(次) -> push(先)');
    const e012 = diagnostics.filter((d) => d.code === 'E012');
    expect(e012.length).toBeGreaterThan(0);
  });

  it('E013: nav-target への ? は構文エラー（push(次?)）', () => {
    const { diagnostics } = parseDoc('# A\n次\n> タップ -> push(次?)');
    const e013 = diagnostics.filter((d) => d.code === 'E013');
    expect(e013.length).toBeGreaterThan(0);
    expect(e013[0].severity).toBe('error');
  });

  it('E013: goto(##variant?) も構文エラー', () => {
    const { diagnostics } = parseDoc('# A\n## B\n> タップ -> goto(##B?)');
    const e013 = diagnostics.filter((d) => d.code === 'E013');
    expect(e013.length).toBeGreaterThan(0);
  });

  it('E014: 参照の . は 1 段まで（箱.内箱.b は構文エラー）', () => {
    const { document, diagnostics } = parseDoc('# A\n箱\n> タップ(箱.内箱.b) -> back()');
    const e014 = diagnostics.filter((d) => d.code === 'E014');
    expect(e014.length).toBeGreaterThan(0);
    expect(e014[0].severity).toBe('error');
    // 復旧: member は 1 段目（内箱）だけを保持する
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('箱');
    expect(ref.member).toBe('内箱');
  });

  it('E015: inline の入れ子は 1 段まで（{ { a } } は構文エラー）', () => {
    const { diagnostics } = parseDoc('# A\n枠: { { a } }');
    const e015 = diagnostics.filter((d) => d.code === 'E015');
    expect(e015.length).toBeGreaterThan(0);
    expect(e015[0].severity).toBe('error');
  });

  it('E015: 1 段の inline はエラーにならない', () => {
    const { diagnostics } = parseDoc('# A\n枠: { a ; b }');
    const e015 = diagnostics.filter((d) => d.code === 'E015');
    expect(e015).toHaveLength(0);
  });

  it('E016: back(X##v) は構文エラー（戻り先の variant はスタックが決める）', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> back(X##v)');
    const e016 = diagnostics.filter((d) => d.code === 'E016');
    expect(e016.length).toBeGreaterThan(0);
    expect(e016[0].severity).toBe('error');
  });

  it('E016: back(##v) も構文エラー', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> back(##v)');
    const e016 = diagnostics.filter((d) => d.code === 'E016');
    expect(e016.length).toBeGreaterThan(0);
  });

  it('E016: back(X) は ## を含まないのでエラーにならない', () => {
    const { diagnostics } = parseDoc('# A\n> タップ -> back(X)');
    const e016 = diagnostics.filter((d) => d.code === 'E016');
    expect(e016).toHaveLength(0);
  });

  it('E018: component を 1 つも持たない文書はエラー（空文字列）', () => {
    const { diagnostics } = parseDoc('');
    const e018 = diagnostics.filter((d) => d.code === 'E018');
    expect(e018.length).toBeGreaterThan(0);
    expect(e018[0].severity).toBe('error');
  });

  it('E018: import しかない文書もエラー（component が無いのでエントリポイントが無い）', () => {
    const { diagnostics } = parseDoc('import x as m\n');
    const e018 = diagnostics.filter((d) => d.code === 'E018');
    expect(e018.length).toBeGreaterThan(0);
  });

  it('E018: component が 1 つでもあればエラーにならない', () => {
    const { diagnostics } = parseDoc('# A\n要素');
    const e018 = diagnostics.filter((d) => d.code === 'E018');
    expect(e018).toHaveLength(0);
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
  it('examples/battle.shitae — エラーが出ない', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile(
      new URL('../../../docs/examples/battle.shitae', import.meta.url),
      'utf-8'
    );
    const { document, diagnostics } = parse(source);
    const errors = diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toHaveLength(0);
    expect(document.components.length).toBeGreaterThan(0);
  });

  it('examples/ecommerce.shitae — エラーが出ない', async () => {
    const { readFile } = await import('fs/promises');
    const source = await readFile(
      new URL('../../../docs/examples/ecommerce.shitae', import.meta.url),
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

// ---------------------------------------------------------------------------
// 構造記号を含む quoted name の正準化（stress-test r3 A1/A2）
// SPEC「quoted name」: すべての name 位置で有効。正準値は quote を剥いだ文字列。
// ---------------------------------------------------------------------------
describe('quoted name と構造記号（##/::/./?）', () => {
  it('A1: push("a##b") は component a##b への遷移（quote 内 ## で分解しない）', () => {
    const { document } = parseDoc('# A\n> タップ -> push("a##b")');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.name).toBe('a##b');
    expect(target.variant).toBeNull();
    expect(target.module).toBeNull();
  });

  it('A1: push("a::b") は component a::b への遷移（quote 内 :: で分解しない）', () => {
    const { document } = parseDoc('# A\n> タップ -> push("a::b")');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.module).toBeNull();
    expect(target.name).toBe('a::b');
  });

  it('A1: push(mod::"x##y") は module 前置 + quoted 名（quote 内 ## で分解しない）', () => {
    const { document } = parseDoc('import m as mod\n# A\n> タップ -> push(mod::"x##y")');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.module).toBe('mod');
    expect(target.name).toBe('x##y');
    expect(target.variant).toBeNull();
  });

  it('A1: push("My Screen"##詳細) は quoted 名 + quote 外の ##variant', () => {
    const { document } = parseDoc('# A\n> タップ -> push("My Screen"##詳細)');
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.name).toBe('My Screen');
    expect(target.variant).toBe('詳細');
  });

  it('A1: show("a##b") は overlay 対象 a##b（quote 内 ## で分解しない）', () => {
    const { document, diagnostics } = parseDoc('# A\n> タップ -> show("a##b")');
    const o = document.components[0].common.interactions[0].results[0].body as Overlay;
    expect(o.target.name).toBe('a##b');
    expect(o.target.variant).toBeNull();
    expect(diagnostics).toHaveLength(0);
  });

  it('A1: back("a##b") は E016 にならない（quote 内 ## は variant 指定でない）', () => {
    const { document, diagnostics } = parseDoc('# A\n> タップ -> back("a##b")');
    expect(diagnostics.filter((d) => d.code === 'E016')).toHaveLength(0);
    const t = document.components[0].common.interactions[0].results[0].body as Transition;
    const target = t.target as NavTarget & { kind: 'component' };
    expect(target.name).toBe('a##b');
  });

  it('A2: 行動対象の quoted 名 + 空白 + ? は quote と空白を残さない', () => {
    const { document } = parseDoc('# A\n> 試す( "My Button" ?) -> やる');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('My Button');
    expect(ref.existsGated).toBe(true);
  });

  it('A2: 行動対象の bare 名 + 空白 + ? は末尾空白を残さない', () => {
    const { document } = parseDoc('# A\n> 試す( ボタン ?) -> やる');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('ボタン');
    expect(ref.existsGated).toBe(true);
  });

  it('A2: 行動対象の quote 内 . は member 分解しない', () => {
    const { document } = parseDoc('# A\n> 試す("a.b") -> やる');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.name).toBe('a.b');
    expect(ref.member).toBeNull();
  });

  it('A2: 行動対象の quote 内 :: は module 分解しない', () => {
    const { document } = parseDoc('# A\n> 試す("a::b") -> やる');
    const ref = document.components[0].common.interactions[0].action.target!;
    expect(ref.module).toBeNull();
    expect(ref.name).toBe('a::b');
  });
});

// ---------------------------------------------------------------------------
// E027: overlay verb の裸 ##variant（ADR-0016。stress-test r3 A3）
// ---------------------------------------------------------------------------
describe('E027: overlay verb の裸 ##variant', () => {
  it('show(##一) は E027（母体 component が無い）', () => {
    const { diagnostics } = parseDoc('# 画面\n## 一\n> 押す -> show(##一)');
    expect(diagnostics.filter((d) => d.code === 'E027')).toHaveLength(1);
  });

  it('hide(##一) は E027（E020 ではない — 本質は母体なし）', () => {
    const { diagnostics } = parseDoc('# 画面\n## 一\n> 押す -> hide(##一)');
    expect(diagnostics.filter((d) => d.code === 'E027')).toHaveLength(1);
    expect(diagnostics.filter((d) => d.code === 'E020')).toHaveLength(0);
  });

  it('hide(X##v)（component 付き）は従来どおり E020', () => {
    const { diagnostics } = parseDoc('# 画面\n> 押す -> hide(ミニ##再生中)');
    expect(diagnostics.filter((d) => d.code === 'E020')).toHaveLength(1);
    expect(diagnostics.filter((d) => d.code === 'E027')).toHaveLength(0);
  });

  it('show(X##v) は診断なし', () => {
    const { diagnostics } = parseDoc('# 画面\n> 押す -> show(ミニ##再生中)');
    expect(diagnostics).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// set verb（state verb。ADR-0014）
// ---------------------------------------------------------------------------
describe('set verb（遷移なし共有 variant 書換）', () => {
  it('set(クーポン##受取済) は StateWrite になる', () => {
    const { document, diagnostics } = parseDoc('# A\n> 受け取る -> set(クーポン##受取済)');
    expect(diagnostics).toHaveLength(0);
    const body = document.components[0].common.interactions[0].results[0].body;
    expect(body.kind).toBe('state');
    if (body.kind !== 'state') return;
    expect(body.verb).toBe('set');
    expect(body.target).toEqual({ module: null, name: 'クーポン', variant: '受取済' });
  });

  it('set(mod::クーポン##受取済) はモジュール前置可', () => {
    const { document, diagnostics } = parseDoc('import m as mod\n# A\n> 受け取る -> set(mod::クーポン##受取済)');
    expect(diagnostics).toHaveLength(0);
    const body = document.components[0].common.interactions[0].results[0].body;
    expect(body.kind).toBe('state');
    if (body.kind !== 'state') return;
    expect(body.target.module).toBe('mod');
    expect(body.target.name).toBe('クーポン');
  });

  it('quoted 名も正準化される: set("My Coupon"##受取済)', () => {
    const { document } = parseDoc('# A\n> 受け取る -> set("My Coupon"##受取済)');
    const body = document.components[0].common.interactions[0].results[0].body;
    expect(body.kind).toBe('state');
    if (body.kind !== 'state') return;
    expect(body.target.name).toBe('My Coupon');
  });

  it('E029: set(クーポン) — ##variant なしはエラー', () => {
    const { diagnostics } = parseDoc('# A\n> 受け取る -> set(クーポン)');
    expect(diagnostics.filter((d) => d.code === 'E029')).toHaveLength(1);
  });

  it('E029: set() — 空引数はエラー', () => {
    const { diagnostics } = parseDoc('# A\n> 受け取る -> set()');
    expect(diagnostics.filter((d) => d.code === 'E029')).toHaveLength(1);
  });

  it('E029: set(##受取済) — 裸 variant はエラー（goto(##v) の仕事）', () => {
    const { diagnostics } = parseDoc('# A\n> 受け取る -> set(##受取済)');
    expect(diagnostics.filter((d) => d.code === 'E029')).toHaveLength(1);
  });

  it('E029: set(クーポン##受取済, @s) — セッションは取れない', () => {
    const { diagnostics } = parseDoc('# A\n> 受け取る -> set(クーポン##受取済, @s)');
    expect(diagnostics.filter((d) => d.code === 'E029')).toHaveLength(1);
  });

  it('E029: set(*クーポン##受取済) — collection は取れない', () => {
    const { diagnostics } = parseDoc('# A\n> 受け取る -> set(*クーポン##受取済)');
    expect(diagnostics.filter((d) => d.code === 'E029')).toHaveLength(1);
  });
});
