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

const dummySpan: Span = { offset: 0, length: 0, line: 1, col: 1 };

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
