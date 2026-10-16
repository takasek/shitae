import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Session, replayScenario } from '../../../../packages/session/dist/index.js';
import { loadModel } from '../../../../packages/cli/dist/model.js';
import { toSimulator } from '../../../../packages/simulator/dist/index.js';

const root = resolve(import.meta.dirname, '../../../..');
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const invoke = (s, text, label, placement) => {
  const a = s.query({ select: ['actions'] }).data.actions.items.find(a => a.actionText === text && (!placement || a.placement.root === placement));
  assert(a, text);
  return s.dispatch({ handle: a.handle, ...(label ? { branch: a.branches.find(b => b.label === label).id } : {}) });
};
for (const topic of ['tickets', 'audio']) {
  const model = version => loadModel(resolve(root, `docs/design/session-fixtures/provenance/${topic}/${version}/main.shitae`));
  const p = model('v1'), s = new Session(p.documents, p.entryModule, p.modulePaths, p.metadata);
  if (topic === 'tickets') {
    invoke(s, '予約する', '空席'); invoke(s, '確定');
    s.seek(4); invoke(s, '日程変更'); s.seek(7);
  } else {
    s.setTestVariant({ module: 'player', component: 'プレイヤー', variant: '再生中' });
    invoke(s, '確認(先頭.操作可能?)'); s.reset();
    invoke(s, '再生'); s.dispatch({ handle: s.query({ select: ['actions'] }).data.actions.controls.back.handle });
    invoke(s, '停止', undefined, 'overlay:プレイヤー');
  }
  const saved = await s.exportScenario(), select = ['provenanceSummary', 'provenance', 'review'];
  const replayed = await replayScenario({ documents: p.documents, files: p.modulePaths, entryModule: p.entryModule, metadata: p.metadata }, saved);
  assert.deepEqual(replayed.query({ select }), s.query({ select }));
  writeFileSync(resolve(output, `${topic}.scenario.json`), JSON.stringify(saved, null, 2) + '\n');
  writeFileSync(resolve(output, `${topic}.oracle.json`), JSON.stringify(s.query({ select }), null, 2) + '\n');
  for (const version of ['v1', 'v2']) {
    const m = model(version);
    for (const ds of m.diagnostics.values()) assert.deepEqual(ds.filter(d => d.severity === 'error'), []);
    const html = toSimulator(m.documents, m.entryModule, undefined, { files: m.modulePaths, metadata: m.metadata });
    writeFileSync(resolve(output, `${topic}-${version}.html`), html);
  }
  console.log(`${topic}: ${saved.steps.length} journal steps; live/replay provenance equal; engine ${saved.model.engineVersion}`);
}
