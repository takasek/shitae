// Controlled mismatch fixtures. Engine case changes metadata only, not runtime.
import { mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { loadModel } from '../../../../packages/cli/dist/model.js';
import { Session } from '../../../../packages/session/dist/index.js';
import { toSimulator } from '../../../../packages/simulator/dist/index.js';
const here = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: true });
const cli = resolve(here, '../../../../packages/cli/dist/index.js');
const base = resolve(here, 'models/s2');
const loaded = loadModel(resolve(base, 'main.shitae'));
assert.equal(loaded.failed, false);
const session = new Session(loaded.documents, loaded.entryModule, loaded.modulePaths, loaded.metadata);
const scenario = await session.exportScenario();
writeFileSync(resolve(output, 'original.scenario.json'), JSON.stringify(scenario, null, 2));
const engine = structuredClone(scenario);
// Metadata is intentionally altered to exercise rejection, never cross-version acceptance.
assert(engine.model && typeof engine.model.engineVersion === 'string');
engine.model.engineVersion = '0'.repeat(64);
writeFileSync(resolve(output, 'engine.scenario.json'), JSON.stringify(engine, null, 2));
const cases = ['same', 'entry', 'module-added', 'module-removed', 'referenced-source'];
const results = [];
for (const name of cases) {
  const dir = resolve(output, name);
  cpSync(base, dir, { recursive: true });
  const main = resolve(dir, 'main.shitae');
  if (name === 'entry') writeFileSync(resolve(dir, 'alternate.shitae'), 'import main as main\n# 別入口\n> 開く -> push(main::備品ポータル)\n');
  if (name === 'module-added') {
    writeFileSync(main, 'import extra as extra\n' + readFileSync(main, 'utf8'));
    writeFileSync(resolve(dir, 'extra.shitae'), '# 追加情報\n備品規約\n');
  }
  if (name === 'module-removed') writeFileSync(main, '# 備品ポータル\n貸出案内\n');
  if (name === 'referenced-source') {
    const target = resolve(dir, 'checkout.shitae');
    writeFileSync(target, readFileSync(target, 'utf8') + '// 参照先だけの source 変更\n');
    assert.equal(readFileSync(main, 'utf8'), readFileSync(resolve(base, 'main.shitae'), 'utf8'));
  }
  const entry = resolve(dir, name === 'entry' ? 'alternate.shitae' : 'main.shitae');
  const model = loadModel(entry);
  const html = toSimulator(model.documents, model.entryModule, undefined, { files: model.modulePaths, metadata: model.metadata });
  writeFileSync(resolve(output, name + '.html'), html);
  for (const kind of name === 'same' ? ['original', 'engine'] : ['original']) {
    const probe = spawnSync(process.execPath, [cli, 'session', entry, '--replay', resolve(output, kind + '.scenario.json')], { input: '', encoding: 'utf8' });
    assert.equal(probe.status, name === 'same' && kind === 'original' ? 0 : 1);
    results.push({ name, scenario: kind, status: probe.status, stderr: probe.stderr, metadata: model.metadata });
  }
}
writeFileSync(resolve(output, 'cli-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ name, scenario, status, stderr }) => ({ name, scenario, status, reason: stderr.split('\n')[0] })), null, 2));
