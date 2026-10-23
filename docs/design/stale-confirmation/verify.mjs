import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../../../packages/cli/dist/index.js', import.meta.url));
const results = [];
async function run(model, next, { corrupt = false, local = false } = {}) {
  const file = fileURLToPath(new URL(model + '.shitae', import.meta.url));
  const check = spawnSync(process.execPath, [cli, 'check', file], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr + check.stdout);
  const child = spawn(process.execPath, [cli, 'session', file], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let stderr = '';
  child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => child.kill(), 15000);
  let id = 0;
  async function request(command, fields = {}) {
    const requestId = String(++id);
    child.stdin.write(JSON.stringify({ id: requestId, command, ...fields }) + '\n');
    const line = await lines.next();
    assert.equal(line.done, false, stderr);
    const reply = JSON.parse(line.value);
    assert.equal(reply.id, requestId);
    return reply;
  }
  async function action(name, { overlay = false, dispatch = true } = {}) {
    const q = await request('query', { select: ['actions'] });
    assert.equal(q.ok, true);
    const matches = q.data.actions.items.filter(a => (a.actionText === name || a.actionText.startsWith(name + '(')) &&
      (!overlay || a.placement.root.startsWith('overlay:')));
    assert.equal(matches.length, 1, JSON.stringify(q.data.actions));
    if (!dispatch) return matches[0];
    const r = await request('dispatch', { handle: matches[0].handle });
    assert.equal(r.ok, true, JSON.stringify(r));
    return r;
  }
  async function state() {
    const q = await request('query', { select: ['state'] });
    assert.equal(q.ok, true);
    const s = q.data.state;
    return {
      work: s.frames.map(f => f.beginsSession?.name).filter(n => n === 'workA' || n === 'workB').sort(),
      active: s.frames.find(f => f.id === s.activeFrameId).stack.at(-1).component,
      values: Object.fromEntries(s.sharedVariants.map(v => [v.component, v.variant])),
      overlays: s.overlays.map(o => o.component),
    };
  }
  try {
    await action('Boot');
    await action('StartA');
    if (local) {
      await action('DiscardA');
      const after = await state();
      assert.deepEqual(after.work, []);
      assert.equal(after.values.RowA, 'None');
      assert.equal(after.values.ReturnIndex, 'None');
      assert.equal(after.values.CommittedA, 'Unreserved');
      results.push({ model, path: 'local cancellation', after });
      return;
    }
    await action('AskDiscardA');
    await action('FinishA');
    await action(next);
    if (corrupt) {
      const q = await request('query', { select: ['state'] });
      const row = q.data.state.sharedVariants.find(v => v.component === 'RowA');
      const r = await request('setTestVariant', { module: row.module, component: 'RowA', variant: 'Desk' });
      assert.equal(r.ok, true);
    }
    const before = await state();
    assert.deepEqual(before.work, [next === 'StartB' ? 'workB' : 'workA']);
    assert.equal(before.active, next === 'StartB' ? 'DraftB' : 'DraftA');
    assert.equal(before.values.ReturnIndex, next === 'StartB' ? 'B' : 'A');
    assert.equal(before.values.RowA, corrupt || next === 'StartA' ? 'Desk' : next === 'StartAOther' ? 'Phone' : 'None');
    assert.equal(before.values.RowB, next === 'StartB' ? 'Desk' : 'None');
    assert.equal(before.values.CommittedA, 'Reserved');
    assert.deepEqual(before.overlays, ['ConfirmA']);
    const a = await action('DiscardA', { overlay: true, dispatch: false });
    const permitted = model === 'unsafe' || next === 'StartA' || corrupt;
    assert.equal(a.enabled, permitted);
    const reply = await request('dispatch', { handle: a.handle });
    assert.equal(reply.ok, permitted);
    const after = await state();
    assert.equal(after.values.CommittedA, 'Reserved');
    if (!permitted) {
      assert.deepEqual(after, before);
    } else if (next === 'StartB') {
      assert.deepEqual(after.work, ['workB']);
      assert.equal(after.active, 'DraftB');
      assert.equal(after.values.RowB, 'Desk');
      assert.equal(after.values.ReturnIndex, 'None');
      assert.match(JSON.stringify(reply), /R002/);
    } else if (next === 'StartA') {
      assert.deepEqual(after.work, []);
      assert.equal(after.values.RowA, 'None');
      assert.equal(after.values.ReturnIndex, 'None');
    }
    results.push({ model, path: next, kind: corrupt ? 'manual-test' : 'normal', enabled: a.enabled, before, after });
  } finally {
    clearTimeout(timer);
    child.stdin.end();
    child.kill();
  }
}
await run('unsafe', 'StartB');
for (const model of ['guarded', 'maintained']) {
  for (const next of ['StartB', 'StartAOther', 'StartA']) await run(model, next);
}
await run('guarded', 'StartB', { corrupt: true });
await run('maintained', null, { local: true });
console.log(JSON.stringify({ cases: results.length, results }, null, 2));

