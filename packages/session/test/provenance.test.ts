import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { createMetadata } from '../src/model.js';
import { Session, replayScenario } from '../src/index.js';

const source = '# Home\ncard: Card\n> Choose -> before ; [ok] show(Card##Ready) ; goto(##Changed)\n> Noop -> back(Home)\n> Check(card.signal?) -> checked\n## Start\n## Changed\n# Card\n## Idle\nx\n## Ready\nsignal\n';
function prepare(text = source) {
  const p = parse(text); expect(p.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const documents = new Map([['main', p.document]]), files = new Map([['main', '/model/main.shitae']]);
  return { documents, files, entryModule: 'main', metadata: createMetadata(documents, 'main', files, new Map([['main', new TextEncoder().encode(text)]])) };
}
function make(text = source) { const p = prepare(text); return new Session(p.documents, p.entryModule, p.files, p.metadata); }
function invoke(s: Session, text: string, branch?: string) {
  const a = s.query({ select: ['actions'] }).data!.actions!.items.find(a => a.actionText === text)!;
  return s.dispatch({ handle: a.handle, ...(branch ? { branch: a.branches.find(b => b.label === branch)!.id } : {}) });
}
// The query contract is asserted before the implementation exists.
const detail = (s: Session, step: number): any => (s.query({ select: ['provenanceStep'], step } as any).data as any).provenanceStep;
const summary = (s: Session): any => (s.query({ select: ['provenanceSummary'] }).data as any).provenanceSummary;
const review = (s: Session): any => (s.query({ select: ['review'] }).data as any).review;

describe('read-only journal provenance', () => {
  it('captures operation, condition, ordered results and journal observation references without changing execution projections', async () => {
    const s = make(); invoke(s, 'Choose', 'ok');
    const before = s.query({ select: ['state', 'actions', 'history'] }), exported = await s.exportScenario();
    const d = detail(s, 1);
    expect(d).toMatchObject({ step: 1, kind: 'dispatch', actionText: 'Choose', branch: 'ok', host: { module: 'main', component: 'Home', variant: 'Start' }, placement: { root: 'main', path: [] } });
    expect(d.results.map((r: any) => [r.position, r.resultIndex, r.observations.map((o: any) => o.ref)])).toEqual([
      [0, 0, [{ step: 1, observation: 0 }]], [1, 1, [{ step: 1, observation: 1 }]], [2, 2, [{ step: 1, observation: 2 }]],
    ]);
    expect(d.counts).toEqual({ retained: 3, ghost: 0, discarded: 0 });
    expect(d.results.map((r: any) => r.label)).toEqual(['before', 'show(Card##Ready)', 'goto(##Changed)']);
    d.results[0].observations[0].label = 'corrupt';
    expect(detail(s, 1).results[0].observations[0].label).toBe('effect: before');
    expect(review(s).text).toContain('Choose'); expect(review(s).text).toContain('条件: ok');
    expect(s.query({ select: ['state', 'actions', 'history'] })).toEqual(before);
    expect(await s.exportScenario()).toEqual(exported);
    expect(exported.steps[0]).not.toHaveProperty('actionText');
    expect(detail(await replayScenario(prepare(), exported), 1)).toEqual(detail(s, 1));
  });

  it('distinguishes retained, ghost and discarded points within operations; no-op preserves ghosts, branch records discard, reset preserves journal', () => {
    const s = make(); invoke(s, 'Choose', 'ok'); s.seek(2);
    expect(detail(s, 1).counts).toEqual({ retained: 1, ghost: 2, discarded: 0 });
    expect(detail(s, 2).target).toMatchObject({ ref: { step: 1, observation: 0 }, actionText: 'Choose', resultPosition: 0, ordinal: 0 });
    invoke(s, 'Noop');
    expect(detail(s, 3)).toMatchObject({ observations: [], completionObservationId: null, discarded: [] });
    expect(detail(s, 1).counts.ghost).toBe(2);
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' });
    expect(detail(s, 4).discarded).toEqual([{ step: 1, observation: 1 }, { step: 1, observation: 2 }]);
    expect(detail(s, 1).counts).toEqual({ retained: 1, ghost: 0, discarded: 2 });
    expect(detail(s, 1).completionObservationId).toBeNull();
    expect(() => s.seek(4)).toThrow('UNKNOWN_OBSERVATION');
    s.reset();
    expect(detail(s, 5).kind).toBe('reset'); expect(detail(s, 1).counts.discarded).toBe(3);
    expect(summary(s)).toMatchObject({ available: true, steps: { dispatch: 2, seek: 1, reset: 1, setTestVariant: 1 }, observations: { retained: 1, ghost: 0, discarded: 5 } });
    expect(review(s).text).toContain('破棄 2観測点');
    expect(review(s).text).toContain('手動試験'); expect(review(s).text).toContain('初期状態へ');
  });

  it('classifies multiple observations of one result independently, including seek between them and redo', async () => {
    const text = '# Home\n> Go -> push(Home, @flow)\n';
    const s = make(text);
    invoke(s, 'Go'); invoke(s, 'Go');
    const d = detail(s, 2);
    // A duplicate named begin changes the frame and then emits R005.
    expect(d.results).toHaveLength(1); expect(d.observations).toHaveLength(2);
    expect(d.results[0].label).toBe('push(Home, @flow)');
    s.seek(d.observations[0].id);
    expect(detail(s, 2).results[0].counts).toEqual({ retained: 1, ghost: 1, discarded: 0 });
    s.seek(d.observations[1].id);
    expect(detail(s, 2).counts).toEqual({ retained: 2, ghost: 0, discarded: 0 });
    expect(detail(await replayScenario(prepare(text), await s.exportScenario()), 4).target.ordinal).toBe(1);
    s.seek(d.observations[0].id); invoke(s, 'Go');
    expect(detail(s, 2).results[0].counts).toEqual({ retained: 1, ghost: 0, discarded: 1 });
    expect(detail(s, 2).results[0].observations.map((p: any) => p.seekable)).toEqual([true, false]);
  });

  it('paginates compact steps and validates options; metadata-free usage explicitly reports unavailable', () => {
    const s = make(); invoke(s, 'Noop'); invoke(s, 'Noop');
    const page = (s.query({ select: ['provenance'], provenance: { limit: 1 } } as any).data as any).provenance;
    expect(page.items.map((x: any) => x.step)).toEqual([1]); expect(page.nextAfter).toBe(1);
    expect(page.items[0]).not.toHaveProperty('results');
    const next = (s.query({ select: ['provenance'], provenance: { after: 1, limit: 1 } } as any).data as any).provenance;
    expect(next.items.map((x: any) => x.step)).toEqual([2]); expect(next.nextAfter).toBeNull();
    for (const opts of [{ select: ['provenanceStep'] }, { select: ['provenance'], provenance: null }, { select: ['provenance'], provenance: { limit: 101 } }, { select: ['state'], step: 1 }, { select: ['provenance'], provenance: { after: 99 } }]) expect(() => s.query(opts as any)).toThrow('INVALID_REQUEST');
    const p = prepare(); const unsupported = new Session(p.documents, 'main');
    expect(summary(unsupported)).toMatchObject({ available: false, reason: 'Source-byte model metadata is required' });
    expect(review(unsupported).available).toBe(false);
  });
});
