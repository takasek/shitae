import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { Session } from '@shitae/session';
import { loadModel } from '../src/model.js';

const CLI = join(import.meta.dirname, '../dist/index.js');
const MODEL = '# Confirm\n> Purchase -> [Success] goto(Done) ; [Failure] goto(##Error)\n## Ready\nbutton\n## Error\nproblem\n# Done\nreceipt\n';
const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function fixture(files: Record<string, string> = { 'main.shitae': MODEL }) {
  const dir = mkdtempSync(join(tmpdir(), 'shitae-session-cli-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return join(dir, 'main.shitae');
}
function start(file: string, args: string[] = []) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CLI, 'session', file, ...args]);
  cleanup.push(() => { if (child.exitCode == null) child.kill(); });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const read = async () => {
    const line = await lines.next();
    if (line.done) throw new Error(`Session exited before response: ${stderr}`);
    return JSON.parse(line.value);
  };
  return { child, read, request: async (r: unknown) => { child.stdin.write(JSON.stringify(r) + '\n'); return read(); },
    finish: async () => { child.stdin.end(); const [code] = await closed; return { code, stderr, rest: await lines.next() }; } };
}

describe('shitae session persistent JSON Lines', () => {
  it('names actual entry, added/missing modules and reference-only source changes on replay failure', async () => {
    const main = 'import part as p\n# Home\ncard: p::Card\n', part = '# Card\nx\n';
    const original = fixture({ 'main.shitae': main, 'part.shitae': part });
    const p = loadModel(original), s = new Session(p.documents, p.entryModule, p.modulePaths, p.metadata);
    const sidecar = join(dirname(original), 'saved.scenario.json'); writeFileSync(sidecar, JSON.stringify(await s.exportScenario()));
    const entry = fixture({ 'main.shitae': main, 'alternate.shitae': main, 'part.shitae': part });
    const cases: Array<[string, string]> = [
      [join(dirname(entry), 'alternate.shitae'), 'エントリが異なります: main → alternate'],
      [fixture({ 'main.shitae': main, 'part.shitae': part + ' \n' }), 'source bytesが異なるmodule: part'],
      [fixture({ 'main.shitae': main + '\n' }), '現在のモデルで不足するmodule: part'],
      [fixture({ 'main.shitae': 'import added as a\n' + main, 'part.shitae': part, 'added.shitae': '# Extra\nx\n' }), '現在のモデルで追加されたmodule: added'],
    ];
    // The missing-module case must still be a valid model, so remove the import as well.
    writeFileSync(cases[2]![0], '# Home\nx\n');
    for (const [file, reason] of cases) {
      const result = await start(file, ['--replay', sidecar]).finish();
      expect(result).toMatchObject({ code: 1, rest: { done: true } });
      expect(result.stderr).toContain('MODEL_MISMATCH');
      expect(result.stderr).toContain(reason);
      expect(result.stderr).toContain('新しく記録');
    }
  });

  it('reconstructs discarded/reset and split-result provenance in a different process, including placements, modules, overlays and builtin back', async () => {
    const file = fixture({
      'main.shitae': 'import card as c\n# Home\none: c::Card\ntwo: c::Card\n> Open -> show(c::Card) ; push(c::Card)\n> Check(two.signal?) -> checked\n',
      'card.shitae': '# Card\n> Loop -> push(Card, @flow)\n> Check(signal?) -> checked\n## Idle\nx\n## Ready\nsignal\n',
    });
    const p = loadModel(file), s = new Session(p.documents, p.entryModule, p.modulePaths, p.metadata);
    const act = (text: string, path?: number[]) => {
      const a = s.query({ select: ['actions'] }).data!.actions!.items.find(a => a.actionText === text && (!path || JSON.stringify(a.placement.path) === JSON.stringify(path)))!;
      return s.dispatch({ handle: a.handle });
    };
    act('Loop', [1]); act('Loop');
    const split = s.query({ select: ['history'], history: { operationId: 2 } }).data!.history!.items;
    expect(split).toHaveLength(2); s.seek(split[0]!.id);
    s.dispatch({ handle: s.query({ select: ['actions'] }).data!.actions!.controls.back.handle });
    s.reset(); act('Open');
    s.setTestVariant({ module: 'card', component: 'Card', variant: 'Ready' });
    const current = s.query().summary.cursorObservationId;
    s.seek(current - 1); s.seek(current);
    const sidecar = join(dirname(file), 'saved.scenario.json'); writeFileSync(sidecar, JSON.stringify(await s.exportScenario()));
    const next = start(file, ['--replay', sidecar]);
    const select = ['provenanceSummary', 'provenance', 'review'];
    expect((await next.request({ id: 'all', command: 'query', select })).data).toEqual(s.query({ select }).data);
    for (let step = 1; step <= 9; step++) {
      expect((await next.request({ id: step, command: 'query', select: ['provenanceStep'], step })).data).toEqual(s.query({ select: ['provenanceStep'], step }).data);
    }
    expect(s.query({ select: ['provenanceStep'], step: 1 }).data!.provenanceStep).toMatchObject({ host: { module: 'card' }, placement: { root: 'main', path: [1] } });
    expect(s.query({ select: ['provenanceStep'], step: 4 }).data!.provenanceStep!.actionText).toBe('組込み back');
    expect(await next.finish()).toMatchObject({ code: 0, stderr: '' });
  });

  it('queries readable provenance, summary, pages and details across separate replay processes', async () => {
    const file = fixture(), first = start(file);
    const a = (await first.request({ id: 1, command: 'query', select: ['actions'] })).data.actions.items[0];
    await first.request({ id: 2, command: 'dispatch', handle: a.handle, branch: a.branches[1].id });
    const query = { id: 3, command: 'query', select: ['provenanceSummary', 'provenance', 'provenanceStep', 'review'], provenance: { limit: 1 }, step: 1 };
    const live = await first.request(query);
    expect(live.ok).toBe(true); expect(live.data.provenanceStep).toMatchObject({ actionText: 'Purchase', branch: 'Failure' });
    expect(live.data.review.text).toContain('条件: Failure');
    const saved = (await first.request({ id: 4, command: 'exportScenario' })).scenario;
    const sidecar = join(dirname(file), 'saved.scenario.json'); writeFileSync(sidecar, JSON.stringify(saved));
    await first.finish();
    const next = start(file, ['--replay', sidecar]);
    expect((await next.request(query)).data).toEqual(live.data);
    expect((await next.request({ id: 5, command: 'seek', observationId: 1 })).error.code).toBe('UNKNOWN_COMMAND');
    expect(await next.finish()).toMatchObject({ code: 0, stderr: '' });
  });

  it('exports, exits, reloads in a different process/directory and continues with fresh handles', async () => {
    const file = fixture(); const first = start(file);
    const a = (await first.request({ id: 1, command: 'query', select: ['actions'] })).data.actions.items[0];
    await first.request({ id: 2, command: 'dispatch', handle: a.handle, branch: a.branches[1].id });
    const before = await first.request({ id: 3, command: 'query', select: ['state'] });
    const exported = await first.request({ id: 4, command: 'exportScenario' });
    expect(exported.ok).toBe(true);
    const sidecar = join(dirname(file), 'saved.scenario.json');
    writeFileSync(sidecar, JSON.stringify(exported.scenario));
    expect(await first.finish()).toMatchObject({ code: 0, stderr: '' });
    expect(first.child.exitCode).toBe(0);
    const second = start(fixture(), ['--replay', sidecar]);
    expect(second.child.pid).not.toBe(first.child.pid);
    const after = await second.request({ id: 1, command: 'query', select: ['state'] });
    expect(after.ok).toBe(true);
    expect(after.summary.location).toEqual(before.summary.location);
    expect(after.data.state.frames).toEqual(before.data.state.frames);
    expect((await second.request({ id: 2, command: 'exportScenario' })).scenario).toEqual(exported.scenario);
    expect(await second.request({ id: 3, command: 'dispatch', handle: a.handle })).toMatchObject({ ok: false, error: { code: 'UNKNOWN_HANDLE' } });
    const b = (await second.request({ id: 4, command: 'query', select: ['actions'] })).data.actions.items[0];
    expect((await second.request({ id: 5, command: 'dispatch', handle: b.handle, branch: b.branches[0].id })).summary.location.component).toBe('Done');
    expect((await second.request({ id: 6, command: 'exportScenario' })).scenario.steps).toHaveLength(2);
    expect(await second.finish()).toMatchObject({ code: 0, stderr: '' });
  });

  it('replay startup rejects mismatched model, malformed sidecar and unsupported arguments without stdout', async () => {
    const file = fixture(); const first = start(file);
    const out = await first.request({ id: 1, command: 'exportScenario' });
    expect(out.ok).toBe(true);
    await first.finish();
    const sidecar = join(dirname(file), 'saved.scenario.json'); writeFileSync(sidecar, JSON.stringify(out.scenario));
    const changed = fixture({ 'main.shitae': MODEL + '// changed\n' });
    const mismatch = await start(changed, ['--replay', sidecar]).finish();
    expect(mismatch).toMatchObject({ code: 1, rest: { done: true } }); expect(mismatch.stderr).toContain('MODEL_MISMATCH');
    expect(mismatch.stderr).toContain('source bytesが異なるmodule: main');
    expect(mismatch.stderr.indexOf('次の行動')).toBeLessThan(mismatch.stderr.indexOf('Expected'));
    expect(mismatch.stderr).toContain('元モデル一式と処理系');
    const engineScenario = structuredClone(out.scenario); engineScenario.model.engineVersion = 'older-engine';
    writeFileSync(sidecar, JSON.stringify(engineScenario));
    const engineMismatch = await start(file, ['--replay', sidecar]).finish();
    expect(engineMismatch).toMatchObject({ code: 1, rest: { done: true } });
    expect(engineMismatch.stderr).toContain('ENGINE_MISMATCH');
    expect(engineMismatch.stderr).toContain('モデルは未照合');
    expect(engineMismatch.stderr).toContain(out.scenario.model.modelId);
    writeFileSync(sidecar, '{broken');
    const malformed = await start(file, ['--replay', sidecar]).finish();
    expect(malformed).toMatchObject({ code: 1, rest: { done: true } }); expect(malformed.stderr).toContain('SCENARIO_FORMAT');
    for (const args of [['--replay'], ['--wat'], ['--replay', sidecar, 'extra']]) {
      expect(await start(file, args).finish()).toMatchObject({ code: 1, rest: { done: true } });
    }
  });
  it('canonicalizes real files instead of basenames, coalesces aliases and keeps identity after relocation', async () => {
    const files = {
      'main.shitae': 'import left/part as l\nimport right/part as r\nimport alias as a\n# Home\n> Left -> goto(l::Left)\n> Right -> goto(r::Right)\n',
      'left/part.shitae': '# Left\nx\n', 'right/part.shitae': '# Right\ny\n',
    };
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const file = fixture(files); symlinkSync('left/part.shitae', join(dirname(file), 'alias.shitae'));
      const s = start(file);
      const q = await s.request({ id: 1, command: 'query', select: ['metadata', 'actions'] });
      expect(q.ok).toBe(true);
      expect(q.data.metadata.manifest.map((m: any) => m.module)).toEqual(['left/part', 'main', 'right/part']);
      ids.push(q.data.metadata.modelId);
      const a = q.data.actions.items.find((a: any) => a.actionText === 'Right');
      expect((await s.request({ id: 2, command: 'dispatch', handle: a.handle })).summary.location).toMatchObject({ module: 'right/part', component: 'Right' });
      expect(await s.finish()).toMatchObject({ code: 0, stderr: '' });
    }
    expect(ids[0]).toBe(ids[1]);
  });
  it('uses a handle/branch from the live process and returns compact dispatch and subsequent summary', async () => {
    const file = fixture(); const s = start(file);
    const listed = await s.request({ id: 1, command: 'query', select: ['actions'] });
    expect(listed.ok).toBe(true);
    const action = listed.data.actions.items.find((i: any) => i.actionText === 'Purchase');
    expect(action.branches.map((b: any) => b.label)).toEqual(['Success', 'Failure']);
    expect(Object.keys(action).sort()).toEqual(['actionText', 'branches', 'enabled', 'handle', 'host', 'placement', 'scope']);
    expect(action.branches[0]).toEqual({ id: 'b0', label: 'Success' });
    const detail = await s.request({ id: 'detail', command: 'query', select: ['action'], handle: action.handle });
    expect(detail.ok).toBe(true);
    expect(detail.data.action.source.file).toBe(realpathSync(file));
    expect(detail.data.action.definition.results[0].body).toMatchObject({ kind: 'transition', word: 'goto', target: { name: 'Done' } });
    for (const request of [
      { select: ['action'] }, { select: ['actions'], handle: action.handle }, { select: ['action'], handle: null },
    ]) expect(await s.request({ id: 'bad-detail', command: 'query', ...request })).toMatchObject({ ok: false, revision: 0, error: { code: 'INVALID_REQUEST' } });
    expect(await s.request({ id: 'unknown-detail', command: 'query', select: ['action'], handle: 'unknown' })).toMatchObject({ ok: false, revision: 0, error: { code: 'UNKNOWN_HANDLE' } });
    const done = await s.request({ id: 2, command: 'dispatch', handle: action.handle, branch: action.branches[0].id });
    expect(done).toMatchObject({ id: 2, ok: true, protocolVersion: 1, revision: 1,
      summary: { location: { module: 'main', component: 'Done', variant: null } },
      receipt: { operationId: 1, observations: { count: 1 }, effects: [], diagnostics: [] } });
    expect(Object.keys(done).sort()).toEqual(['id', 'ok', 'protocolVersion', 'receipt', 'revision', 'summary']);
    const q = await s.request({ id: 3, command: 'query' });
    expect(q.summary).toEqual(done.summary);
    expect(q).not.toHaveProperty('data');
    expect(await s.request({ id: 'stale-detail', command: 'query', select: ['action'], handle: action.handle })).toMatchObject({ ok: false, revision: 1, error: { code: 'STALE_HANDLE' } });
    expect(await s.finish()).toMatchObject({ code: 0, stderr: '', rest: { done: true } });
  });

  it('rejects request errors without prelude/counter changes, survives invalid JSON and rejects stale handles', async () => {
    const s = start(fixture({ 'main.shitae': MODEL.replace('-> [Success]', '-> pre-effect ; [Success]') }));
    const initial = await s.request({ id: 'a', command: 'query', select: ['actions'] });
    const a = initial.data.actions.items[0];
    for (const [r, code] of [
      [{ id: 2, command: 'dispatch', handle: a.handle }, 'BRANCH_REQUIRED'],
      [{ id: 3, command: 'dispatch', handle: a.handle, branch: 'bad' }, 'INVALID_BRANCH'],
      [{ id: 4, command: 'query', select: 'actions' }, 'INVALID_REQUEST'],
      [{ id: 5, command: 'query', select: ['actions'], extra: true }, 'INVALID_REQUEST'],
      [{ id: 6, command: 'dispatch', handle: a.handle, branch: null }, 'INVALID_REQUEST'],
      [{ id: 7, command: 'unknown' }, 'UNKNOWN_COMMAND'],
      [{ id: 8, command: 'query', select: ['unknown'] }, 'INVALID_REQUEST'],
      [{ id: 9, command: 'query', select: ['history'], history: { limit: null } }, 'INVALID_REQUEST'],
    ] as const) {
      const response = await s.request(r);
      expect(response).toMatchObject({ ok: false, revision: 0, error: { code } });
      expect(response).not.toHaveProperty('receipt');
    }
    s.child.stdin.write('{invalid}\n');
    expect(await s.read()).toMatchObject({ id: null, ok: false, revision: 0, error: { code: 'INVALID_REQUEST' } });
    expect((await s.request({ id: 9, command: 'query' })).summary).toEqual(initial.summary);
    const r = await s.request({ id: 10, command: 'dispatch', handle: a.handle, branch: a.branches[1].id });
    expect(r.receipt.operationId).toBe(1);
    expect(r.receipt.effects.map((e: any) => e.text)).toEqual(['pre-effect']);
    expect(r.summary.location.variant).toBe('Error');
    expect(await s.request({ id: 11, command: 'dispatch', handle: a.handle, branch: a.branches[0].id })).toMatchObject({ error: { code: 'STALE_HANDLE' }, revision: 1 });
    expect(await s.finish()).toMatchObject({ code: 0, stderr: '' });
  });

  it('ignores empty lines and flushes the last request without a trailing newline at EOF', async () => {
    const s = start(fixture());
    s.child.stdin.write('\n\n');
    s.child.stdin.end(JSON.stringify({ id: 1, command: 'query' }));
    expect(await s.read()).toMatchObject({ id: 1, ok: true, revision: 0 });
    expect(await s.finish()).toMatchObject({ code: 0, stderr: '', rest: { done: true } });
  });

  it('imported parse errors fail startup with stderr only', async () => {
    const s = start(fixture({ 'main.shitae': 'import sub as x\n# A\nx\n', 'sub.shitae': '# Broken\n> bad -> exit()\n' }));
    const r = await s.finish();
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('sub.shitae');
    expect(r.stderr).toContain('[error]');
    expect(r.rest.done).toBe(true);
  });

  it('supports paged detail reads/manual trials/reset without exposing seek as a wire command', async () => {
    const s = start(fixture({ 'main.shitae': '# Host\n> Go -> set(Badge##On) ; show(Badge) ; goto(##Done)\n> Check(Badge.signal?) -> effect\n## Start\nx\n## Done\ny\n#! Badge\n## Off\nx\n## On\nsignal\n' }));
    const initial = await s.request({ id: 1, command: 'query', select: ['state', 'actions'] });
    const a = initial.data.actions.items.find((a: any) => a.actionText === 'Go');
    const trial = await s.request({ id: 2, command: 'setTestVariant', module: 'main', component: 'Badge', variant: 'On' });
    expect(trial).toMatchObject({ ok: true, revision: 1 });
    expect(trial).not.toHaveProperty('data');
    const current = await s.request({ id: 3, command: 'query', select: ['actions'] });
    const go = current.data.actions.items.find((a: any) => a.actionText === 'Go');
    const r = await s.request({ id: 4, command: 'dispatch', handle: go.handle });
    const h = await s.request({ id: 5, command: 'query', select: ['history'], history: { operationId: r.receipt.operationId, limit: 1 } });
    expect(h.data.history.items).toHaveLength(1); expect(h.data.history.nextAfter).not.toBeNull();
    const o = await s.request({ id: 6, command: 'query', select: ['observation'], observationId: h.data.history.items[0].id });
    expect(o.data.observation.view.location.variant).toBe('Start');
    expect(o.data.observation.view.state.sharedVariants[0].origin).toBe('dsl');
    expect(o.data.observation.view.actions.items[0]).not.toHaveProperty('handle');
    const now = await s.request({ id: 7, command: 'query' }); expect(now.summary).toEqual(r.summary);
    expect(await s.request({ id: 8, command: 'seek', observationId: 1 })).toMatchObject({ ok: false, error: { code: 'UNKNOWN_COMMAND' } });
    const reset = await s.request({ id: 9, command: 'reset' }); expect(reset.summary.location.variant).toBe('Start');
    expect(await s.request({ id: 10, command: 'dispatch', handle: a.handle })).toMatchObject({ error: { code: 'STALE_HANDLE' } });
    expect(await s.finish()).toMatchObject({ code: 0, stderr: '' });
  });
});


describe('canonical module back via public Session/CLI', () => {
  it.each([
    ['push(a::Home) ; push(b::Home) ; push(Details)', 'a::Home', 'a', null],
    ['push(a::Home) ; push(Details)', 'b::Home', 'main', 'R004'],
    ['push(a::Home) ; push(Details)', 'x::Home', 'a', null],
    ['push(a::Home) ; present(b::Home) ; push(Details)', 'a::Home', 'main', 'R003'],
  ])('%s then back(%s)', async (open, target, module, diagnostic) => {
    const file = fixture({
      'main.shitae': `import a as a\nimport a as x\nimport b as b\n# Start\n> Open -> ${open}\n# Details\n> Return -> back(${target})\n`,
      'a.shitae': '# Home\nALabel\n', 'b.shitae': '# Home\nBLabel\n',
    });
    const cli = start(file);
    const act = async (text: string) => {
      const q = await cli.request({ id: 'probe', command: 'query', select: ['actions'] });
      const op = q.data.actions.items.find((a: { actionText: string }) => a.actionText === text);
      return cli.request({ id: 'probe', command: 'dispatch', handle: op.handle });
    };
    await act('Open');
    const before = await cli.request({ id: 'probe', command: 'query', select: ['state'] });
    const result = await act('Return');
    expect(result.summary.location.module).toBe(module);
    if (diagnostic) {
      expect(JSON.stringify(result)).toContain(diagnostic);
      expect((await cli.request({ id: 'probe', command: 'query', select: ['state'] })).data.state).toEqual(before.data.state);
    } else expect(result.summary.location.component).toBe('Home');
    expect((await cli.finish()).code).toBe(0);
  });
});


describe('issue #66: public CLI overlay replay and continuation', () => {
  it('preserves separate definitions, canonical aliases, singleton variants and lexical hides across processes', async () => {
    const file = fixture({
      'main.shitae': 'import a as a\nimport a as x\nimport b as b\n# Screen\n> Show -> show(a::Notice) ; show(b::Notice) ; show(a::Controller)\n> Again -> show(x::Notice##Ready) ; show(b::Banner)\n> Omit -> show(a::Notice)\n> HideA -> hide(x::Notice)\n> Flow -> push(Work, @work) ; show(b::Banner) ; exit(@work)\n# Work\nwork\n',
      'a.shitae': '#! Notice\n> Close -> hide(Notice)\n## Idle\na label\n## Ready\nsignal\n# Controller\n> Hide -> hide(Notice)\n',
      'b.shitae': '# Notice\n> Close -> hide(Notice)\n## Idle\nb label\n## Ready\nsignal\n# Banner\nbanner\n',
    });
    const first = start(file);
    const act = async (cli: ReturnType<typeof start>, text: string, module?: string) => {
      const q = await cli.request({ id: 'actions', command: 'query', select: ['actions'] });
      const op = q.data.actions.items.find((a: any) => a.actionText === text && (!module || a.host.module === module));
      expect(op).toBeDefined();
      return cli.request({ id: 'act', command: 'dispatch', handle: op.handle });
    };
    const state = async (cli: ReturnType<typeof start>) => (await cli.request({ id: 'state', command: 'query', select: ['state'] })).data.state;
    await act(first, 'Show'); await act(first, 'Again'); await act(first, 'Omit'); await act(first, 'Flow');
    const before = await state(first);
    expect(before.overlays.map((o: any) => [o.module, o.component, o.variant])).toEqual([
      ['a', 'Notice', 'Ready'], ['b', 'Notice', 'Idle'], ['a', 'Controller', null], ['b', 'Banner', null],
    ]);
    const saved = await first.request({ id: 'save', command: 'exportScenario' });
    const sidecar = join(dirname(file), 'saved.scenario.json'); writeFileSync(sidecar, JSON.stringify(saved.scenario));
    expect((await first.finish()).code).toBe(0);
    const second = start(file, ['--replay', sidecar]);
    expect(await state(second)).toEqual(before);
    await act(second, 'Hide', 'a');
    expect((await state(second)).overlays.map((o: any) => [o.module, o.component])).toEqual([['b', 'Notice'], ['a', 'Controller'], ['b', 'Banner']]);
    await act(second, 'Show'); await act(second, 'HideA');
    expect((await state(second)).overlays.filter((o: any) => o.component === 'Notice').map((o: any) => o.module)).toEqual(['b']);
    await act(second, 'Close', 'b');
    expect((await state(second)).overlays.map((o: any) => o.component)).toEqual(['Controller', 'Banner']);
    expect((await second.finish()).code).toBe(0);
  });
});
