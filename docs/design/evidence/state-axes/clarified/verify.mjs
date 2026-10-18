// CLI-only evidence for the approved limited model. No real file I/O is simulated.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const outputDir = process.argv[2] ? resolve(process.argv[2]) : here;
mkdirSync(outputDir, { recursive: true });
const cli = resolve(root, 'packages/cli/dist/index.js');
const oldModel = resolve(here, '../model/proposed.shitae');
const model = resolve(here, 'model/proposed.shitae');
const hash = x => createHash('sha256').update(x).digest('hex');
const source = readFileSync(model, 'utf8');
const oldSource = readFileSync(oldModel, 'utf8');
const nonComments = x => x.split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n');
assert.equal(nonComments(source), nonComments(oldSource));
const call = args => spawnSync(process.execPath, [cli, ...args], { input: '', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const checked = call(['check', model]);
assert.equal(checked.status, 0, checked.stderr);
const generated = call(['simulate', model]);
assert.equal(generated.status, 0, generated.stderr);
assert(generated.stdout.trimEnd().endsWith('</html>'));
const open = () => {
  const child = spawn(process.execPath, [cli, 'session', model], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const closed = once(child, 'close');
  let stderr = ''; child.stderr.on('data', x => { stderr += x; });
  const reader = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const transcript = []; let id = 0;
  return {
    transcript,
    async send(request) {
      const sent = { id: String(++id), ...request };
      child.stdin.write(JSON.stringify(sent) + '\n');
      const line = await reader.next();
      assert(!line.done, stderr || 'CLI closed before reply');
      const received = JSON.parse(line.value);
      assert.equal(received.id, sent.id); assert.equal(received.ok, true, JSON.stringify(received));
      // Preserve the fields used by this check; scenarios are saved separately in full.
      const recorded = { id: received.id, ok: received.ok, revision: received.revision, summary: received.summary };
      if (received.data) recorded.data = {
        sharedVariants: received.data.state?.sharedVariants,
        overlays: received.data.state?.overlays,
        nodeActions: received.data.actions?.items.filter(x => x.actionText.startsWith('NodeDoubleClick')),
      };
      if (received.scenario) recorded.exportScenarioSha256 = hash(JSON.stringify(received.scenario));
      transcript.push({ sent, received: recorded }); return received;
    },
    async close() { child.stdin.end(); const [code] = await closed; assert.equal(code, 0, stderr); },
  };
};
const replayExport = (entry, file) => {
  const response = spawnSync(process.execPath, [cli, 'session', entry, '--replay', file], {
    input: JSON.stringify({ id: 'export', command: 'exportScenario' }) + '\n', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(response.status, 0, response.stderr);
  const output = JSON.parse(response.stdout.trim()); assert.equal(output.ok, true);
  assert.deepEqual(output.scenario, JSON.parse(readFileSync(file, 'utf8')));
};
const cases = [];
for (const initial of ['Valid', 'Invalid']) {
  const client = open();
  try {
    let data;
    const look = async () => { data = (await client.send({ command: 'query', select: ['state', 'actions'] })).data; return data; };
    const shared = name => data.state.sharedVariants.find(x => x.component === name)?.variant;
    const act = async (name, label) => {
      await look(); const action = data.actions.items.find(x => x.actionText === name);
      assert(action?.enabled, name);
      const branch = label ? action.branches.find(x => x.label === label) : null;
      if (label) assert(branch, label);
      await client.send({ command: 'dispatch', handle: action.handle, ...(branch ? { branch: branch.id } : {}) });
      await look();
    };
    await act(initial === 'Valid' ? 'ValidInput' : 'ParseError');
    await act('Conflict'); await act('Review'); await act('UseDiskVersion', 'ConfirmedFresh');
    assert.equal(shared('SyntaxStatus'), initial); assert.equal(shared('DiskStatus'), 'InSync');
    assert.equal(shared('DiagramView'), initial === 'Valid' ? 'Ready' : 'Error');
    await act('DiagramOnly');
    const nodeEnabled = data.actions.items.find(x => x.actionText.startsWith('NodeDoubleClick'))?.enabled;
    assert.equal(nodeEnabled, initial === 'Valid');
    const gap = { lastSyntaxReport: shared('SyntaxStatus'), diagram: shared('DiagramView'), disk: shared('DiskStatus'), nodeEnabled,
      currentSourceValidity: 'not established', currentSourceGraphCorrespondence: 'not established', graphActionAppropriateness: 'not established' };
    const nextEvent = initial === 'Valid' ? 'ParseError' : 'ValidInput';
    await act(nextEvent);
    const nextSyntax = initial === 'Valid' ? 'Invalid' : 'Valid';
    assert.equal(shared('SyntaxStatus'), nextSyntax); assert.equal(shared('DiskStatus'), 'InSync');
    assert.equal(shared('DiagramView'), nextSyntax === 'Valid' ? 'Ready' : 'Error');
    assert.equal(data.actions.items.find(x => x.actionText.startsWith('NodeDoubleClick'))?.enabled, nextSyntax === 'Valid');
    const saved = (await client.send({ command: 'exportScenario' })).scenario;
    const file = resolve(outputDir, initial.toLowerCase() + '-start.scenario.json');
    writeFileSync(file, JSON.stringify(saved, null, 2) + '\n');
    replayExport(model, file);
    cases.push({ initialLastSyntaxReport: initial, afterAdoptBeforeNextReport: gap, nextEvent, nextSyntax, fullExportReplayEqual: true, transcript: client.transcript });
  } finally { await client.close(); }
}
const oldScenario = resolve(here, '../reexamine/derived.scenario.json');
replayExport(oldModel, oldScenario);
const rejected = call(['session', model, '--replay', oldScenario]);
assert.equal(rejected.status, 1); assert.match(rejected.stderr, /MODEL_MISMATCH/);
const report = { kind: 'public CLI and saved-evidence verification; not browser, human evaluation, or real I/O',
  oldModelSourceSha256: hash(oldSource), annotatedModelSourceSha256: hash(source), nonCommentLinesEqual: true,
  checkExit: checked.status, checkDiagnostics: checked.stderr,
  generatedHtml: { exit: generated.status, bytes: Buffer.byteLength(generated.stdout), sha256: hash(generated.stdout), completeClosingTag: true },
  oldScenarioWithOldModelFullExportEqual: true,
  oldScenarioWithAnnotatedModel: { exit: rejected.status, stderr: rejected.stderr }, cases };
writeFileSync(resolve(outputDir, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Verified comment-only copy, generation, both prior syntax reports, subsequent report updates, full replay/export equality, and old-source rejection.');
