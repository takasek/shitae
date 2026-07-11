import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { toXState } from '../src/index.js';

// ───── helpers ──────────────────────────────────────────────────────

function parseOk(src: string) {
  const { document, diagnostics } = parse(src);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length > 0) throw new Error(`parse error: ${errors[0]!.message}`);
  return document;
}

// ───── basic structure ───────────────────────────────────────────────

describe('output structure', () => {
  it('includes xstate v5 import', () => {
    const doc = parseOk('# A\n');
    const out = toXState(doc);
    expect(out).toContain("import { createMachine, assign } from 'xstate'");
  });

  it('exports const machine', () => {
    const doc = parseOk('# A\n');
    const out = toXState(doc);
    expect(out).toContain('export const machine = createMachine(');
  });

  it('includes NavigationContext interface', () => {
    const doc = parseOk('# A\n');
    const out = toXState(doc);
    expect(out).toContain('NavigationContext');
    expect(out).toContain('stack:');
  });

  it('includes context: { stack: [] }', () => {
    const doc = parseOk('# A\n');
    const out = toXState(doc);
    expect(out).toContain('stack: []');
  });
});

// ───── initial state ─────────────────────────────────────────────────

describe('initial state', () => {
  it('first component is initial state', () => {
    const doc = parseOk('# ホーム\n\n# 設定\n');
    const out = toXState(doc);
    expect(out).toContain("initial: 'ホーム'");
  });

  it('first variant of first component is initial when variants exist', () => {
    const doc = parseOk('# マッチング\n## 検索中\n\n## 失敗\n');
    const out = toXState(doc);
    expect(out).toContain("initial: 'マッチング__検索中'");
  });
});

// ───── state nodes ───────────────────────────────────────────────────

describe('state nodes', () => {
  it('component without variants generates one state', () => {
    const doc = parseOk('# ログイン\n');
    const out = toXState(doc);
    expect(out).toContain("'ログイン':");
  });

  it('variants generate flat states with double-underscore separator', () => {
    const doc = parseOk('# マッチング\n## 検索中\n\n## 失敗\n');
    const out = toXState(doc);
    expect(out).toContain("'マッチング__検索中':");
    expect(out).toContain("'マッチング__失敗':");
    // parent key should not be a state itself
    expect(out).not.toMatch(/'マッチング':\s*\{[^}]*initial/);
  });

  it('multiple components all appear as states', () => {
    const doc = parseOk('# A\n\n# B\n\n# C\n');
    const out = toXState(doc);
    expect(out).toContain("'A':");
    expect(out).toContain("'B':");
    expect(out).toContain("'C':");
  });
});

// ───── goto transition ───────────────────────────────────────────────

describe('goto transition', () => {
  it('generates a transition with target, no stack action', () => {
    const doc = parseOk('# ログイン\n> タップ -> goto(ホーム)\n\n# ホーム\n');
    const out = toXState(doc);
    // event name
    expect(out).toContain("'タップ':");
    // target
    expect(out).toContain("target: 'ホーム'");
    // no stack assign for goto
    const gotoBlock = out.slice(out.indexOf("'タップ':"), out.indexOf("target: 'ホーム'") + 50);
    expect(gotoBlock).not.toContain('assign');
  });

  it('variant target uses __ separator', () => {
    const doc = parseOk(
      '# マッチング\n## 検索中\n> 相手が見つかった -> goto(対戦##開始)\n\n## 失敗\n\n# 対戦\n## 開始\n',
    );
    const out = toXState(doc);
    expect(out).toContain("target: '対戦__開始'");
  });

  it('intra-component variant transition (##姿)', () => {
    const doc = parseOk('# フィルタ\n## 閉じた\n> 開く -> goto(##開いた)\n\n## 開いた\n');
    const out = toXState(doc);
    expect(out).toContain("target: 'フィルタ__開いた'");
  });
});

// ───── push transition ───────────────────────────────────────────────

describe('push transition', () => {
  it('generates a transition with target and stack assign', () => {
    const doc = parseOk('# ホーム\n> タップ(設定) -> push(設定)\n\n# 設定\n');
    const out = toXState(doc);
    expect(out).toContain("target: '設定'");
    expect(out).toContain('assign');
    expect(out).toContain('stack');
  });

  it('stack assign pushes source state id', () => {
    const doc = parseOk('# ホーム\n> タップ(設定) -> push(設定)\n\n# 設定\n');
    const out = toXState(doc);
    // Should contain the source state name 'ホーム' in the assign
    expect(out).toContain("'ホーム'");
  });
});

// ───── back transition ────────────────────────────────────────────────

describe('back transition', () => {
  it('generates guard-based transitions for all push predecessors', () => {
    const doc = parseOk(
      '# ホーム\n> タップ(設定) -> push(設定)\n\n# 設定\n> タップ(戻る) -> back()\n',
    );
    const out = toXState(doc);
    // back() should have a guard pointing to ホーム
    expect(out).toContain("'タップ(戻る)':");
    expect(out).toContain("'ホーム'");
  });

  it('back with no known predecessors generates empty array or comment', () => {
    const doc = parseOk('# 孤立\n> タップ(戻る) -> back()\n');
    const out = toXState(doc);
    // should not crash, and back event still appears
    expect(out).toContain("'タップ(戻る)':");
  });
});

// ───── present / dismiss ─────────────────────────────────────────────

describe('present / dismiss', () => {
  it('present generates transition with stack assign (wall marker)', () => {
    const doc = parseOk('# ホーム\n> タップ(設定) -> present(設定)\n\n# 設定\n');
    const out = toXState(doc);
    expect(out).toContain("target: '設定'");
    expect(out).toContain('assign');
  });

  it('dismiss generates guard-based back transitions (same as back)', () => {
    const doc = parseOk(
      '# ホーム\n> タップ(設定) -> present(設定)\n\n# 設定\n> タップ(閉じる) -> dismiss()\n',
    );
    const out = toXState(doc);
    expect(out).toContain("'タップ(閉じる)':");
  });
});

// ───── effect only ────────────────────────────────────────────────────

describe('effect', () => {
  it('effect-only result generates event with no target', () => {
    const doc = parseOk('# ホーム\n> スクロール -> 続きを読み込む\n');
    const out = toXState(doc);
    expect(out).toContain("'スクロール':");
    // no target for effect
    const block = out.slice(out.indexOf("'スクロール':"), out.indexOf("'スクロール':") + 120);
    expect(block).not.toContain('target:');
  });
});

// ───── multiple results (labeled) ────────────────────────────────────

describe('multiple results', () => {
  it('generates multiple transitions under same event', () => {
    const doc = parseOk(
      '# ログイン\n> タップ(ログインボタン) -> [成功] present(ホーム) ; [失敗] 認証エラーを表示する\n\n# ホーム\n',
    );
    const out = toXState(doc);
    // 成功 → target present
    expect(out).toContain("target: 'ホーム'");
    // 失敗 → effect only (no target)
    // both appear under タップ(ログインボタン)
    expect(out).toContain("'タップ(ログインボタン)':");
  });
});

// ───── label inheritance (記法 v2: ラベルは次のラベルまでスコープ) ─────

describe('label inheritance', () => {
  it('unlabeled result inherits the nearest preceding label (goto edge reflects it)', () => {
    const doc = parseOk(
      '# A\n> タップ(保存) -> [成功] 保存する ; goto(B)\n\n# B\n',
    );
    const out = toXState(doc);
    const start = out.indexOf("'タップ(保存)':");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = out.indexOf('],', start);
    const block = out.slice(start, end);
    // goto(B) has no explicit label of its own, but inherits [成功]
    // from the preceding labeled result — both the label and the
    // goto target must appear together in the same event's transitions.
    expect(block).toContain("target: 'B'");
    expect(block).toContain('成功');
  });
});

// ───── shadow composition (記法 v2: 姿固有が共通を shadow) ────────────

describe('shadow composition', () => {
  it('variant-specific interaction shadows common interaction with same action', () => {
    const doc = parseOk(
      '# A\n> タップ(設定) -> goto(共通行き先)\n## x\n\n## y\n> タップ(設定) -> goto(専用行き先)\n\n# 共通行き先\n\n# 専用行き先\n',
    );
    const out = toXState(doc);

    const xStart = out.indexOf("'A__x':");
    const yStart = out.indexOf("'A__y':");
    expect(xStart).toBeGreaterThanOrEqual(0);
    expect(yStart).toBeGreaterThan(xStart);
    const xBlock = out.slice(xStart, yStart);
    const yBlock = out.slice(yStart);

    // x has no override — inherits the common interaction
    expect(xBlock).toContain("target: '共通行き先'");

    // y overrides the common interaction (same action) — common is shadowed,
    // so only the variant-specific target should appear for y's state node.
    expect(yBlock).toContain("target: '専用行き先'");
    expect(yBlock).not.toContain("target: '共通行き先'");
  });

  it('shadowed common push does not register as a predecessor for back()', () => {
    const doc = parseOk(
      '# A\n> タップ(設定) -> push(共通行き先)\n## x\n> タップ(設定) -> push(設定画面)\n\n# 共通行き先\n> タップ(戻る) -> back()\n\n# 設定画面\n',
    );
    const out = toXState(doc);
    // A__x's specific push(設定画面) shadows the common push(共通行き先),
    // so 共通行き先 is never pushed to — its back() must not guard on A__x.
    const backStart = out.indexOf("'タップ(戻る)':");
    expect(backStart).toBeGreaterThanOrEqual(0);
    const backBlock = out.slice(backStart, out.indexOf('],', backStart));
    expect(backBlock).not.toContain("'A__x'");
  });
});

// ───── custom options ─────────────────────────────────────────────────

describe('options', () => {
  it('id option sets machine id', () => {
    const doc = parseOk('# A\n');
    const out = toXState(doc, { id: 'myApp' });
    expect(out).toContain("id: 'myApp'");
  });
});
