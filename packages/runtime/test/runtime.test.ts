import { describe, it, expect } from 'vitest';
import {
  type Location,
  type Frame,
  type RuntimeState,
  initialState,
  reduce,
  activeLocation,
  activeFrame,
  overlayVariant,
  resolveLocation,
} from '../src/index.js';
import type { Transition, Overlay, NavTarget, Span } from '@shitae/ast';

// ──────────────────────────────────────────────────
// テストヘルパ
// ──────────────────────────────────────────────────

const loc = (component: string, variant?: string, module?: string): Location => ({
  module: module ?? null,
  component,
  variant: variant ?? null,
});

const dummySpan: Span = { offset: 0, length: 0, line: 1, col: 1 };

const navComp = (name: string, variant?: string, module?: string): NavTarget => ({
  kind: 'component',
  module: module ?? null,
  name,
  variant: variant ?? null,
});

const navVar = (name: string): NavTarget => ({ kind: 'variant', name });

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

const ov = (verb: Overlay['verb'], name: string, variant?: string, module?: string): Overlay => ({
  kind: 'overlay',
  verb,
  target: { module: module ?? null, name, variant: variant ?? null },
  span: dummySpan,
});

/** id からフレームを引く小さなヘルパ（テスト専用） */
function frameById(state: RuntimeState, id: number): Frame {
  const f = state.frames.find((fr) => fr.id === id);
  if (!f) throw new Error(`frame ${id} not found in test`);
  return f;
}

function childrenOf(state: RuntimeState, parentId: number): Frame[] {
  return state.frames.filter((f) => f.parentId === parentId);
}

// ──────────────────────────────────────────────────
// initialState
// ──────────────────────────────────────────────────

describe('initialState', () => {
  it('root フレーム1つで構成される', () => {
    const s = initialState(loc('ホーム'));
    expect(s.frames).toHaveLength(1);
    expect(s.activeFrameId).toBe(s.frames[0]!.id);
  });

  it('root フレームは parentId=null, barrier=false, beginsSession=null, origin="root"', () => {
    const s = initialState(loc('ホーム'));
    const f = s.frames[0]!;
    expect(f.parentId).toBeNull();
    expect(f.barrier).toBe(false);
    expect(f.beginsSession).toBeNull();
    expect(f.origin).toBe('root');
    expect(f.stack).toEqual([loc('ホーム')]);
  });

  it('overlays は空集合で始まる', () => {
    const s = initialState(loc('ホーム'));
    expect(s.overlays.size).toBe(0);
  });

  it('activeLocation がエントリの Location を返す', () => {
    const entry = loc('対戦', '対戦中');
    const s = initialState(entry);
    expect(activeLocation(s)).toEqual(entry);
  });
});

// ──────────────────────────────────────────────────
// push
// ──────────────────────────────────────────────────

describe('reduce: push(X) — セッションなしは同じフレームに積む', () => {
  it('フレーム数は変わらず stack が1段増える', () => {
    const s0 = initialState(loc('ホーム'));
    const rootId = s0.activeFrameId;
    const { state: s1 } = reduce(s0, tr('push', navComp('詳細')));
    expect(s1.frames).toHaveLength(1);
    expect(s1.activeFrameId).toBe(rootId);
    expect(frameById(s1, rootId).stack).toEqual([loc('ホーム'), loc('詳細')]);
  });

  it('target が null なら no-op', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('push'));
    expect(s1).toEqual(s0);
  });
});

describe('reduce: push(X, @S) — 子フレームを新規作成', () => {
  it('子フレームが作られアクティブになる。親は中断され木に残る', () => {
    const s0 = initialState(loc('ホーム'));
    const rootId = s0.activeFrameId;
    const { state: s1 } = reduce(s0, tr('push', navComp('記事'), { name: 'reading' }));
    expect(s1.frames).toHaveLength(2);
    const child = frameById(s1, s1.activeFrameId);
    expect(child.parentId).toBe(rootId);
    expect(child.stack).toEqual([loc('記事')]);
    expect(child.barrier).toBe(false); // SPEC: push@S は barrier なし
    expect(child.beginsSession).toEqual({ name: 'reading' });
    expect(child.origin).toBe('push');
    // 親は破棄されず残る
    expect(frameById(s1, rootId).stack).toEqual([loc('ホーム')]);
  });
});

// ──────────────────────────────────────────────────
// present
// ──────────────────────────────────────────────────

describe('reduce: present(X[, @S]) — barrier ありの子フレーム', () => {
  it('present(X) は barrier=true, beginsSession={name:null}（無名）', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('present', navComp('モーダル')));
    const child = frameById(s1, s1.activeFrameId);
    expect(child.barrier).toBe(true);
    expect(child.beginsSession).toEqual({ name: null });
    expect(child.origin).toBe('present');
    expect(child.stack).toEqual([loc('モーダル')]);
  });

  it('present(X, @S) は beginsSession={name:S}', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('present', navComp('ログインフロー'), { name: 'auth' }));
    const child = frameById(s1, s1.activeFrameId);
    expect(child.barrier).toBe(true);
    expect(child.beginsSession).toEqual({ name: 'auth' });
  });
});

// ──────────────────────────────────────────────────
// goto
// ──────────────────────────────────────────────────

describe('reduce: goto', () => {
  it('goto(X) は現在フレームの最上段を置換する（フレーム数不変）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const rootId = s.activeFrameId;
    const { state: s1 } = reduce(s, tr('goto', navComp('B')));
    expect(s1.frames).toHaveLength(1);
    expect(frameById(s1, rootId).stack).toEqual([loc('ホーム'), loc('B')]);
  });

  it('goto(##v) は component を変えず variant だけ書き換える', () => {
    let s = initialState(loc('対戦', '開始'));
    const { state: s1 } = reduce(s, tr('goto', navVar('対戦中')));
    expect(activeLocation(s1)).toEqual(loc('対戦', '対戦中'));
  });

  it('present で入った後 goto(##v) しても barrier と beginsSession は保存される', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'), { name: 's' })));
    const id = s.activeFrameId;
    const { state: s1 } = reduce(s, tr('goto', navVar('別姿')));
    const f = frameById(s1, id);
    expect(f.barrier).toBe(true);
    expect(f.beginsSession).toEqual({ name: 's' });
    expect(activeLocation(s1)).toEqual(loc('モーダル', '別姿'));
  });

  it('goto(component) も begin マーカーと barrier を保存する（location だけ置換。ADR-0006 B2）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'), { name: 's' })));
    const id = s.activeFrameId;
    const { state: s1 } = reduce(s, tr('goto', navComp('別画面')));
    const f = frameById(s1, id);
    expect(f.barrier).toBe(true);
    expect(f.beginsSession).toEqual({ name: 's' });
    expect(activeLocation(s1)).toEqual(loc('別画面'));
  });
});

// ──────────────────────────────────────────────────
// back()
// ──────────────────────────────────────────────────

describe('reduce: back()', () => {
  it('フレーム内に2段以上あれば1段 pop する（フレームは変わらない）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const id = s.activeFrameId;
    const { state: s1 } = reduce(s, tr('back'));
    expect(s1.activeFrameId).toBe(id);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('root の最下段で back() しても壊れない（no-op）', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1 } = reduce(s0, tr('back'));
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('present の barrier フレーム最下段で back() は no-op + R003', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'))));
    const id = s.activeFrameId;
    const { state: s1, diagnostics } = reduce(s, tr('back'));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(true);
    expect(s1.activeFrameId).toBe(id);
    expect(activeLocation(s1)).toEqual(loc('モーダル'));
  });
});

// ──────────────────────────────────────────────────
// back(X)
// ──────────────────────────────────────────────────

describe('reduce: back(X)', () => {
  it('同一フレーム内で X まで巻き戻す', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    const { state: s1 } = reduce(s, tr('back', navComp('ホーム')));
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('X が現在地なら変化なし', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const { state: s1 } = reduce(s, tr('back', navComp('A')));
    expect(activeLocation(s1)).toEqual(loc('A'));
  });

  it('X がどこにも無ければ R004 + no-op', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    const { state: s1, diagnostics } = reduce(s, tr('back', navComp('存在しない')));
    expect(diagnostics.some((d) => d.code === 'R004')).toBe(true);
    expect(s1).toEqual(s);
  });

  it('barrier を越えられず no-op + R003（オラクル Q4）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    const { state: s1, diagnostics } = reduce(s, tr('back', navComp('ホーム')));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(true);
    expect(s1).toEqual(s);
    expect(activeLocation(s1)).toEqual(loc('C'));
  });

  it('barrier を持つフレーム自身の中の対象なら越えずに指定できる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'))));
    const { state: s1, diagnostics } = reduce(s, tr('back', navComp('B')));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(false);
    expect(activeLocation(s1)).toEqual(loc('B'));
  });

  it('barrier なしの子フレームを越えて親のスタックまで遡れる（フレーム境界を越える拡張ケース）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('記事'), { name: 'reading' })));
    expect(s.frames).toHaveLength(2);
    const { state: s1 } = reduce(s, tr('back', navComp('ホーム')));
    // 子フレーム(記事)は破棄され、root フレームだけが残る
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });
});

// ──────────────────────────────────────────────────
// exit(@S) / dismiss(@S) / dismiss()
// ──────────────────────────────────────────────────

describe('reduce: exit(@S) — named session', () => {
  it('セッション開始フレームを破棄し親へ戻る', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 's' })));
    ({ state: s } = reduce(s, tr('push', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    const { state: s1 } = reduce(s, tr('exit', undefined, { name: 's' }));
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('同名セッションが複数あるとき LIFO で最も新しいものを1つ破棄', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 'flow' })));
    ({ state: s } = reduce(s, tr('push', navComp('B'), { name: 'flow' })));
    expect(s.frames).toHaveLength(3);
    const { state: s1 } = reduce(s, tr('exit', undefined, { name: 'flow' }));
    expect(s1.frames).toHaveLength(2);
    expect(activeLocation(s1)).toEqual(loc('A'));
    const { state: s2 } = reduce(s1, tr('exit', undefined, { name: 'flow' }));
    expect(s2.frames).toHaveLength(1);
    expect(activeLocation(s2)).toEqual(loc('ホーム'));
  });

  it('見つからなければ R002 + no-op', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1, diagnostics } = reduce(s0, tr('exit', undefined, { name: '存在しない' }));
    expect(diagnostics.some((d) => d.code === 'R002')).toBe(true);
    expect(s1).toEqual(s0);
  });

  it('present(X,@S) → exit(@S) は begin 地点へ戻る（正規の対応）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'), { name: 'm' })));
    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'm' }));
    expect(diagnostics).toHaveLength(0);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('push(X,@S) → goto(component) → exit(@S) が begin 地点へ戻る（オラクル Q3）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 'S' })));
    ({ state: s } = reduce(s, tr('goto', navComp('B'))));
    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'S' }));
    expect(diagnostics.some((d) => d.code === 'R002')).toBe(false);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });
});

describe('reduce: dismiss() — 無名セッション LIFO', () => {
  it('直近の無名セッションを閉じる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('モーダル'))));
    const { state: s1 } = reduce(s, tr('dismiss'));
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('多段 present で dismiss() は直近1つだけ閉じる', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('M1'))));
    ({ state: s } = reduce(s, tr('present', navComp('M2'))));
    expect(s.frames).toHaveLength(3);
    const { state: s1 } = reduce(s, tr('dismiss'));
    expect(activeLocation(s1)).toEqual(loc('M1'));
    const { state: s2 } = reduce(s1, tr('dismiss'));
    expect(activeLocation(s2)).toEqual(loc('ホーム'));
  });

  it('named session を素通りし、無名セッションの破棄に子孫として道連れにする', () => {
    // present(A)  [無名] → present(B,@named) [named] → dismiss() は
    // named の B を素通りし、無名の A を破棄。B は A の子孫として道連れ。
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'), { name: 'named' })));
    expect(s.frames).toHaveLength(3);
    const { state: s1 } = reduce(s, tr('dismiss'));
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });

  it('対象がなければ R002 + no-op', () => {
    const s0 = initialState(loc('ホーム'));
    const { state: s1, diagnostics } = reduce(s0, tr('dismiss'));
    expect(diagnostics.some((d) => d.code === 'R002')).toBe(true);
    expect(s1).toEqual(s0);
  });

  it('dismiss(@S) で名前付きセッションを閉じる（exit(@S) と同義）', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('ログインフロー'), { name: 'auth' })));
    ({ state: s } = reduce(s, tr('push', navComp('パスワード'))));
    const { state: s1 } = reduce(s, tr('dismiss', undefined, { name: 'auth' }));
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
  });
});

// ──────────────────────────────────────────────────
// T1〜T7: frame-tree-cases.md 手トレース受け入れ基準
// ──────────────────────────────────────────────────

describe('T1: タブ慣用句（present anchor + switch 兄弟）', () => {
  it('resume-or-create + 兄弟規則で最終アクティブ = 検索、警告なし', () => {
    let s = initialState(loc('起動'));
    const rootId = s.activeFrameId;

    ({ state: s } = reduce(s, tr('present', navComp('ホーム'), { name: 'tabHome' })));
    const f1 = s.activeFrameId;
    expect(frameById(s, f1).parentId).toBe(rootId);
    expect(frameById(s, f1).barrier).toBe(true);
    expect(frameById(s, f1).origin).toBe('present');

    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' })));
    const f2 = s.activeFrameId;
    expect(frameById(s, f2).parentId).toBe(f1); // F1 は switch 製でない → 子
    expect(frameById(s, f2).barrier).toBe(true);
    expect(frameById(s, f2).origin).toBe('switch');

    ({ state: s } = reduce(s, tr('switch', navComp('ランキング'), { name: 'tabRank' })));
    const f3 = s.activeFrameId;
    expect(frameById(s, f3).parentId).toBe(f1); // F2 は switch 製 → 兄弟（F1 の子）

    const { state: s1, diagnostics } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' }));
    expect(diagnostics).toHaveLength(0);
    expect(s1.activeFrameId).toBe(f2); // 復帰、木の形は不変
    expect(s1.frames).toHaveLength(4); // root, F1, F2, F3 すべて残る
    expect(activeLocation(s1)).toEqual(loc('検索'));
    expect(childrenOf(s1, f1).map((f) => f.id).sort()).toEqual([f2, f3].sort());
  });

  // ADR-0008 補正: タブ内 push の中から switch しても、新タブは push フレームの
  // 子ではなく anchor(present) の子になり、exit(@reading) の道連れにならない。
  it('present anchor 直下で push してから switch — 新タブは anchor の子（道連れ回避）', () => {
    let s = initialState(loc('起動'));
    ({ state: s } = reduce(s, tr('present', navComp('ホーム'), { name: 'tabHome' })));
    const anchor = s.activeFrameId;
    ({ state: s } = reduce(s, tr('push', navComp('記事'), { name: 'reading' })));
    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' })));
    const search = s.activeFrameId;
    // 検索は記事(push)ではなく anchor(present ホーム)の子
    expect(frameById(s, search).parentId).toBe(anchor);

    // exit(@reading): 記事だけ消え、検索タブは生存
    ({ state: s } = reduce(s, tr('exit', undefined, { name: 'reading' })));
    expect(s.frames.some((f) => f.beginsSession?.name === 'tabSearch')).toBe(true);
    expect(s.frames.some((f) => f.beginsSession?.name === 'reading')).toBe(false);
    expect(activeLocation(s)).toEqual(loc('検索'));
  });
});

describe('T2: 兄弟規則（switch 製から switch は兄弟）', () => {
  it('switch 製でない root からの switch は子、switch 製からの switch は兄弟', () => {
    let s = initialState(loc('ホーム'));
    const rootId = s.activeFrameId;
    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 's2' })));
    const fa = s.activeFrameId;
    expect(frameById(s, fa).parentId).toBe(rootId);

    ({ state: s } = reduce(s, tr('switch', navComp('設定'), { name: 's3' })));
    const fb = s.activeFrameId;
    expect(frameById(s, fb).parentId).toBe(rootId); // 兄弟＝root の子
    expect(activeLocation(s)).toEqual(loc('設定'));
    expect(childrenOf(s, rootId).map((f) => f.id).sort()).toEqual([fa, fb].sort());
  });
});

describe('T3: switch の barrier', () => {
  it('switch 製フレームの最下段で back() は no-op + R003', () => {
    let s = initialState(loc('root'));
    ({ state: s } = reduce(s, tr('switch', navComp('X'), { name: 's' })));
    const id = s.activeFrameId;
    const { state: s1, diagnostics } = reduce(s, tr('back'));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(true);
    expect(s1.activeFrameId).toBe(id);
    expect(activeLocation(s1)).toEqual(loc('X'));
  });
});

describe('T4: 中断フレームの遠隔 exit（画面は動かない）', () => {
  it('アクティブパスに無い @S は木全体から遠隔破棄され、アクティブ画面は動かない', () => {
    let s = initialState(loc('起動'));
    ({ state: s } = reduce(s, tr('present', navComp('ホーム'), { name: 'tabHome' })));
    const f1 = s.activeFrameId;
    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' })));
    const f2 = s.activeFrameId;
    ({ state: s } = reduce(s, tr('switch', navComp('ホーム'), { name: 'tabHome' })));
    expect(s.activeFrameId).toBe(f1); // 復帰

    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'tabSearch' }));
    expect(diagnostics).toHaveLength(0);
    expect(s1.activeFrameId).toBe(f1); // アクティブフレームは動かない
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
    expect(s1.frames.some((f) => f.id === f2)).toBe(false); // F2 は遠隔破棄された
  });
});

describe('T5: exit で子孫タブ全滅（ログアウト）', () => {
  it('アクティブパス上の @tabHome を exit すると子孫タブごと全滅', () => {
    let s = initialState(loc('起動'));
    ({ state: s } = reduce(s, tr('present', navComp('ホーム'), { name: 'tabHome' })));
    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' })));
    ({ state: s } = reduce(s, tr('switch', navComp('ランキング'), { name: 'tabRank' })));
    ({ state: s } = reduce(s, tr('switch', navComp('検索'), { name: 'tabSearch' })));
    expect(s.frames).toHaveLength(4);

    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'tabHome' }));
    expect(diagnostics).toHaveLength(0);
    expect(s1.frames).toHaveLength(1);
    expect(activeLocation(s1)).toEqual(loc('起動'));
  });
});

describe('T6: push@S 子フレームの底で back → 親へ抜ける（barrier なし）', () => {
  it('barrier なしの子フレームは最下段の back() で親フレームへ抜ける', () => {
    let s = initialState(loc('ホーム'));
    const rootId = s.activeFrameId;
    ({ state: s } = reduce(s, tr('push', navComp('記事'), { name: 'reading' })));
    const f = s.activeFrameId;
    ({ state: s } = reduce(s, tr('push', navComp('関連'))));
    expect(frameById(s, f).stack).toEqual([loc('記事'), loc('関連')]);

    ({ state: s } = reduce(s, tr('back')));
    expect(s.activeFrameId).toBe(f);
    expect(activeLocation(s)).toEqual(loc('記事'));

    const { state: s1, diagnostics } = reduce(s, tr('back'));
    expect(diagnostics).toHaveLength(0);
    expect(s1.activeFrameId).toBe(rootId);
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
    expect(s1.frames.some((fr) => fr.id === f)).toBe(false); // 子フレームは破棄された
  });
});

describe('T7: 破棄済み @S への switch は再作成', () => {
  it('exit 後の switch(@S) は新規フレームを作る（まっさらの initial variant）', () => {
    let s = initialState(loc('ホーム'));
    const rootId = s.activeFrameId;
    ({ state: s } = reduce(s, tr('present', navComp('タブ'), { name: 't' })));
    const f = s.activeFrameId;
    ({ state: s } = reduce(s, tr('exit', undefined, { name: 't' })));
    expect(s.frames.some((fr) => fr.id === f)).toBe(false);

    const { state: s1 } = reduce(s, tr('switch', navComp('タブ'), { name: 't' }));
    expect(s1.frames).toHaveLength(2);
    const newF = s1.activeFrameId;
    expect(newF).not.toBe(f); // 別の新規フレーム
    expect(frameById(s1, newF).parentId).toBe(rootId);
    expect(frameById(s1, newF).barrier).toBe(true);
    expect(frameById(s1, newF).origin).toBe('switch');
    expect(activeLocation(s1)).toEqual(loc('タブ'));
  });
});

// ──────────────────────────────────────────────────
// 既存オラクル Q1〜Q5（run-oracle.mjs と同じ遷移列。フレーム木化後も不変であること）
// ──────────────────────────────────────────────────

describe('オラクル Q1〜Q5（frame 木化後も結果不変）', () => {
  it('Q1: push(A); present(B); back() → B で R003', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'))));
    const { state: s1, diagnostics } = reduce(s, tr('back'));
    expect(activeLocation(s1)).toEqual(loc('B'));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(true);
  });

  it('Q2: present(A); present(B,@named); dismiss() → ホーム、警告なし', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('present', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'), { name: 'named' })));
    const { state: s1, diagnostics } = reduce(s, tr('dismiss'));
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
    expect(diagnostics).toHaveLength(0);
  });

  it('Q3: push(A,@S); goto(B); exit(@S) → ホーム、警告なし', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'), { name: 'S' })));
    ({ state: s } = reduce(s, tr('goto', navComp('B'))));
    const { state: s1, diagnostics } = reduce(s, tr('exit', undefined, { name: 'S' }));
    expect(activeLocation(s1)).toEqual(loc('ホーム'));
    expect(diagnostics).toHaveLength(0);
  });

  it('Q4: push(A); present(B); push(C); back(ホーム) → C で R003', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('present', navComp('B'))));
    ({ state: s } = reduce(s, tr('push', navComp('C'))));
    const { state: s1, diagnostics } = reduce(s, tr('back', navComp('ホーム')));
    expect(activeLocation(s1)).toEqual(loc('C'));
    expect(diagnostics.some((d) => d.code === 'R003')).toBe(true);
  });

  it('Q5: push(A); goto(##開いた); back(); push(A) → A は「閉じた」(初期姿)', () => {
    let s = initialState(loc('ホーム'));
    ({ state: s } = reduce(s, tr('push', navComp('A'))));
    ({ state: s } = reduce(s, tr('goto', navVar('開いた'))));
    expect(activeLocation(s)).toEqual(loc('A', '開いた'));
    ({ state: s } = reduce(s, tr('back')));
    expect(activeLocation(s)).toEqual(loc('ホーム'));
    const { state: s1 } = reduce(s, tr('push', navComp('A')));
    expect(activeLocation(s1)).toEqual(loc('A')); // variant なし＝初期姿に戻っている
  });
});

// ──────────────────────────────────────────────────
// オーバーレイ（show / hide）
// ──────────────────────────────────────────────────

describe('reduce: overlay show/hide', () => {
  it('show(X) はオーバーレイ集合に追加する', () => {
    const s0 = initialState(loc('プレイヤー'));
    const { state: s1, diagnostics } = reduce(s0, ov('show', 'ミニプレイヤー'));
    expect(diagnostics).toHaveLength(0);
    expect(s1.overlays.has('ミニプレイヤー')).toBe(true);
  });

  it('hide(X) はオーバーレイ集合から除去する', () => {
    let s = initialState(loc('プレイヤー'));
    ({ state: s } = reduce(s, ov('show', 'ミニプレイヤー')));
    const { state: s1 } = reduce(s, ov('hide', 'ミニプレイヤー'));
    expect(s1.overlays.has('ミニプレイヤー')).toBe(false);
  });

  it('hide(X) は未掲示なら no-op（空打ち）', () => {
    const s0 = initialState(loc('プレイヤー'));
    const { state: s1, diagnostics } = reduce(s0, ov('hide', '未掲示'));
    expect(diagnostics).toHaveLength(0);
    expect(s1.overlays.size).toBe(0);
  });

  it('オーバーレイはフレーム木を操作しない', () => {
    const s0 = initialState(loc('プレイヤー'));
    const { state: s1 } = reduce(s0, ov('show', 'ミニプレイヤー'));
    expect(s1.frames).toEqual(s0.frames);
    expect(s1.activeFrameId).toBe(s0.activeFrameId);
  });

  // ADR-0009: エントリは (component, 表示 variant)
  it('show(X##v) は表示 variant を保持する', () => {
    const { state } = reduce(initialState(loc('プレイヤー')), ov('show', 'ミニプレイヤー', '再生中'));
    expect(overlayVariant(state, 'ミニプレイヤー')).toBe('再生中');
  });

  it('掲示中の再 show(X##v2) は表示 variant を上書きする（集合サイズは 1）', () => {
    let s = initialState(loc('プレイヤー'));
    ({ state: s } = reduce(s, ov('show', 'ミニプレイヤー', '再生中')));
    ({ state: s } = reduce(s, ov('show', 'ミニプレイヤー', '一時停止')));
    expect(overlayVariant(s, 'ミニプレイヤー')).toBe('一時停止');
    expect(s.overlays.size).toBe(1);
  });

  it('show(X)（variant 省略）の表示 variant は null（initial の含意）', () => {
    const { state } = reduce(initialState(loc('プレイヤー')), ov('show', 'ミニプレイヤー'));
    expect(overlayVariant(state, 'ミニプレイヤー')).toBe(null);
  });

  it('未掲示 component の overlayVariant は null', () => {
    expect(overlayVariant(initialState(loc('プレイヤー')), '未掲示')).toBe(null);
  });
});

// ──────────────────────────────────────────────────
// activeFrame ヘルパ
// ──────────────────────────────────────────────────

describe('activeFrame', () => {
  it('現在アクティブなフレームオブジェクトを返す', () => {
    const s = initialState(loc('ホーム'));
    expect(activeFrame(s).id).toBe(s.activeFrameId);
  });
});

// ──────────────────────────────────────────────────
// singleton component（ADR-0011）
// ──────────────────────────────────────────────────

describe('initialState — singleton 注入', () => {
  it('singletons 引数で単一インスタンス名の集合を持つ', () => {
    const s = initialState(loc('ホーム'), ['クーポン']);
    expect(s.singletons.has('クーポン')).toBe(true);
    expect(s.singletons.has('ホーム')).toBe(false);
  });

  it('singletons 省略時は空集合・共有レジストリも空', () => {
    const s = initialState(loc('ホーム'));
    expect(s.singletons.size).toBe(0);
    expect(s.sharedVariants.size).toBe(0);
  });

  it('entry が singleton かつ variant 指定ありなら共有レジストリを seed する', () => {
    const s = initialState(loc('クーポン', '受取済'), ['クーポン']);
    expect(s.sharedVariants.get('クーポン')).toBe('受取済');
  });

  it('entry が singleton でも variant 省略なら seed しない（初回 initial の含意）', () => {
    const s = initialState(loc('クーポン'), ['クーポン']);
    expect(s.sharedVariants.has('クーポン')).toBe(false);
  });
});

describe('resolveLocation — 共有レジストリ解決', () => {
  it('singleton の Location は共有 variant へ解決される（格納値でなく）', () => {
    const s = initialState(loc('ホーム'), ['クーポン']);
    const shared = { ...s, sharedVariants: new Map([['クーポン', '受取済']]) };
    // 格納された variant が古くても共有現在値で上書き解決される
    expect(resolveLocation(shared, loc('クーポン', '未受取')).variant).toBe('受取済');
  });

  it('共有レジストリ未登録の singleton は null（initial の含意）へ解決される', () => {
    const s = initialState(loc('ホーム'), ['クーポン']);
    expect(resolveLocation(s, loc('クーポン', '未受取')).variant).toBe(null);
  });

  it('通常 component は格納 variant のまま素通し', () => {
    const s = initialState(loc('ホーム'), ['クーポン']);
    expect(resolveLocation(s, loc('記事', '本文')).variant).toBe('本文');
  });
});

describe('singleton — 共有 variant の書換と参照（基準1）', () => {
  it('present→goto(##v)→dismiss→再 present で共有 variant を映す', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    // 1箇所目から present
    s = reduce(s, tr('present', navComp('クーポン'))).state;
    expect(activeLocation(s).variant).toBe(null); // 初回 initial
    // goto(##受取済) で共有書換
    s = reduce(s, tr('goto', navVar('受取済'))).state;
    expect(s.sharedVariants.get('クーポン')).toBe('受取済');
    expect(activeLocation(s).variant).toBe('受取済');
    // dismiss で root へ戻る
    s = reduce(s, tr('dismiss')).state;
    expect(activeLocation(s).component).toBe('ホーム');
    // 2箇所目から present（variant 省略）→ 共有現在値 受取済 を映す
    s = reduce(s, tr('present', navComp('クーポン'))).state;
    expect(activeLocation(s).variant).toBe('受取済');
  });

  it('push(X##v) の明示 variant も共有書換として働く', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('push', navComp('クーポン', '受取済'))).state;
    expect(s.sharedVariants.get('クーポン')).toBe('受取済');
    expect(activeLocation(s).variant).toBe('受取済');
  });

  it('通常 component の goto(##v) は共有レジストリに触れない', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('goto', navVar('編集中'))).state;
    expect(s.sharedVariants.size).toBe(0);
    expect(activeLocation(s).variant).toBe('編集中');
  });
});

describe('singleton — switch をまたぐ参照（基準2・スナップショット不在）', () => {
  const sess = (name: string) => ({ name });

  it('タブAで goto(##v2)→タブBへ switch→A復帰で v2 を映す', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('switch', navComp('クーポン'), sess('t'))).state; // タブA作成
    s = reduce(s, tr('goto', navVar('v2'))).state; // 共有=v2
    s = reduce(s, tr('switch', navComp('設定'), sess('u'))).state; // タブB作成
    expect(activeLocation(s).component).toBe('設定');
    s = reduce(s, tr('switch', navComp('クーポン'), sess('t'))).state; // A復帰
    expect(activeLocation(s).variant).toBe('v2');
  });

  it('中断中のタブは他所での共有 variant 進行に追随する（snapshot 不在）', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('switch', navComp('クーポン'), sess('t'))).state; // タブA=クーポン
    s = reduce(s, tr('goto', navVar('v2'))).state; // 共有=v2
    s = reduce(s, tr('switch', navComp('設定'), sess('u'))).state; // タブBへ（A中断）
    // タブBで別所からクーポンを開き v3 へ進める
    s = reduce(s, tr('present', navComp('クーポン'))).state;
    s = reduce(s, tr('goto', navVar('v3'))).state; // 共有=v3
    s = reduce(s, tr('dismiss')).state;
    // タブA復帰: 中断中に共有が v3 へ進んだので v2 でなく v3
    s = reduce(s, tr('switch', navComp('クーポン'), sess('t'))).state;
    expect(activeLocation(s).variant).toBe('v3');
  });

  it('switch-create の明示 X##v は共有書換として働く', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('switch', navComp('クーポン', '受取済'), sess('t'))).state;
    expect(s.sharedVariants.get('クーポン')).toBe('受取済');
    expect(activeLocation(s).variant).toBe('受取済');
  });

  it('switch-resume でも明示 X##v は共有書換として働く（SPEC 301 優先・設計者確定）', () => {
    let s = initialState(loc('ホーム'), ['クーポン']);
    s = reduce(s, tr('switch', navComp('クーポン'), sess('t'))).state; // 共有 null（initial）
    s = reduce(s, tr('switch', navComp('設定'), sess('u'))).state; // 別タブへ
    // @t 生存中に X##v で resume → target frame は不変だが共有 variant は書換
    s = reduce(s, tr('switch', navComp('クーポン', '受取済'), sess('t'))).state;
    expect(s.sharedVariants.get('クーポン')).toBe('受取済');
    expect(activeLocation(s).variant).toBe('受取済');
  });
});
