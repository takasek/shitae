import { describe, it, expect, vi } from 'vitest';
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
const details = (s: Session) => ({ ...actions(s), items: actions(s).items.map(a => {
  const detail = s.query({ select: ['action'], handle: a.handle }).data!.action!;
  if (!('definition' in detail)) throw new Error('Expected model action');
  return detail;
}) });

describe('Session first CLI slice', () => {
  it('resolves inventory once per revision across per-action detail reads', () => {
    const s = session(model);
    const resolution = vi.spyOn(s as unknown as { indexedResults: (...args: unknown[]) => unknown }, 'indexedResults');
    const list = actions(s);
    expect(resolution).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) s.query({ select: ['action'], handle: list.items[0]!.handle });
    expect(resolution).toHaveBeenCalledTimes(1);
    s.dispatch({ handle: list.items[0]!.handle, branch: list.items[0]!.branches[1]!.id });
    resolution.mockClear();
    const fresh = actions(s);
    expect(resolution).toHaveBeenCalledTimes(1);
    expect(s.query({ select: ['action'], handle: fresh.items[0]!.handle }).data!.action).toMatchObject({ host: { variant: 'Error' } });
    expect(resolution).toHaveBeenCalledTimes(1);
    s.reset(); resolution.mockClear();
    const reset = actions(s);
    expect(s.query({ select: ['action'], handle: reset.items[0]!.handle }).data!.action).toMatchObject({ host: { variant: 'Ready' } });
    expect(resolution).toHaveBeenCalledTimes(1);
  });

  it('lists only choice information; result text and definition paths do not inflate inventory', () => {
    const small = session(model), large = session(model.replace('preparation', 'large-output'.repeat(5000)));
    const a = actions(small), b = actions(large);
    expect(Object.keys(a.items[0]!).sort()).toEqual(['actionText', 'branches', 'enabled', 'handle', 'host', 'placement', 'scope']);
    expect(a.items[0]).toMatchObject({ actionText: 'Purchase', enabled: true, scope: 'component',
      host: { module: 'main', component: 'Confirm', variant: 'Ready' }, placement: { root: 'main', path: [] } });
    expect(Object.keys(a.items[0]!.placement).sort()).toEqual(['path', 'root']);
    expect(a.items[0]!.branches).toEqual([{ id: 'b0', label: 'Success' }, { id: 'b1', label: 'Failure' }]);
    expect(Object.keys(a.controls.back).sort()).toEqual(['enabled', 'handle']);
    expect(JSON.stringify(a).length).toBe(JSON.stringify(b).length);
    const before = small.query();
    const detail = small.query({ select: ['action'], handle: a.items[0]!.handle }).data!.action!;
    expect(detail).toMatchObject({ handle: a.items[0]!.handle, source: { file: '/model/main.shitae', span: { line: 2 } },
      prelude: [{ resultIndex: 0 }], branches: [{ id: 'b0', results: [{ resultIndex: 1 }, { resultIndex: 2 }] }, { id: 'b1', results: [{ resultIndex: 3 }] }],
      definition: { action: { text: 'Purchase' }, results: expect.arrayContaining([expect.objectContaining({ body: expect.objectContaining({ kind: 'effect', text: 'preparation' }) })]) } });
    expect(small.query()).toEqual(before);
    small.dispatch({ handle: a.items[0]!.handle, branch: a.items[0]!.branches[0]!.id });
    expect(small.query().summary.location.component).toBe('Done');
  });

  it('validates detailed lookup without changing counters, isolates returned definitions and rejects expired handles', () => {
    const s = session(model), a = actions(s).items[0]!, before = s.query({ select: ['state', 'actions', 'history'] });
    for (const options of [
      { select: ['action'] }, { select: ['actions'], handle: a.handle }, { handle: a.handle },
      { select: ['action'], handle: null as unknown as string },
    ]) expect(() => s.query(options)).toThrow('INVALID_REQUEST');
    for (const handle of ['unknown', actions(session(model)).items[0]!.handle, a.handle.replace(/:\d+$/, ':9999')])
      expect(() => s.query({ select: ['action'], handle })).toThrow('UNKNOWN_HANDLE');
    const detail = s.query({ select: ['action'], handle: a.handle }).data!.action!;
    if ('definition' in detail) detail.definition.results.length = 0;
    const again = s.query({ select: ['action'], handle: a.handle }).data!.action!;
    expect('definition' in again && again.definition.results.length).toBe(4);
    expect(s.query({ select: ['state', 'actions', 'history'] })).toEqual(before);
    const control = s.query({ select: ['action'], handle: actions(s).controls.back.handle }).data!.action!;
    expect(control).toMatchObject({ kind: 'control', source: null, enabled: false, reason: 'no-return-location' });
    expect(control).not.toHaveProperty('definition');
    const result = s.dispatch({ handle: a.handle, branch: a.branches[1]!.id });
    expect(result.receipt.operationId).toBe(1);
    expect(result.receipt.effects.map(e => e.text)).toEqual(['preparation']);
    expect(() => s.query({ select: ['action'], handle: a.handle })).toThrow('STALE_HANDLE');
    const fresh = actions(s).items[0]!.handle; s.reset();
    expect(() => s.query({ select: ['action'], handle: fresh })).toThrow('STALE_HANDLE');
  });

  it('lists branches and sources, executes only the selected branch sequentially, returns a compact receipt', () => {
    const s = session(model);
    const item = details(s).items[0]!;
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
    const item = details(s).items[0]!;
    const before = s.query();
    expect(() => s.dispatch({ handle: item.handle })).toThrow('BRANCH_REQUIRED');
    expect(() => s.dispatch({ handle: item.handle, branch: 'missing' })).toThrow('INVALID_BRANCH');
    expect(() => s.dispatch({ handle: 'unknown' })).toThrow('UNKNOWN_HANDLE');
    expect(() => s.dispatch({ handle: details(session(model)).items[0]!.handle })).toThrow('UNKNOWN_HANDLE');
    expect(s.query()).toEqual(before);
    const result = s.dispatch({ handle: item.handle, branch: item.branches[1]!.id });
    expect(result.receipt.operationId).toBe(1);
    expect(result.receipt.effects.map((e) => e.text)).toEqual(['preparation']);
    expect(result.summary.location.variant).toBe('Error');
    const after = s.query();
    expect(() => s.dispatch({ handle: item.handle, branch: item.branches[0]!.id })).toThrow('STALE_HANDLE');
    expect(s.query()).toEqual(after);
    expect(details(s).items[0]!.handle).not.toBe(item.handle);
  });

  it('query is detached, stable and validates selections; an unlabelled no-op updates revision but adds no observation', () => {
    const s = session('# A\n> Stay -> back()\n');
    const q = s.query(); q.summary.location.component = 'corrupted';
    const first = details(s);
    const handle = first.items[0]!.handle;
    first.items[0]!.branches.push({ id: 'fake', label: 'Fake', results: [] });
    expect(details(s).items[0]!.branches).toEqual([]);
    expect(details(s).items[0]!.handle).toBe(handle);
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
    const list = details(s).items;
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
    s.dispatch({ handle: details(s).items[0]!.handle });
    expect(s.query().summary.location).toEqual({ module: 'sub', component: 'B', variant: null });
    const result = s.dispatch({ handle: details(s).items[0]!.handle });
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
    const invoke = (text: string) => s.dispatch({ handle: details(s).items.find((i) => i.actionText === text)!.handle });
    invoke('A'); invoke('Detail'); invoke('B'); invoke('A');
    expect(s.query().summary.location.component).toBe('Detail');
    const back = details(s).controls.back;
    expect(back.enabled).toBe(true);
    s.dispatch({ handle: back.handle });
    expect(s.query().summary.location.component).toBe('A');
    const blocked = details(s).controls.back;
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
    const r = s.dispatch({ handle: details(s).items[0]!.handle });
    expect(r.receipt.changed).toEqual(expect.arrayContaining(['sharedVariants', 'overlays']));
    expect(r.receipt.diagnostics.map((d) => d.diagnostic.code)).toEqual(['R002']);
    expect(r.receipt.observations.count).toBe(3);
    expect(details(s).items.some((i) => i.actionText === 'Inspect' && i.placement.root === 'overlay:Badge')).toBe(true);
  });

  it('qualified outer references suppress the imported component action', () => {
    const s = session('import lib as x\n# Host\nx::Card\n> Tap(x::Card.button) -> outer\n', {
      lib: '# Card\nbutton\n> Tap(button) -> inner\n',
    });
    const list = details(s).items;
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
    const list = details(s).items;
    expect(list.map((i) => [i.source.module, i.host.component, i.actionText])).toEqual([
      ['main', 'Host', 'Tap(item.button)'], ['main', 'Other', 'Tap(button)'],
    ]);
    const result = s.dispatch({ handle: list[1]!.handle });
    expect(result.receipt.effects.map((e) => e.text)).toEqual(['other-inner']);
  });
});
