// Verify a browser save by replaying it in a separate public CLI process.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const [modelArg, scenarioArg, reportArg] = process.argv.slice(2);
assert(modelArg && scenarioArg && reportArg, 'model scenario report paths are required');
const here = dirname(fileURLToPath(import.meta.url));
const saved = JSON.parse(readFileSync(resolve(scenarioArg), 'utf8'));
const commands = [
  { id: 'summary', command: 'query', select: ['metadata'] },
  { id: 'save', command: 'exportScenario' },
];
const result = spawnSync(process.execPath, [resolve(here, '../../../../packages/cli/dist/index.js'), 'session', resolve(modelArg), '--replay', resolve(scenarioArg)], { input: commands.map(x => JSON.stringify(x)).join('\n') + '\n', encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const responses = result.stdout.trim().split('\n').map(line => JSON.parse(line));
for (const response of responses) assert.equal(response.ok, true, JSON.stringify(response));
const exported = responses.find(x => x.id === 'save');
assert.equal(exported.ok, true);
assert.deepEqual(exported.scenario, saved);
writeFileSync(resolve(reportArg), JSON.stringify({ kind: 'separate-process CLI replay/export equality; not browser or human acceptance', scenario: scenarioArg, model: modelArg, status: result.status, allExportEqual: true, responses }, null, 2) + '\n');
console.log('CLI replay succeeded; full exported scenario equals browser save.');
