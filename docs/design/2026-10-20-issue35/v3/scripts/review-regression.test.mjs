import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrial} from '../trial-state.mjs';
const f=JSON.parse(readFileSync(new URL('../materials/history-data.json',import.meta.url)));
test('accepted no-op closes preview while retained future remains accessible',()=>{const t=createTrial(f);t.preview(7,1);t.resume();t.preview(10,1);t.noop();assert.equal(t.selected,null);assert.equal(t.view().step,7);assert.equal(t.available(10,1),true)});
test('material selection matches exact position and retained history',()=>{const t=createTrial(f);assert.equal(t.scenarioName(),'loaded.scenario.json');t.preview(12,1);t.resume();assert.equal(t.scenarioName(),null);t.preview(7,1);t.resume();assert.equal(t.scenarioName(),'resumed.scenario.json');t.noop();assert.equal(t.scenarioName(),'noop.scenario.json');t.branch();assert.equal(t.scenarioName(),'branched.scenario.json');t.preview(3,1);t.resume();assert.equal(t.scenarioName(),null)});
