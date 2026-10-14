import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
import {writeFileSync} from 'node:fs';
const root=resolve(import.meta.dirname,'../../../..');
const runs=[];
for(const [author,steps,target] of [
 ['astra',[['開く(開始ボタン)',null],['正規化','有効な入力']],'正規化A'],
 ['sol',[['Conflict',null],['ParseError',null],['ValidInput',null]],'DocumentStatus']
]){
 const source=resolve(root,`docs/dogfooding/2026-10-13-standalone/${author}/models/proposed.shitae`);
 const child=spawn(process.execPath,[resolve(root,'packages/cli/dist/index.js'),'session',source]);
 const done=once(child,'close');let stderr='';child.stderr.on('data',c=>stderr+=c);
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let id=0;const exchanges=[];const values=[];
 const request=async req=>{req={id:++id,...req};child.stdin.write(JSON.stringify(req)+'\n');const next=await lines.next();assert.equal(next.done,false);const response=JSON.parse(next.value);assert.equal(response.ok,true);exchanges.push({request:req,response});return response;};
 for(const [action,branchLabel] of steps){
  const inventory=(await request({command:'query',select:['actions']})).data.actions;
  const matches=inventory.items.filter(a=>a.actionText===action);assert.equal(matches.length,1);const item=matches[0];
  await request({command:'dispatch',handle:item.handle,...(branchLabel?{branch:item.branches.find(b=>b.label===branchLabel).id}:{})});
  const view=(await request({command:'query',select:['state']})).data.state;
  values.push({action,value:view.componentValues.find(c=>c.component===target)});
 }
 const expected=author==='astra'?['非表示','表示']:['Conflict','Invalid','Valid'];assert.deepEqual(values.map(v=>v.value.variant),expected);
 assert.ok(values.every(v=>v.value.singleton && v.value.scope==='singleton-shared'));
 child.stdin.end();const exitCode=(await done)[0];assert.equal(exitCode,0);assert.equal(stderr,'');runs.push({author,source,exchanges,values,exitCode,stderr});
}
writeFileSync(resolve(import.meta.dirname,'model-probe.json'),JSON.stringify(runs,null,2)+'\n');console.log(JSON.stringify(runs.map(r=>({author:r.author,values:r.values}))));
