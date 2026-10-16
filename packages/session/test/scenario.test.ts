import { describe, it, expect, vi } from 'vitest';
import { parse } from '@shitae/parser';
import { Session, replayScenario } from '../src/index.js';
import { createMetadata } from '../src/model.js';

const MODEL = `# Screen
a: Card
b: Card
badge: Badge
> Choose -> pre-effect ; [yes] set(Badge##On) ; show(Card##Ready) ; goto(##Changed)
> Check(a.signal?) -> ordinary-effect
> Check(badge.signal?) -> singleton-effect
> Noop -> back(Screen)
> Open -> push(Card##Ready)
## Start
## Changed
# Card
> Home -> back()
## Idle
label
## Ready
signal
#! Badge
## Off
## On
signal
`;
function prepared(source = MODEL, reverse = false, directory = '/one', engine?: string) {
  const docs = new Map([['main', source], ['other', '# Extra\nx\n']].map(([name, text]) => {
    const p = parse(text!); expect(p.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    return [name!, p.document] as const;
  }));
  const documents = reverse ? new Map([...docs].reverse()) : docs;
  const files = new Map([...documents.keys()].map(k => [k, `${directory}/${k}.shitae`]));
  const bytes = new Map([['main', new TextEncoder().encode(source)], ['other', new TextEncoder().encode('# Extra\nx\n')]]);
  return { documents, entryModule: 'main', files, metadata: createMetadata(documents, 'main', files, bytes, engine) };
}
const make = (p = prepared()) => new Session(p.documents, p.entryModule, p.files, p.metadata);
function invoke(s: Session, text: string, label?: string, path?: number[]) {
  const a = s.query({ select: ['actions'] }).data!.actions!.items.find(a => a.actionText === text && (!path || JSON.stringify(a.placement.path) === JSON.stringify(path)))!;
  return s.dispatch({ handle: a.handle, ...(label ? { branch: a.branches.find(b => b.label === label)!.id } : {}) });
}
const state = (s: Session) => s.query({ select: ['state'] }).data!.state!;
const clone = <T>(x: T): T => structuredClone(x);

describe('versioned scenario journal', () => {
  it('explains actual identity differences before full details and retains both complete identities', async () => {
    const saved = await make().exportScenario();
    const cases: Array<[ReturnType<typeof prepared>, string[]]> = [];
    const engine = prepared(MODEL, false, '/one', 'different-engine');
    cases.push([engine, ['処理系が異なります', 'モデルは未照合']]);
    const entry = prepared(); entry.metadata.entryModule = entry.entryModule = 'other';
    cases.push([entry, ['エントリが異なります: main → other']]);
    const modules = prepared(); modules.metadata.manifest = modules.metadata.manifest.filter(m => m.module !== 'other');
    modules.metadata.manifest.push({ module: 'added', sourceSha256: 'c'.repeat(64), file: null });
    cases.push([modules, ['現在のモデルで追加されたmodule: added', '現在のモデルで不足するmodule: other']]);
    const reference = prepared(); reference.metadata.manifest.find(m => m.module === 'other')!.sourceSha256 = 'b'.repeat(64);
    cases.push([reference, ['source bytesが異なるmodule: other']]);
    cases.push([prepared(MODEL + ' \n'), ['source bytesが異なるmodule: main', '空白・コメントも照合対象']]);
    for (const [p, reasons] of cases) {
      let error: any;
      try { await replayScenario(p, saved); } catch (e) { error = e; }
      expect(error).toBeDefined();
      expect(error.code).toBe(p === engine ? 'ENGINE_MISMATCH' : 'MODEL_MISMATCH');
      for (const reason of reasons) expect(error.message).toContain(reason);
      expect(error.message.indexOf('次の行動')).toBeLessThan(error.message.indexOf('Expected'));
      expect(error.message).toContain('完全一致する保存時のHTML');
      expect(error.message).toContain('元モデル一式と処理系');
      expect(error.message).toContain('新しく記録');
      expect(error.diagnostic.expected).toEqual(saved.model);
      expect(error.diagnostic.actual.engineVersion).toBe(p.metadata.engineVersion);
      expect(error.diagnostic.actual.manifest).toEqual(p.metadata.manifest.map(({ module, sourceSha256 }) => ({ module, sourceSha256 })).sort((a, b) => a.module.localeCompare(b.module)));
      expect(error.diagnostic.modelChecked).toBe(p !== engine);
    }
  });

  it('replays branches, trial scope/origin, mid-result seek, ghost branching, reset and accepted no-op', async () => {
    const s = make();
    s.setTestVariant({ module: 'main', component: 'Badge', variant: 'On' });
    const chosen = invoke(s, 'Choose', 'yes');
    const events = s.query({ select: ['history'], history: { operationId: chosen.receipt.operationId } }).data!.history!.items;
    s.seek(events[1]!.id); // set has happened, overlay/goto have not.
    expect(state(s).sharedVariants.find(c => c.component === 'Badge')).toMatchObject({ variant: 'On', origin: 'dsl' });
    expect(state(s).overlays).toEqual([]);
    const beforeNoop = s.query().summary;
    invoke(s, 'Noop');
    expect(s.query().summary).toEqual(beforeNoop);
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' });
    expect(() => s.seek(events.at(-1)!.id)).toThrow('UNKNOWN_OBSERVATION');
    invoke(s, 'Choose', 'yes');
    s.reset();
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' });
    invoke(s, 'Choose', 'yes');
    s.seek(s.query().summary.cursorObservationId - 1); // final cursor is before goto, future remains ghost.
    const saved = await s.exportScenario();
    expect(saved.steps.map(x => x.command.kind)).toEqual(['setTestVariant', 'dispatch', 'seek', 'dispatch', 'setTestVariant', 'dispatch', 'reset', 'setTestVariant', 'dispatch', 'seek']);
    expect(saved.steps[1]!.output!.effects.map(e => e.text)).toEqual(['pre-effect']);
    expect(saved.steps[3]!.observations).toEqual([]);
    expect(saved.steps[1]!.command).toMatchObject({ kind: 'dispatch', branch: { label: 'yes' } });
    const text = JSON.stringify(saved);
    expect(text).not.toContain('/one/');
    expect(text).not.toContain('handle');
    expect(text).not.toContain('observationId');
    const replayed = await replayScenario(prepared(MODEL, true, '/two'), JSON.parse(text));
    expect(replayed.query().summary.location).toEqual(s.query().summary.location);
    expect(state(replayed).testVariants).toMatchObject([{ component: 'Card', variant: 'Ready', origin: 'manual-test' }]);
    expect(await replayed.exportScenario()).toEqual(saved);
    const old = s.query({ select: ['actions'] }).data!.actions!.items[0]!.handle;
    expect(() => replayed.dispatch({ handle: old })).toThrow('UNKNOWN_HANDLE');
    invoke(replayed, 'Open');
    expect((await replayed.exportScenario()).steps).toHaveLength(saved.steps.length + 1);
  });

  it('does not record queries, export or rejected commands; saved values are detached', async () => {
    const s = make(); const before = await s.exportScenario();
    s.query({ select: ['state', 'actions', 'metadata', 'history'] });
    expect(() => invoke(s, 'Choose')).toThrow('BRANCH_REQUIRED');
    expect(() => s.setTestVariant({ module: 'main', component: 'Card', variant: 'Missing' })).toThrow();
    expect(() => s.seek(999)).toThrow();
    expect(await s.exportScenario()).toEqual(before);
    const a = await s.exportScenario(); a.steps.push({} as never);
    expect(await s.exportScenario()).toEqual(before);
    expect(await (await replayScenario(prepared(MODEL, true, '/moved'), before)).exportScenario()).toEqual(before);
  });

  it('distinguishes repeated placements and built-in back from DSL back', async () => {
    const p = prepared('# Host\none: Card\ntwo: Card\n> Open -> push(Card)\n# Card\n> Tap -> tapped\n> Back -> back()\n');
    const s = make(p); invoke(s, 'Tap', undefined, [1]); invoke(s, 'Open');
    s.dispatch({ handle: s.query({ select: ['actions'] }).data!.actions!.controls.back.handle });
    const saved = await s.exportScenario();
    expect(saved.steps[0]!.command).toMatchObject({ operation: { placement: { path: [1] } } });
    expect(saved.steps[2]!.command).toMatchObject({ operation: { kind: 'control', name: 'back' } });
    expect(await (await replayScenario(p, saved)).exportScenario()).toEqual(saved);
  });

  it('refuses metadata-less/AST-only exports and mismatched engine or any source byte before replay', async () => {
    const p = prepared(); const saved = await make(p).exportScenario();
    await expect(new Session(p.documents, 'main').exportScenario()).rejects.toThrow('SCENARIO_UNSUPPORTED');
    await expect(new Session(p.documents, 'main', p.files, createMetadata(p.documents, 'main')).exportScenario()).rejects.toThrow('SCENARIO_UNSUPPORTED');
    await expect(replayScenario(prepared(MODEL, false, '/one', 'other-engine'), saved)).rejects.toThrow('ENGINE_MISMATCH');
    await expect(replayScenario(prepared(MODEL + '// one byte change\n'), saved)).rejects.toThrow('MODEL_MISMATCH');
    const q = prepared(); q.metadata.manifest[1]!.sourceSha256 = 'a'.repeat(64);
    await expect(replayScenario(q, saved)).rejects.toThrow('MODEL_MISMATCH');
  });

  it('rejects malformed/unknown schema and never repairs a missing action/branch', async () => {
    const p = prepared(); const s = make(p); invoke(s, 'Choose', 'yes');
    const saved = await s.exportScenario();
    for (const mutation of [
      (x: any) => { x.formatVersion = 2; },
      (x: any) => { x.extra = true; },
      (x: any) => { x.steps[0].command.extra = true; },
      (x: any) => { delete x.steps[0].output; },
      (x: any) => { x.steps[0].step = 3; },
    ]) { const bad = clone(saved); mutation(bad); await expect(replayScenario(p, bad)).rejects.toThrow('SCENARIO_FORMAT'); }
    const action = clone(saved); (action.steps[0]!.command as any).operation.source.span.offset++;
    await expect(replayScenario(p, action)).rejects.toThrow('ACTION_MISMATCH');
    const branch = clone(saved); (branch.steps[0]!.command as any).branch.label = 'other';
    await expect(replayScenario(p, branch)).rejects.toThrow('BRANCH_MISMATCH');
    const absent = clone(saved); (absent.steps[0]!.command as any).branch = null;
    await expect(replayScenario(p, absent)).rejects.toThrow('BRANCH_MISMATCH');
  });

  it('rejects the first altered intermediate/output/checkpoint even when the final location matches', async () => {
    const s = make(); invoke(s, 'Choose', 'yes'); s.reset();
    const saved = await s.exportScenario();
    for (const mutation of [
      (x: any) => { x.steps[0].observations[0].viewDigest = '0'.repeat(64); },
      (x: any) => { x.steps[0].output.effects[0].text = 'other'; },
      (x: any) => { x.steps[0].afterDigest = '0'.repeat(64); },
      (x: any) => { x.final.digest = '0'.repeat(64); },
    ]) { const bad = clone(saved); mutation(bad); await expect(replayScenario(prepared(), bad)).rejects.toThrow(/SCENARIO_(RESULT|FINAL)_MISMATCH/); }
    const expected = await s.exportScenario();
    expect(expected).toEqual(saved);
  });

  it('validates the complete final projection before executing any saved command', async () => {
    const s = make(); invoke(s, 'Choose', 'yes'); const saved = await s.exportScenario();
    for (const mutate of [
      (x: any) => { x.final.view = {}; },
      (x: any) => { x.final.view.extra = true; },
      (x: any) => { x.final.view.view.state.frames[0].stack[0].extra = true; },
      (x: any) => { delete x.final.view.view.actions.items[0].operation.host; },
      (x: any) => { delete x.final.view.view.state.inclusion.main.children[0].reference; },
      (x: any) => { delete x.final.view.view.state.inclusion.main.children[0].componentSource; },
      (x: any) => { delete x.final.view.view.state.inclusion.main.children[0].value; },
      (x: any) => { x.final.view.view.state.inclusion.main.children[0].kind = 'inline'; },
      (x: any) => { delete x.final.view.view.actions.items.find((a: any) => a.gate?.targetComponent).gate.value; },
      (x: any) => { delete x.final.view.view.actions.items.find((a: any) => a.gate?.targetComponent).gate.module; },
    ]) {
      const bad = clone(saved); mutate(bad);
      const dispatch = vi.spyOn(Session.prototype, 'dispatch');
      try { await expect(replayScenario(prepared(), bad)).rejects.toThrow('SCENARIO_FORMAT'); expect(dispatch).not.toHaveBeenCalled(); }
      finally { dispatch.mockRestore(); }
    }
  });

  it('fails export explicitly when recording hashes fail instead of saving a partial journal', async () => {
    const hash = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('injected hash failure'));
    try { const s = make(); invoke(s, 'Choose', 'yes'); await expect(s.exportScenario()).rejects.toThrow('SCENARIO_RECORDING'); }
    finally { hash.mockRestore(); }
  });

  it('reports the first differing path with its actual expected and replayed values', async () => {
    const s = make(); invoke(s, 'Choose', 'yes'); const saved = await s.exportScenario();
    for (const [mutate, path] of [
      [(x: any) => { x.steps[0].output.effects[0].text = 'changed'; }, 'output.effects[0].text'],
      [(x: any) => { x.steps[0].observations[0].viewDigest = '0'.repeat(64); }, 'observations[0].viewDigest'],
      [(x: any) => { x.final.view.view.location.variant = 'Elsewhere'; }, 'final.view.view.location.variant'],
    ] as const) {
      const bad = clone(saved); mutate(bad);
      try { await replayScenario(prepared(), bad); throw new Error('Expected failure'); }
      catch (e) {
        expect((e as Error).message).toContain(path);
        expect((e as Error).message).toMatch(/expected .+; actual .+/);
      }
    }
  });

  it('rejects seek references into discarded ghosts/reset epochs and forward/no-observation steps', async () => {
    const s = make(); const r = invoke(s, 'Choose', 'yes'); s.seek(1); invoke(s, 'Noop');
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' }); s.seek(s.query().summary.cursorObservationId);
    const saved = await s.exportScenario();
    for (const target of [{ step: 1, observation: 3 }, { step: 3, observation: 0 }, { step: 99, observation: 0 }]) {
      const bad = clone(saved); (bad.steps.at(-1)!.command as any).target = target;
      await expect(replayScenario(prepared(), bad)).rejects.toThrow('SCENARIO_REFERENCE');
    }
    expect(r.receipt.observations.count).toBe(4);
    s.reset(); s.seek(s.query().summary.cursorObservationId);
    const reset = await s.exportScenario(); (reset.steps.at(-1)!.command as any).target = { step: 0, observation: 0 };
    await expect(replayScenario(prepared(), reset)).rejects.toThrow('SCENARIO_REFERENCE');
  });
});
