import { describe, it, expect } from 'vitest';
import {
  type Location,
  type Frame,
  type RuntimeState,
  type SessionMarker,
  type ReduceResult,
  initialState,
} from '../src/index.js';

// ──────────────────────────────────────────────────
// テストヘルパ
// ──────────────────────────────────────────────────

const loc = (component: string, variation?: string, module?: string): Location => ({
  module: module ?? null,
  component,
  variation: variation ?? null,
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
