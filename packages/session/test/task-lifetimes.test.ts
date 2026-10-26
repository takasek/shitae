import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from '@shitae/parser';
import { Session } from '../src/index.js';

// Exercise the published example itself, including the one-word counterexample.
const markdown = readFileSync(new URL('../../../docs/design/task-lifetimes.md', import.meta.url), 'utf8');
const source = markdown.match(/```shitae\n([\s\S]*?)```/)![1]!;
function make(present = false) {
  const parsed = parse(present ? source.replace('switch(在庫, @inventory)', 'present(在庫, @inventory)') : source);
  expect(parsed.diagnostics).toEqual([]);
  return new Session(new Map([['main', parsed.document]]), 'main');
}
function act(s: Session, name: string, label?: string) {
  const a = s.query({ select: ['actions'] }).data!.actions!.items.find(a => a.actionText.split('(')[0] === name)!;
  expect(a, name).toBeDefined();
  expect(a.enabled, name).toBe(true);
  return s.dispatch({ handle: a.handle, ...(label ? { branch: a.branches.find(b => b.label === label)!.id } : {}) });
}
const state = (s: Session) => s.query({ select: ['state'] }).data!.state!;
const value = (s: Session, component: string) => state(s).sharedVariants.find(v => v.component === component)!.variant;
const frame = (s: Session, name: string) => state(s).frames.find(f => f.beginsSession?.name === name)!;
function deep(s: Session) {
  act(s, '始める'); act(s, '下書きを始める'); act(s, '証跡を調べる'); act(s, '証跡確認を試す', '失敗');
  act(s, '貸出窓口タブへ');
}

describe('published task lifetime example', () => {
  it('resumes the deepest failed work and remotely cancels only the draft subtree', () => {
    const s = make(); deep(s);
    expect(frame(s, 'loans').parentId).toBe(frame(s, 'inventory').parentId);
    expect(frame(s, 'draft').parentId).toBe(frame(s, 'inventory').id);
    expect(frame(s, 'evidence').parentId).toBe(frame(s, 'draft').id);
    expect(value(s, '再開先')).toBe('証跡');
    act(s, '証跡を再開');
    expect(s.query().summary.location).toMatchObject({ component: '証跡', variant: '失敗' });
    act(s, '在庫タブへ'); expect(s.query().summary.location.component).toBe('在庫');
    expect(frame(s, 'evidence')).toBeDefined();
    act(s, '貸出窓口タブへ'); act(s, '下書きを取り消す');
    expect(s.query().summary.location.component).toBe('貸出窓口');
    expect(frame(s, 'loans')).toBeDefined();
    expect(frame(s, 'draft')).toBeUndefined(); expect(frame(s, 'evidence')).toBeUndefined();
    expect(value(s, '再開先')).toBe('なし'); expect(value(s, '確定状態')).toBe('未確定');
    act(s, '在庫タブへ'); act(s, '下書きを始める');
    expect(s.query().summary.location).toMatchObject({ component: '下書き', variant: '編集中' });
    expect(value(s, '再開先')).toBe('下書き');
  });

  it('detects the present-entry counterexample that also destroys the loans tab', () => {
    const s = make(true); deep(s);
    expect(frame(s, 'loans').parentId).toBe(frame(s, 'evidence').id);
    act(s, '下書きを取り消す');
    expect(s.query().summary.location.component).toBe('在庫');
    expect(frame(s, 'loans')).toBeUndefined();
    expect(value(s, '再開先')).toBe('なし');
  });

  it('keeps the index in sync through return, failure, success and local cancellation', () => {
    const s = make(); deep(s); act(s, '証跡を再開'); act(s, '下書きへ戻る');
    expect(frame(s, 'evidence')).toBeUndefined(); expect(value(s, '再開先')).toBe('下書き');
    act(s, '確定を試す', '失敗');
    expect(s.query().summary.location.variant).toBe('失敗'); expect(value(s, '再開先')).toBe('下書き');
    expect(value(s, '確定状態')).toBe('未確定');
    act(s, '貸出窓口タブへ'); act(s, '下書きを再開');
    expect(s.query().summary.location.variant).toBe('失敗');
    act(s, '確定を試す', '成功');
    expect(frame(s, 'draft')).toBeUndefined(); expect(value(s, '再開先')).toBe('なし');
    expect(value(s, '確定状態')).toBe('確定済');
    act(s, '下書きを始める'); act(s, '証跡を調べる'); act(s, '下書きを取り消す');
    expect(frame(s, 'draft')).toBeUndefined(); expect(frame(s, 'evidence')).toBeUndefined();
    expect(value(s, '再開先')).toBe('なし'); expect(value(s, '確定状態')).toBe('確定済');
  });
});
