import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dirname, '../dist/index.js');
const MODEL = '# Confirm\n> Purchase -> [Success] goto(Done) ; [Failure] goto(##Error)\n## Ready\nbutton\n## Error\nproblem\n# Done\nreceipt\n';
const cleanup: Array<() => void> = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
function fixture(files: Record<string, string> = { 'main.shitae': MODEL }) {
  const dir = mkdtempSync(join(tmpdir(), 'shitae-session-cli-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return join(dir, 'main.shitae');
}
function start(file: string) {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [CLI, 'session', file]);
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
  it('uses a handle/branch from the live process and returns compact dispatch and subsequent summary', async () => {
    const file = fixture(); const s = start(file);
    const listed = await s.request({ id: 1, command: 'query', select: ['actions'] });
    expect(listed.ok).toBe(true);
    const action = listed.data.actions.items.find((i: any) => i.actionText === 'Purchase');
    expect(action.branches.map((b: any) => b.label)).toEqual(['Success', 'Failure']);
    expect(action.source.file).toBe(file);
    const done = await s.request({ id: 2, command: 'dispatch', handle: action.handle, branch: action.branches[0].id });
    expect(done).toMatchObject({ id: 2, ok: true, protocolVersion: 1, revision: 1,
      summary: { location: { module: 'main', component: 'Done', variant: null } },
      receipt: { operationId: 1, observations: { count: 1 }, effects: [], diagnostics: [] } });
    expect(Object.keys(done).sort()).toEqual(['id', 'ok', 'protocolVersion', 'receipt', 'revision', 'summary']);
    const q = await s.request({ id: 3, command: 'query' });
    expect(q.summary).toEqual(done.summary);
    expect(q).not.toHaveProperty('data');
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
