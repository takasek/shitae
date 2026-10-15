import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
const root=resolve(import.meta.dirname,'../../../..');
const previous=JSON.parse(readFileSync(root+'/docs/design/evidence/browser/cli-agent-runs.json','utf8'));
const manifest=JSON.parse(readFileSync(root+'/docs/design/evidence/browser/artifact-manifest.json','utf8'));
const runs=[];
const key=a=>JSON.stringify({actionText:a.actionText,scope:a.scope,host:a.host,placement:{root:a.placement.root,path:a.placement.path}});
for(const old of previous){
 const file=manifest.find(m=>m.name===old.name.replace('/','-')).source;
 const child=spawn(process.execPath,[root+'/packages/cli/dist/index.js','session',file]);
 const done=once(child,'close');let stderr='';child.stderr.on('data',c=>stderr+=c);
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const run={name:old.name,source:file,pid:child.pid,start:new Date().toISOString(),exchanges:[]};
 let oldActions,newActions;
 for(const exchange of old.exchanges){
  const request=structuredClone(exchange.request);
  if(request.command==='dispatch'){
   const oldItem=oldActions.items.find(a=>a.handle===request.handle);assert.ok(oldItem);
   const choices=newActions.items.filter(a=>key(a)===key(oldItem));assert.equal(choices.length,1);
   const selected=choices[0];request.handle=selected.handle;
   if(request.branch!==undefined){const label=oldItem.branches.find(b=>b.id===request.branch).label;request.branch=selected.branches.find(b=>b.label===label).id;}
  }
  const input=JSON.stringify(request)+'\n';child.stdin.write(input);
  const next=await lines.next();assert.equal(next.done,false);const output=next.value+'\n';const response=JSON.parse(next.value);
  assert.equal(response.ok,exchange.response.ok);assert.equal(response.revision,exchange.response.revision);
  if(response.summary)assert.deepEqual(response.summary,exchange.response.summary);
  if(response.error)assert.deepEqual(response.error,exchange.response.error);
  if(response.receipt)assert.deepEqual(response.receipt,exchange.response.receipt);
  if(request.command==='query'&&request.select?.includes('actions')){oldActions=exchange.response.data.actions;newActions=response.data.actions;
   assert.deepEqual(newActions.items.map(key),oldActions.items.map(key));
   for(const a of newActions.items){assert.deepEqual(Object.keys(a).sort(),['actionText','branches','enabled','handle','host','placement','scope']);assert.ok(a.branches.every(b=>Object.keys(b).sort().join(',')==='id,label'));}
  }
  if(response.data?.state)assert.deepEqual(response.data.state,exchange.response.data.state);
  run.exchanges.push({at:new Date().toISOString(),request,response,inputBytes:Buffer.byteLength(input),outputBytes:Buffer.byteLength(output)});
 }
 child.stdin.end();run.exitCode=(await done)[0];run.stderr=stderr;assert.equal(run.exitCode,0);assert.equal(stderr,'');run.finish=new Date().toISOString();runs.push(run);
}
writeFileSync(resolve(import.meta.dirname,'cli-runs.json'),JSON.stringify(runs,null,2)+'\n');
const rows=runs.map((r,i)=>{const actions=r.exchanges.filter(e=>e.request.select?.includes('actions'));const before=previous[i].exchanges.filter(e=>e.request.select?.includes('actions'));return {model:r.name,requests:r.exchanges.length,actionsQueries:actions.length,beforeActionsBytes:before.reduce((n,e)=>n+e.outputBytes,0),afterActionsBytes:actions.reduce((n,e)=>n+e.outputBytes,0),inputBytes:r.exchanges.reduce((n,e)=>n+e.inputBytes,0),outputBytes:r.exchanges.reduce((n,e)=>n+e.outputBytes,0)};});
writeFileSync(resolve(import.meta.dirname,'metrics.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows));
