import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTrial} from '../trial-state.mjs';
const f=JSON.parse(readFileSync(new URL('../materials/history-data.json',import.meta.url)));
test('comparison changes viewed amount without moving continuation point',()=>{let t=createTrial(f);t.preview(2,1);assert.equal(t.view().values['申請額'],'一万二千円');assert.equal(t.live.step,12);t.preview(6,1);assert.equal(t.view().values['申請額'],'一万円');t.close();assert.equal(t.view().step,12)});
test('resume and branch remove unavailable preview, while no-op retains future',()=>{let t=createTrial(f);t.preview(7,1);t.resume();assert.equal(t.live.values['文書B'],'確認済み');t.preview(10,1);t.noop();assert.equal(t.view().step,7);assert.equal(t.available(10,1),true);t.preview(10,1);t.branch();assert.equal(t.view().values['申請状態'],'取下げ');assert.equal(t.available(10,1),false);assert.throws(()=>t.preview(10,1));assert.equal(t.available(7,2),false)});
