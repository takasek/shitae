import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from '@shitae/parser';
import { toXState } from '../src/index.js';

function loadSample(name: string): string {
  return readFileSync(resolve(__dirname, `../../../docs/${name}`), 'utf-8');
}

describe('integration: examples/battle.shitae', () => {
  const src = loadSample('examples/battle.shitae');
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');

  it('parses with no errors', () => {
    expect(errors).toHaveLength(0);
  });

  it('generates valid output string', () => {
    const out = toXState(document);
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });

  it('output contains all top-level components or their variants', () => {
    const out = toXState(document);
    // Components with no variants
    expect(out).toContain("'スプラッシュ':");
    expect(out).toContain("'ログイン':");
    expect(out).toContain("'ホーム':");
    // マッチング has variants
    expect(out).toContain("'マッチング__検索中':");
    expect(out).toContain("'マッチング__失敗':");
    // 対戦 has variants
    expect(out).toContain("'対戦__開始':");
    expect(out).toContain("'対戦__対戦中':");
    expect(out).toContain("'対戦__リザルト':");
  });

  it('initial state is スプラッシュ (first component)', () => {
    const out = toXState(document);
    expect(out).toContain("initial: 'スプラッシュ'");
  });

  it('goto transition: 起動完了 -> goto ログイン', () => {
    const out = toXState(document);
    expect(out).toContain("'起動完了':");
    expect(out).toContain("target: 'ログイン'");
  });

  it('present transition: ログイン -> present ホーム', () => {
    const out = toXState(document);
    // ログイン state should have a present transition to ホーム
    expect(out).toContain("target: 'ホーム'");
  });

  it('push transition: ホーム -> push マイページ', () => {
    const out = toXState(document);
    expect(out).toContain("target: 'マイページ'");
  });

  it('back transition has guard for predecessor', () => {
    const out = toXState(document);
    // マッチング__検索中 is pushed from ホーム, so back() should reference ホーム
    // back appears in back() calls
    expect(out).toContain("context.stack.at(-1)");
  });

  it('xstate import at top', () => {
    const out = toXState(document);
    expect(out.startsWith("import { createMachine, assign } from 'xstate'")).toBe(true);
  });
});

describe('integration: examples/ecommerce.shitae', () => {
  const src = loadSample('examples/ecommerce.shitae');
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');

  it('parses with no errors', () => {
    expect(errors).toHaveLength(0);
  });

  it('generates valid output with components', () => {
    const out = toXState(document);
    expect(out).toContain("'商品一覧':");
  });
});
