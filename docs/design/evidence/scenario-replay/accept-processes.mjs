import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../../../..');
const cli = join(root, 'packages/cli/dist/index.js');
const prior = JSON.parse(readFileSync(join(root, 'docs/design/evidence/browser/cli-agent-runs.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'docs/design/evidence/browser/artifact-manifest.json'), 'utf8'));
const key = a => JSON.stringify({ actionText: a.actionText, scope: a.scope, host: a.host, placement: { root: a.placement.root, path: a.placement.path } });
const sha = text => createHash('sha256').update(text).digest('hex');
function client(source, args = []) {
  const startedAt = new Date().toISOString();
  const child = spawn(process.execPath, [cli, 'session', source, ...args], { timeout: 20000 });
  const closed = once(child, 'close'); let stderr = '', n = 0;
  child.stderr.on('data', chunk => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  return { child, request: async request => {
    child.stdin.write(JSON.stringify({ id: ++n, ...request }) + '\n');
    const line = await lines.next(); assert.equal(line.done, false, stderr); return JSON.parse(line.value);
  }, finish: async () => {
    child.stdin.end(); const [exitCode, signal] = await closed;
    const result = { pid: child.pid, startedAt, endedAt: new Date().toISOString(), exitCode, signal, stderr };
    assert.equal(exitCode, 0, stderr); assert.equal(stderr, ''); assert.equal(child.exitCode, 0);
    assert.equal((await lines.next()).done, true); return result;
  } };
}
const directory = mkdtempSync(join(tmpdir(), 'shitae-11-process-'));
const runs = [];
try {
  for (const old of prior) {
    const original = manifest.find(m => m.name === old.name.replace('/', '-')).source;
    const source = join(root, original.slice(original.indexOf('docs/dogfooding/')));
    const first = client(source); let oldActions, newActions; const route = [];
    for (const exchange of old.exchanges) {
      const request = structuredClone(exchange.request);
      if (request.handle) {
        const previous = oldActions.items.find(a => a.handle === request.handle);
        assert.ok(previous);
        const matches = newActions.items.filter(a => key(a) === key(previous)); assert.equal(matches.length, 1);
        request.handle = matches[0].handle;
        if (request.branch !== undefined) {
          const label = previous.branches.find(b => b.id === request.branch).label;
          request.branch = matches[0].branches.find(b => b.label === label).id;
        }
      }
      const response = await first.request(request);
      assert.equal(response.ok, exchange.response.ok);
      if (response.summary) assert.deepEqual(response.summary, exchange.response.summary);
      if (request.command === 'query' && request.select?.includes('actions')) { oldActions = exchange.response.data.actions; newActions = response.data.actions; }
      if (request.command === 'dispatch') route.push({ accepted: response.ok, location: response.summary?.location ?? null, error: response.error?.code ?? null });
    }
    const exported = await first.request({ command: 'exportScenario' }); assert.equal(exported.ok, true);
    const saved = exported.scenario, text = JSON.stringify(saved, null, 2) + '\n';
    assert.ok(!text.includes('"handle"')); assert.ok(!text.includes('"file"'));
    const name = old.name.replace('/', '-');
    const sidecar = join(import.meta.dirname, `${name}.scenario.json`); writeFileSync(sidecar, text);
    const firstExit = await first.finish(); // Must finish before process B is even spawned.
    const relocated = join(directory, name); mkdirSync(relocated);
    // Entry module identity includes its basename; retain the original basename.
    const entryName = saved.model.entryModule + '.shitae';
    const entry = join(relocated, entryName); copyFileSync(source, entry);
    assert.equal(saved.model.manifest.length, 1);
    const second = client(entry, ['--replay', sidecar]);
    assert.notEqual(first.child.pid, second.child.pid);
    const query = await second.request({ command: 'query', select: ['state', 'actions'] }); assert.equal(query.ok, true);
    const again = await second.request({ command: 'exportScenario' }); assert.equal(again.ok, true);
    assert.deepEqual(again.scenario, saved); // Every step/observation/output/final projection.
    const backHandle = query.data.actions.controls.back.handle;
    assert.ok(backHandle.includes(':')); // New Session UUID is visible only on live requests.
    const secondExit = await second.finish();
    runs.push({ name: old.name, source: source.slice(root.length + 1), relocatedSource: entry,
      model: saved.model, requests: old.exchanges.length, dispatches: route.length, accepted: route.filter(r => r.accepted).length,
      journalSteps: saved.steps.length, observations: saved.steps.reduce((n, s) => n + s.observations.length, 0),
      sidecar: `${name}.scenario.json`, sidecarBytes: Buffer.byteLength(text), sidecarSha256: sha(text),
      initialDigest: saved.initialDigest, finalDigest: saved.final.digest, route,
      first: firstExit, second: secondExit, finalLocation: query.summary.location,
      allRecordedStepsAndOutputsEqual: true });
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
const report = { date: new Date().toISOString(), node: process.version, engineVersion: runs[0].model.engineVersion,
  cases: runs.length, requests: runs.reduce((n, r) => n + r.requests, 0),
  dispatches: runs.reduce((n, r) => n + r.dispatches, 0), accepted: runs.reduce((n, r) => n + r.accepted, 0),
  runs, proof: 'Each A exited with code 0 before B was spawned; model bytes relocated; exported scenario equality checks every saved step, observation/output and final projection.' };
writeFileSync(join(import.meta.dirname, 'process-acceptance.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ cases: report.cases, requests: report.requests, dispatches: report.dispatches, accepted: report.accepted, runs: runs.map(r => ({ name: r.name, firstPid: r.first.pid, firstExit: r.first.exitCode, secondPid: r.second.pid, secondExit: r.second.exitCode, steps: r.journalSteps, final: r.finalLocation, matched: r.allRecordedStepsAndOutputsEqual })) }));
