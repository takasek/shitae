import { describe, it, expect } from 'vitest';
import {
  type Location,
  type Frame,
  type RuntimeState,
  type SessionMarker,
  type ReduceResult,
  initialState,
  reduce,
} from '../src/index.js';
import type { Transition, NavTarget, Span } from '@shitae/ast';

// ──────────────────────────────────────────────────
// テストヘルパ
// ──────────────────────────────────────────────────

const loc = (component: string, variation?: string, module?: string): Location => ({
  module: module ?? null,
  component,
  variation: variation ?? null,
});

const dummySpan: Span = { line: 1 };

const navComp = (name: string, variation?: string, module?: string): NavTarget => ({
  kind: 'component',
  module: module ?? null,
  name,
  variation: variation ?? null,
});

const navVar = (name: string): NavTarget => ({ kind: 'variation', name });

const tr = (
  word: Transition['word'],
  target?: NavTarget,
  session?: { name: string | null },
): Transition => ({
  kind: 'transition',
  word,
  target: target ?? null,
  session: session !== undefined ? { name: session.name, span: dummySpan } : null,
  span: dummySpan,
});

// ──────────────────────────────────────────────────
// T1: state types + initialState
// ──────────────────────────────────────────────────

describe('initialState', () => {
  it('1フレームで構成されること', () => {
    const s = initialState(loc('ホーム'));
    expect(s.frames).toHaveLength(1);
  });

  it('最初のフレームが指定の Location を持つこと', () => {
    const entry = loc('ホーム');
    const s = initialState(entry);
    expect(s.frames[0].location).toEqual(entry);
  });

  it('最初のフレームは wall=false, beginsSession=null, word="push"', () => {
    const s = initialState(loc('ホーム'));
    const f = s.frames[0];
    expect(f.wall).toBe(false);
    expect(f.beginsSession).toBeNull();
    expect(f.word).toBe('push');
  });

  it('variation 付き Location も保持される', () => {
    const entry = loc('対戦', '対戦中');
    const s = initialState(entry);
    expect(s.frames[0].location).toEqual(entry);
  });
});

// ──────────────────────────────────────────────────
// T2: push/back screen stack
// ──────────────────────────────────────────────────

describe('reduce: push', () => {
  it('push でフレームが1つ増える', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('push', navComp('詳細')));
    expect(s1.frames).toHaveLength(2);
    expect(s1.frames[1].location).toEqual(loc('詳細'));
  });

  it('push フレームは wall=false', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('push', navComp('詳細')));
    expect(s1.frames[1].wall).toBe(false);
  });

  it('push word が保持される', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('push', navComp('詳細')));
    expect(s1.frames[1].word).toBe('push');
  });
});

describe('reduce: back (1段)', () => {
  it('back() で末尾フレームを pop する', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('詳細'))));
    ({ state: s } = reduce(s, tr('back')));
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].location).toEqual(loc('ホーム'));
  });

  it('初期フレームで back() しても壊れない（スタック最小維持）', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1, diagnostics } = reduce(s0, tr('back'));
    // 1フレームのまま変わらない
    expect(s1.frames).toHaveLength(1);
    expect(s1.frames[0].location).toEqual(loc('ホーム'));
  });

  it('3段積んで 2回 back すると元に戻る', () => {
    let s = initialState(loc('A'));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    expect(s.frames).toHaveLength(3);
    ({ state: s } = reduce(s, tr('back')));
    ({ state: s } = reduce(s, tr('back')));
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].location.component).toBe('A');
  });
});

describe('reduce: back(X) 指定先まで戻る', () => {
  it('back(X) でスタックを X まで巻き戻す', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    ({ state: s } = reduce(s, tr('back', navComp('ホーム'))));
    expect(s.frames).toHaveLength(1);
    expect(s.frames[0].location.component).toBe('ホーム');
  });

  it('back(X) で X が現在地のとき変化なし', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const { state: s1 } = reduce(s, tr('back', navComp('A')));
    // A が現在地（末尾）なので pop 不要
    expect(s1.frames).toHaveLength(2);
    expect(s1.frames[1].location.component).toBe('A');
  });

  it('back(X) で X がスタックにない場合 R004 warn を返す', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const { state: s1, diagnostics } = reduce(s, tr('back', navComp('存在しない')));
    expect(diagnostics.some(d => d.code === 'R004')).toBe(true);
    // 状態は変化しない
    expect(s1.frames).toHaveLength(s.frames.length);
  });
});

// ──────────────────────────────────────────────────
// T3: goto replace
// ──────────────────────────────────────────────────

describe('reduce: goto', () => {
  it('goto(X) で末尾フレームを X に置換（スタック長維持）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const { state: s1 } = reduce(s, tr('goto', navComp('B')));
    expect(s1.frames).toHaveLength(2); // ホーム + B（A が B に置換）
    expect(s1.frames[1]!.location.component).toBe('B');
  });

  it('goto 後に back しても goto 先は残らない（戻り先は goto 前の1段下）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('goto', navComp('B')))); // A→B（置換）
    const { state: s1 } = reduce(s, tr('back'));
    // B が置換なので back するとホームへ
    expect(s1.frames).toHaveLength(1);
    expect(s1.frames[0]!.location.component).toBe('ホーム');
  });

  it('goto フレームは wall=false, beginsSession=null', () => {
    let s = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s, tr('goto', navComp('A')));
    const top = s1.frames[s1.frames.length - 1]!;
    expect(top.wall).toBe(false);
    expect(top.beginsSession).toBeNull();
    expect(top.word).toBe('goto');
  });

  it('goto(##姿) で同一 component 内の姿を切替', () => {
    let s = initialState(loc('対戦', '開始'));
    const { state: s1 } = reduce(s, tr('goto', navVar('対戦中')));
    expect(s1.frames).toHaveLength(1);
    const top = s1.frames[0]!;
    expect(top.location.component).toBe('対戦'); // component は変わらない
    expect(top.location.variation).toBe('対戦中');
  });
});

// ──────────────────────────────────────────────────
// T4: named session push/exit
// ──────────────────────────────────────────────────

describe('reduce: named session push + exit', () => {
  it('push(X,@S) で beginsSession={name:S} のフレームが積まれる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('ログイン'), { name: 'auth' })));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.beginsSession).toEqual({ name: 'auth' });
    expect(top.wall).toBe(false);
  });

  it('exit(@S) でセッション開始フレームの1つ手前まで巻き戻す', () => {
    // ホーム → push(A,@s) → push(B) → push(C)
    // exit(@s) → ホームへ戻る（A を begin した地点の前）
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 's' })));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    expect(s.frames).toHaveLength(4); // ホーム/A/B/C
    const { state: s1 } = reduce(s, tr('exit', undefined, { name: 's' }));
    expect(s1.frames).toHaveLength(1);
    expect(s1.frames[0]!.location.component).toBe('ホーム');
  });

  it('同名セッションが複数あるとき LIFO で最も新しいものを1つ破棄', () => {
    // SPEC:240-243 LIFO が基底
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 'flow' })));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'), { name: 'flow' })));
    ({ state: s } = reduce(s, tr('push', navComp('D'))));
    // 4フレーム: ホーム/A(flow)/B/C(flow)/D
    expect(s.frames).toHaveLength(5);
    // exit(@flow) → 最新の @flow (C) を begin 前まで: [ホーム/A(flow)/B] が残る
    const { state: s1 } = reduce(s, tr('exit', undefined, { name: 'flow' }));
    expect(s1.frames).toHaveLength(3);
    expect(s1.frames[2]!.location.component).toBe('B');
    // もう一度 exit(@flow) → [ホーム] が残る
    const { state: s2 } = reduce(s1, tr('exit', undefined, { name: 'flow' }));
    expect(s2.frames).toHaveLength(1);
    expect(s2.frames[0]!.location.component).toBe('ホーム');
  });

  it('exit 対象セッションがスタックにない場合 R002 warn', () => {
    let s = initialState(loc('ホーム'));
    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: '存在しない' }));
    expect(diagnostics.some(d => d.code === 'R002')).toBe(true);
    expect(s1.frames).toHaveLength(s.frames.length); // 状態変化なし
  });
});

// ──────────────────────────────────────────────────
// T5: present/dismiss wall + anonymous session
// ──────────────────────────────────────────────────

describe('reduce: present (壁あり + 無名セッション)', () => {
  it('present(X) で wall=true, beginsSession.name=null, word="present"', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'))));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.wall).toBe(true);
    expect(top.beginsSession).toEqual({ name: null });
    expect(top.word).toBe('present');
    expect(top.location.component).toBe('モーダル');
  });

  it('present(X,@S) で wall=true, beginsSession.name=S', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('ログインフロー'), { name: 'auth' })));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.wall).toBe(true);
    expect(top.beginsSession).toEqual({ name: 'auth' });
  });

  it('モーダル内で back() は no-op + R003 (壁の内側)', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'))));
    const { state: s1, diagnostics } = reduce(s, tr('back'));
    expect(diagnostics.some(d => d.code === 'R003')).toBe(true);
    // モーダルフレームは残ったまま
    expect(s1.frames).toHaveLength(s.frames.length);
    expect(s1.frames[s1.frames.length - 1]!.location.component).toBe('モーダル');
  });
});

describe('reduce: dismiss (無名セッション LIFO)', () => {
  it('dismiss() でモーダルを閉じる（begin フレームの1つ手前へ）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'))));
    const { state: s1 } = reduce(s, tr('dismiss'));
    expect(s1.frames).toHaveLength(1);
    expect(s1.frames[0]!.location.component).toBe('ホーム');
  });

  it('多段 present で dismiss() は LIFO で直近1つだけ閉じる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('M1'))));
    ({ state: s } = reduce(s, tr('present', navComp('M2'))));
    // ホーム / M1(wall,beginsSession=null) / M2(wall,beginsSession=null)
    expect(s.frames).toHaveLength(3);
    const { state: s1 } = reduce(s, tr('dismiss'));
    // M2 だけ閉じる → ホーム / M1
    expect(s1.frames).toHaveLength(2);
    expect(s1.frames[1]!.location.component).toBe('M1');
    const { state: s2 } = reduce(s1, tr('dismiss'));
    // M1 も閉じる → ホーム
    expect(s2.frames).toHaveLength(1);
  });

  it('dismiss 対象がない場合 R002 warn', () => {
    let s = initialState(loc('ホーム'));
    const { state: s1, diagnostics } = reduce(s, tr('dismiss'));
    expect(diagnostics.some(d => d.code === 'R002')).toBe(true);
    expect(s1.frames).toHaveLength(s.frames.length);
  });

  it('dismiss(@S) で名前付きセッションを閉じる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('ログインフロー'), { name: 'auth' })));
    ({ state: s } = reduce(s, tr('push', navComp('パスワード'))));
    // ホーム / ログインフロー(auth,wall=true) / パスワード
    expect(s.frames).toHaveLength(3);
    const { state: s1 } = reduce(s, tr('dismiss', undefined, { name: 'auth' }));
    expect(s1.frames).toHaveLength(1);
    expect(s1.frames[0]!.location.component).toBe('ホーム');
  });
});

// ──────────────────────────────────────────────────
// T6: nav-target normalization
// ──────────────────────────────────────────────────

describe('nav-target normalization', () => {
  it('component nav-target → Location {module:null, component:name, variation:null}', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('詳細'))));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.location).toEqual({ module: null, component: '詳細', variation: null });
  });

  it('component##姿 nav-target → variation が設定される', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', { kind: 'component', module: null, name: '対戦', variation: '開始' })));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.location).toEqual({ module: null, component: '対戦', variation: '開始' });
  });

  it('##姿 nav-target (variation only) → 現 component の姿を切替', () => {
    // push で 現在地「対戦」に移動してから ##対戦中 で姿切替
    let s = initialState(loc('対戦', '開始'));
    const { state: s1 } = reduce(s, tr('goto', navVar('対戦中')));
    const top = s1.frames[s1.frames.length - 1]!;
    expect(top.location.component).toBe('対戦');
    expect(top.location.variation).toBe('対戦中');
  });

  it('module::component nav-target → Location に module が設定される', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', { kind: 'component', module: 'auth', name: 'ログイン', variation: null })));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.location).toEqual({ module: 'auth', component: 'ログイン', variation: null });
  });

  it('module::component##姿 nav-target → module/component/variation すべて設定', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', { kind: 'component', module: 'shop', name: '商品詳細', variation: '読込中' })));
    const top = s.frames[s.frames.length - 1]!;
    expect(top.location).toEqual({ module: 'shop', component: '商品詳細', variation: '読込中' });
  });

  it('target が null の push は状態変化なし（no-op）', () => {
    const s = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s, tr('push'));
    expect(s1.frames).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────
// T7: twist diagnostics (R001)
// ──────────────────────────────────────────────────
// ねじれ = セッション種別・壁の不一致（SPEC:276-278 「エラーにしない、warnしてよい」）

describe('twist diagnostics (R001)', () => {
  it('push で積んだフレームを dismiss で閉じようとするとねじれ warn (R001) + 実行は成功', () => {
    // push(A,@s) → wall=false なのに dismiss で閉じる
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 's' })));
    // dismiss(@s) = 無名セッション検索 → @s は名前付きなので dismiss() は名前なしを探す
    // dismiss() でなく dismiss(@s)? AST 上 dismiss(@s) = session.name='s'
    // しかしここでは push で積んだ @s を dismiss(@s) で閉じる → ねじれ(push を dismiss)
    const { state: s1, diagnostics } = reduce(s, tr('dismiss', undefined, { name: 's' }));
    // ねじれ警告が出るが閉じること自体は成功（SPEC:278 エラーにしない）
    expect(diagnostics.some(d => d.code === 'R001')).toBe(true);
    expect(s1.frames).toHaveLength(1); // ホームに戻る
  });

  it('present で積んだフレームを exit(@S) で閉じるねじれ warn (R001)', () => {
    // present(M,@m) → wall=true なのに exit(@m) で閉じる
    // present は dismiss で閉じるのが正規、exit はねじれ
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'), { name: 'm' })));
    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'm' }));
    expect(diagnostics.some(d => d.code === 'R001')).toBe(true);
    expect(s1.frames).toHaveLength(1); // ホームに戻る（動作は成功）
  });

  it('ねじれなし: push→exit, present→dismiss は正常（R001 なし）', () => {
    // push(X,@s) + exit(@s) = 正規
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 's' })));
    const { diagnostics: d1 } = reduce(s, tr('exit', undefined, { name: 's' }));
    expect(d1.some(d => d.code === 'R001')).toBe(false);

    // present(X) + dismiss() = 正規
    s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('M'))));
    const { diagnostics: d2 } = reduce(s, tr('dismiss'));
    expect(d2.some(d => d.code === 'R001')).toBe(false);
  });
});
