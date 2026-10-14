import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { Session } from '../src/index.js';

const model = `# Screen
a: Card
b: Card
badge: Badge
> choose -> pre-effect ; [yes] set(Badge##On) ; show(Badge) ; goto(##Changed)
> gate(badge.signal?) -> singleton-effect
> gate(a.signal?) -> ordinary-effect
> open -> push(Card##Ready)
> show -> show(Card##Ready)
> noop -> back(Screen)
## Start
## Changed
# Card
## Idle
label
## Ready
signal
#! Badge
## Off
## On
signal
`;
function make(source = model) {
  const p = parse(source); expect(p.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return new Session(new Map([['main', p.document]]), 'main');
}
const actions = (s: Session) => s.query({ select: ['actions'] }).data!.actions!;
const state = (s: Session) => s.query({ select: ['state'] }).data!.state!;
const history = (s: Session, options = {}) => s.query({ select: ['history'], history: options }).data!.history!;
const invoke = (s: Session, text: string, branch?: string) => {
  const a = actions(s).items.find((a) => a.action.text === text)!;
  return s.dispatch({ handle: a.handle, ...(branch ? { branch: a.branches.find((b) => b.label === branch)!.id } : {}) });
};

describe('Session snapshots, details and manual trials', () => {
  it('labels transition observations with the effective destination variant', () => {
    const s = make();
    invoke(s, 'choose', 'yes');
    expect(history(s).items.at(-1)!.label).toBe('goto → Screen / Changed');
    invoke(s, 'open');
    expect(history(s).items.at(-1)!.label).toBe('push → Card / Ready');
    const bare = make('# Home\n> Next -> push(Detail)\n# Detail\nx\n');
    invoke(bare, 'Next');
    expect(history(bare).items.at(-1)!.label).toBe('push → Detail');
  });

  it('separates shared manual/DSL origin, restores intermediate snapshots and never replays an effect on query/seek', () => {
    const s = make();
    s.setTestVariant({ module: 'main', component: 'Badge', variant: 'On' });
    expect(state(s).sharedVariants[0]).toMatchObject({ component: 'Badge', variant: 'On', scope: 'singleton-shared', origin: 'manual-test' });
    const manualId = s.query().summary.cursorObservationId;
    const r = invoke(s, 'choose', 'yes');
    expect(state(s).sharedVariants[0]!.origin).toBe('dsl');
    const h = history(s, { operationId: r.receipt.operationId, limit: 2 });
    expect(h.items).toHaveLength(2); expect(h.nextAfter).not.toBeNull();
    const more = history(s, { operationId: r.receipt.operationId, after: h.nextAfter!, limit: 2 });
    expect(more.items).toHaveLength(2); expect(more.nextAfter).toBeNull();
    const setId = h.items[1]!.id;
    const before = s.query(); const handle = actions(s).items[0]!.handle;
    const o = s.query({ select: ['observation'], observationId: setId }).data!.observation!;
    expect(o.view.location.variant).toBe('Start');
    expect(o.view.state.overlays).toEqual([]);
    expect(o.view.state.sharedVariants[0]!.origin).toBe('dsl');
    expect(o.view.actions.items.every((a) => !('handle' in a))).toBe(true);
    expect(o.view.actions.controls.back).not.toHaveProperty('handle');
    expect(s.query()).toEqual(before); expect(actions(s).items[0]!.handle).toBe(handle);
    const old = actions(s).items[0]!.handle;
    s.seek(manualId);
    expect(state(s).sharedVariants[0]!.origin).toBe('manual-test');
    expect(history(s).items.filter((i) => i.ghost)).toHaveLength(4);
    expect(() => s.dispatch({ handle: old })).toThrow('STALE_HANDLE');
    s.seek(r.receipt.observations.lastId!);
    expect(state(s).sharedVariants[0]!.origin).toBe('dsl');
    expect(s.query().summary.location.variant).toBe('Changed');
    s.reset();
    expect(history(s).items).toHaveLength(1);
    expect(state(s).sharedVariants[0]).toMatchObject({ variant: 'Off', origin: 'initial' });
    expect(() => s.query({ select: ['observation'], observationId: setId })).toThrow('UNKNOWN_OBSERVATION');
    expect(s.query().summary.cursorObservationId).toBeGreaterThan(r.receipt.observations.lastId!);
  });

  it('regular component trials affect both inclusions and member gates but not frame/overlay actual values', () => {
    const s = make();
    invoke(s, 'show');
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' });
    const a = actions(s).items.find((i) => i.action.text === 'gate' && i.action.target?.name === 'a')!;
    expect(a).toMatchObject({ enabled: true, gate: { value: { variant: 'Ready', scope: 'component-test', origin: 'manual-test' } } });
    const tree = state(s).inclusion.main.children;
    for (const node of tree.filter((n) => n.reference?.component === 'Card')) {
      expect(node.value).toMatchObject({ variant: 'Ready', scope: 'component-test', origin: 'manual-test', singleton: false });
    }
    expect(state(s).overlays[0]).toMatchObject({ component: 'Card', variant: 'Ready', scope: 'overlay-entry', origin: 'dsl' });
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Idle' });
    expect(state(s).overlays[0]!.variant).toBe('Ready');
    expect(actions(s).items.find((i) => i.action.text === 'gate' && i.action.target?.name === 'a')!.enabled).toBe(false);
    invoke(s, 'open');
    expect(state(s).frames.at(-1)!.stack.at(-1)).toMatchObject({ component: 'Card', variant: 'Ready', scope: 'frame-location', origin: 'dsl' });
    expect(state(s).testVariants[0]!.variant).toBe('Idle');
  });

  it('invalid queries/manual commands/seek are fully unchanged; no-op/rejection retain ghosts and new events discard them', () => {
    const s = make(); const initial = s.query().summary.cursorObservationId;
    const r = invoke(s, 'choose', 'yes'); s.seek(initial);
    const before = s.query({ select: ['state', 'actions', 'history'] });
    for (const f of [
      () => s.seek(999), () => s.setTestVariant({ module: 'main', component: 'Card', variant: 'Missing' }),
      () => s.setTestVariant({ module: 'main', component: 'Screen', variant: 'Changed' }),
      () => s.query({ select: ['history'], history: { limit: 0 } }),
      () => s.query({ select: ['history'], history: { limit: null as unknown as number } }),
      () => s.query({ select: ['history'], history: { after: 999 } }),
      () => s.query({ select: ['observation'] }),
    ]) { expect(f).toThrow(); expect(s.query({ select: ['state', 'actions', 'history'] })).toEqual(before); }
    invoke(s, 'noop');
    expect(history(s).items).toHaveLength(5);
    expect(history(s).items.filter((i) => i.ghost)).toHaveLength(4);
    expect(history(s, { operationId: 999 }).items).toEqual([]);
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Idle' });
    expect(history(s).items).toHaveLength(2);
    expect(history(s).items[1]!.id).toBeGreaterThan(r.receipt.observations.lastId!);
    expect(() => s.seek(r.receipt.observations.lastId!)).toThrow('UNKNOWN_OBSERVATION');
  });

  it('projects inline/unresolved/cycle/undefined variants faithfully and queries are detached', () => {
    const s = make('# Host\n## Ready\nbox: { child: Card; missing: Missing }\n# Card\nloop: Card\n> Go -> goto(Host##Unknown)\n');
    const tree = state(s).inclusion.main.children[0]!;
    expect(tree.kind).toBe('inline'); expect(tree).not.toHaveProperty('value');
    expect(tree.children[1]!.kind).toBe('unresolved'); expect(tree.children[1]).not.toHaveProperty('value');
    expect(tree.children[0]!.children[0]!.cycle).toBe(true);
    invoke(s, 'Go'); expect(s.query().summary.location.variant).toBe('Unknown');
    const q = state(s); q.frames[0]!.stack[0]!.variant = 'corrupted';
    expect(state(s).frames[0]!.stack[0]!.variant).toBe('Unknown');
  });

  it('keeps a bare overlay initial origin consistent in live and saved inclusion views', () => {
    const s = make('# Host\n> Show -> show(Card)\n# Card\n## Idle\nx\n');
    const r = invoke(s, 'Show');
    for (const view of [state(s), s.query({ select: ['observation'], observationId: r.receipt.observations.lastId! }).data!.observation!.view.state]) {
      expect(view.overlays[0]).toMatchObject({ variant: 'Idle', origin: 'initial' });
      expect(view.inclusion.overlays[0]).toMatchObject({ variant: 'Idle', origin: 'initial' });
    }
  });
});
