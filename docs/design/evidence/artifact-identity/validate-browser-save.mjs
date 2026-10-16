import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../../../..');
const [topic, input, output] = process.argv.slice(2);
assert(['tickets', 'audio'].includes(topic));
const file = resolve(root, `docs/design/session-fixtures/provenance/${topic}/v1/main.shitae`);
const saved = JSON.parse(readFileSync(input, 'utf8'));
const child = spawnSync(process.execPath, [resolve(root, 'packages/cli/dist/index.js'), 'session', file, '--replay', resolve(input)], {
  input: '{"id":1,"command":"query","select":["provenanceSummary"]}\n{"id":2,"command":"exportScenario"}\n', encoding: 'utf8',
});
assert.equal(child.status, 0, child.stderr);
const [query, exported] = child.stdout.trim().split('\n').map(JSON.parse);
assert(query.ok && exported.ok);
assert.deepEqual(exported.scenario, saved);
const counts = { dispatch: 0, seek: 0, reset: 0, setTestVariant: 0 };
for (const step of saved.steps) counts[step.command.kind]++;
assert.deepEqual(query.data.provenanceSummary.steps, counts);
writeFileSync(resolve(import.meta.dirname, output + '.scenario.json'), JSON.stringify(saved, null, 2) + '\n');
writeFileSync(resolve(import.meta.dirname, output + '-validation.json'), JSON.stringify({ separateCliProcess: true, exactScenarioEqual: true,
  modelId: saved.model.modelId, engineVersion: saved.model.engineVersion, summary: query.data.provenanceSummary }, null, 2) + '\n');
console.log(JSON.stringify({ topic, exactScenarioEqual: true, counts }));
