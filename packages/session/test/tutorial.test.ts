import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from '@shitae/parser';
import { Session } from '../src/index.js';

// Execute the actual published snippets, so the prose's expected paths cannot drift
// unnoticed from a separately copied fixture.
const source = readFileSync(new URL('../../../docs/TUTORIAL.md', import.meta.url), 'utf8');
const examples = [...source.matchAll(/```shitae\n([\s\S]*?)```/g)].map(m => m[1]!);
function make(step: number) {
  const parsed = parse(examples[step - 1]!);
  expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return new Session(new Map([['main', parsed.document]]), 'main');
}
function act(s: Session, name: string, choice?: number) {
  const action = s.query({ select: ['actions'] }).data!.actions!.items.find(a => a.actionText === name);
  expect(action, name).toBeDefined();
  return s.dispatch({ handle: action!.handle, ...(choice === undefined ? {} : { branch: action!.branches[choice]!.id }) });
}
const state = (s: Session) => s.query({ select: ['state'] }).data!.state!;
const location = (s: Session) => s.query().summary.location;
function detail(s: Session) { act(s, '詳細を開く'); act(s, '読込結果を試す', 0); }

describe('published introductory walkthrough', () => {
  it('contains five complete examples and returns to the list in step 1', () => {
    expect(examples).toHaveLength(5);
    const s = make(1); act(s, '詳細を開く');
    expect(location(s).component).toBe('詳細');
    act(s, '一覧へ戻る'); expect(location(s).component).toBe('一覧');
  });
  it('step 2 separates structural availability from chosen outcomes and reinitializes a new detail', () => {
    const s = make(2); act(s, '詳細を開く');
    const reserve = () => s.query({select:['actions']}).data!.actions!.items.find(a=>a.actionText==='予約する(予約ボタン?)');
    expect(reserve()?.enabled ?? false).toBe(false);
    act(s, '読込結果を試す', 1); expect(location(s).variant).toBe('読込失敗');
    act(s, '読み直す'); act(s, '読込結果を試す', 0);
    expect(location(s).variant).toBe('表示'); expect(reserve()?.enabled).toBe(true);
    act(s, '一覧へ戻る'); act(s, '詳細を開く'); expect(location(s).variant).toBe('読込中');
  });
  it('step 3 closes confirmation and its stacked receiver together, with a back barrier at entry', () => {
    const s = make(3); detail(s); act(s, '予約する(予約ボタン?)');
    expect(s.query({select:['actions']}).data!.actions!.controls.back.enabled).toBe(false);
    act(s, '受取を選ぶ'); act(s, '確認へ戻る'); expect(location(s).component).toBe('確認');
    act(s, '受取を選ぶ'); act(s, '取り消す');
    expect(location(s)).toMatchObject({component:'詳細',variant:'表示'});
    expect(state(s).frames).toHaveLength(1);
    act(s, '予約する(予約ボタン?)'); expect(location(s).component).toBe('確認');
  });
  it('step 4 resumes the named tab while retaining an inactive confirmation', () => {
    const s = make(4); act(s, '始める'); detail(s);
    act(s, '予約一覧へ'); act(s, '本を探す');
    expect(location(s)).toMatchObject({component:'詳細',variant:'表示'});
    act(s, '予約する(予約ボタン?)'); act(s, '受取を選ぶ'); act(s, '予約一覧へ'); act(s, '本を探す');
    expect(location(s).component).toBe('詳細');
    const q = state(s), confirmation = q.frames.find(f=>f.stack[0]!.component==='確認')!;
    expect(confirmation.stack.map(l=>l.component)).toEqual(['確認','受取']);
    expect(q.activePath).not.toContain(confirmation.id);
  });
  it('step 5 preserves shared state and notification after ending work, then hides only the notification', () => {
    const s = make(5); act(s, '始める'); detail(s); act(s, '予約する(予約ボタン?)'); act(s, '受取を選ぶ');
    act(s, '確定結果を試す', 1);
    expect(location(s).component).toBe('受取');
    expect(state(s).sharedVariants[0]!.variant).toBe('未予約'); expect(state(s).overlays).toEqual([]);
    act(s, '確定結果を試す', 0); expect(location(s).component).toBe('詳細');
    act(s, '予約一覧へ');
    expect(state(s).inclusion.main.children.find(c=>c.name==='予約')!.value!.variant).toBe('予約済');
    act(s, '閲覧を終了する'); expect(location(s).component).toBe('起動');
    expect(state(s).frames).toHaveLength(1);
    expect(state(s).sharedVariants[0]!.variant).toBe('予約済');
    expect(state(s).overlays.map(o=>o.component)).toEqual(['通知']);
    act(s, '通知を外す'); expect(state(s).overlays).toEqual([]);
    expect(state(s).sharedVariants[0]!.variant).toBe('予約済');
  });
});
