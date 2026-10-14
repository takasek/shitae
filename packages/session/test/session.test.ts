import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { Session } from '../src/index.js';

function session(source: string, extras: Record<string, string> = {}) {
  const docs = new Map(Object.entries({ main: source, ...extras }).map(([name, text]) => {
    const parsed = parse(text);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    return [name, parsed.document] as const;
  }));
  return new Session(docs, 'main', new Map([['main', '/model/main.shitae']]));
}
const model = `# Confirm
> Purchase -> preparation ; [Success] paid ; goto(Done) ; [Failure] goto(##Error)
## Ready
button
## Error
problem
# Done
receipt
`;
const actions = (s: Session) => s.query({ select: ['actions'] }).data!.actions!;

describe('Session first CLI slice', () => {
  it('lists branches and sources, executes only the selected branch sequentially, returns a compact receipt', () => {
    const s = session(model);
    const item = actions(s).items[0]!;
    expect(s.query()).toEqual({ revision: 0, summary: {
      location: { module: 'main', component: 'Confirm', variant: 'Ready' },
      cursorObservationId: 1, latestObservationId: 1, observationCount: 1,
    } });
    expect(item.actionText).toBe('Purchase');
    expect(item.branches.map((b) => b.label)).toEqual(['Success', 'Failure']);
    expect(item.source).toMatchObject({ module: 'main', file: '/model/main.shitae', span: { line: 2 } });
    const r = s.dispatch({ handle: item.handle, branch: item.branches[0]!.id });
    expect(r.summary.location).toEqual({ module: 'main', component: 'Done', variant: null });
    expect(r.revision).toBe(1);
    expect(r.receipt.effects.map((e) => e.text)).toEqual(['preparation', 'paid']);
    expect(r.receipt.effects.map((e) => e.resultIndex)).toEqual([0, 1]);
    expect(r.receipt.observations).toEqual({ count: 3, firstId: 2, lastId: 4 });
    expect(r.receipt.changed).toContain('frames');
    expect(r).not.toHaveProperty('data');
    expect(r.receipt).not.toHaveProperty('view');
    expect(s.query().summary).toEqual(r.summary);
  });

  it('rejects missing/invalid branch before prelude, stale/unknown/foreign handles without changing state or counters', () => {
    const s = session(model);
    const item = actions(s).items[0]!;
    const before = s.query();
    expect(() => s.dispatch({ handle: item.handle })).toThrow('BRANCH_REQUIRED');
    expect(() => s.dispatch({ handle: item.handle, branch: 'missing' })).toThrow('INVALID_BRANCH');
    expect(() => s.dispatch({ handle: 'unknown' })).toThrow('UNKNOWN_HANDLE');
    expect(() => s.dispatch({ handle: actions(session(model)).items[0]!.handle })).toThrow('UNKNOWN_HANDLE');
    expect(s.query()).toEqual(before);
    const result = s.dispatch({ handle: item.handle, branch: item.branches[1]!.id });
    expect(result.receipt.operationId).toBe(1);
    expect(result.receipt.effects.map((e) => e.text)).toEqual(['preparation']);
    expect(result.summary.location.variant).toBe('Error');
    const after = s.query();
    expect(() => s.dispatch({ handle: item.handle, branch: item.branches[0]!.id })).toThrow('STALE_HANDLE');
    expect(s.query()).toEqual(after);
    expect(actions(s).items[0]!.handle).not.toBe(item.handle);
  });

  it('query is detached, stable and validates selections; an unlabelled no-op updates revision but adds no observation', () => {
    const s = session('# A\n> Stay -> back()\n');
    const q = s.query(); q.summary.location.component = 'corrupted';
    const first = actions(s);
    const handle = first.items[0]!.handle;
    first.items[0]!.branches.push({ id: 'fake', label: 'Fake', results: [] });
    expect(actions(s).items[0]!.branches).toEqual([]);
    expect(actions(s).items[0]!.handle).toBe(handle);
    expect(() => s.dispatch({ handle, branch: 'fake' })).toThrow('INVALID_BRANCH');
    expect(() => s.query({ select: ['unknown'] })).toThrow('INVALID_REQUEST');
    expect(() => s.query({ select: ['actions', 'actions'] })).toThrow('INVALID_REQUEST');
    const result = s.dispatch({ handle });
    expect(result.summary.location.component).toBe('A');
    expect(result.revision).toBe(1);
    expect(result.receipt.observations).toEqual({ count: 0, firstId: null, lastId: null });
    expect(result.receipt.changed).toEqual([]);
    expect(result.receipt.diagnostics).toEqual([]);
  });

  it('uses variant > component > document shadow and gates before any effect', () => {
    const s = session(`> Go -> document
# A
> Go -> component
> Hidden(absent?) -> forbidden
## Ready
> Go -> specific
`);
    const list = actions(s).items;
    expect(list.filter((i) => i.actionText === 'Go')).toHaveLength(1);
    expect(list.find((i) => i.actionText === 'Go')!.scope).toBe('variant');
    const blocked = list.find((i) => i.action.text === 'Hidden')!;
    expect(blocked.enabled).toBe(false);
    const before = s.query();
    expect(() => s.dispatch({ handle: blocked.handle })).toThrow('DISABLED_ACTION');
    expect(s.query()).toEqual(before);
  });

  it('resolves imported result targets lexically while bare variants use the new active location', () => {
    const s = session('import sub as x\n# A\n> Go -> push(x::B)\n', {
      sub: '# B\n> Next -> push(C) ; goto(##Changed)\n# C\n## Initial\nx\n## Changed\ny\n',
    });
    s.dispatch({ handle: actions(s).items[0]!.handle });
    expect(s.query().summary.location).toEqual({ module: 'sub', component: 'B', variant: null });
    const result = s.dispatch({ handle: actions(s).items[0]!.handle });
    expect(result.summary.location).toEqual({ module: 'sub', component: 'C', variant: 'Changed' });
    expect(result.receipt.observations.count).toBe(2);
  });

  it('retains push positions through switches and supports the built-in back control', () => {
    const s = session(`> A -> switch(A, @a)
> B -> switch(B, @b)
# Entry
# A
> Detail -> push(Detail)
# B
# Detail
detail
`);
    const invoke = (text: string) => s.dispatch({ handle: actions(s).items.find((i) => i.actionText === text)!.handle });
    invoke('A'); invoke('Detail'); invoke('B'); invoke('A');
    expect(s.query().summary.location.component).toBe('Detail');
    const back = actions(s).controls.back;
    expect(back.enabled).toBe(true);
    s.dispatch({ handle: back.handle });
    expect(s.query().summary.location.component).toBe('A');
    const blocked = actions(s).controls.back;
    expect(blocked.enabled).toBe(false);
    expect(() => s.dispatch({ handle: blocked.handle })).toThrow('DISABLED_ACTION');
  });

  it('singleton set and overlay effects reuse runtime and report diagnostics as current-operation output', () => {
    const s = session(`# A
> Go -> set(Badge##On) ; show(Badge) ; exit(@missing)
#! Badge
## Off
x
## On
y
> Inspect -> visible
`);
    const r = s.dispatch({ handle: actions(s).items[0]!.handle });
    expect(r.receipt.changed).toEqual(expect.arrayContaining(['sharedVariants', 'overlays']));
    expect(r.receipt.diagnostics.map((d) => d.diagnostic.code)).toEqual(['R002']);
    expect(r.receipt.observations.count).toBe(3);
    expect(actions(s).items.some((i) => i.actionText === 'Inspect' && i.placement.root === 'overlay:Badge')).toBe(true);
  });

  it('qualified outer references suppress the imported component action', () => {
    const s = session('import lib as x\n# Host\nx::Card\n> Tap(x::Card.button) -> outer\n', {
      lib: '# Card\nbutton\n> Tap(button) -> inner\n',
    });
    const list = actions(s).items;
    expect(list.map((i) => [i.source.module, i.actionText])).toEqual([['main', 'Tap(x::Card.button)']]);
    const result = s.dispatch({ handle: list[0]!.handle });
    expect(result.receipt.effects.map((e) => e.text)).toEqual(['outer']);
  });

  it('outer alias binding stays in its declaration body when another variant has the same alias', () => {
    const s = session(`# Host
item: Card
> Tap(item.button) -> outer
## Ready
item: Other
# Card
button
> Tap(button) -> card-inner
# Other
button
> Tap(button) -> other-inner
`);
    const list = actions(s).items;
    expect(list.map((i) => [i.source.module, i.host.component, i.actionText])).toEqual([
      ['main', 'Host', 'Tap(item.button)'], ['main', 'Other', 'Tap(button)'],
    ]);
    const result = s.dispatch({ handle: list[1]!.handle });
    expect(result.receipt.effects.map((e) => e.text)).toEqual(['other-inner']);
  });
});
