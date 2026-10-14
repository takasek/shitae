import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { loadModel } from '../../../packages/cli/dist/model.js';
import { toSimulator } from '../../../packages/simulator/dist/index.js';
const root = resolve(import.meta.dirname, '../../..');
const cli = resolve(root, 'packages/cli/dist/index.js');
const legacy = process.argv[2] ? await import(new URL('file:' + resolve(process.argv[2]))) : null;
const result = { environment:'Node VM of generated GUI and public persistent CLI; not a real browser', legacyBaseline:legacy?'0d0d814':null,
  comparisons:[], savedModels:[], legacyComparisons:[], compactBytes:[], proofLimits:['No disk/network/focus effect is executed','This script uses VM; real browser evidence is recorded separately','No timing/usability benefit measured'] };
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k])=>k!=='handle').map(([k,v])=>[k,normalize(v)]));
  return v;
}
function gui(file) {
  const m = loadModel(file), html=toSimulator(m.documents,m.entryModule,undefined,{files:m.modulePaths,metadata:m.metadata});
  const app={innerHTML:''}; const ctx=vm.createContext({document:{getElementById:()=>app},crypto:webcrypto,structuredClone,console,setTimeout:()=>0});
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)[1],ctx);
  const run=s=>vm.runInContext(s,ctx);
  const read=s=>JSON.parse(run(`JSON.stringify(${s})`));
  return {m,html,app,run,read};
}
async function processFor(file) {
  const child=spawn(process.execPath,[cli,'session',file]); const closed=once(child,'close');
  let stderr='';child.stderr.on('data',s=>stderr+=s);
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let id=0;
  return {request:async r=>{
    child.stdin.write(JSON.stringify({id:++id,...r})+'\n');const n=await lines.next();
    assert.equal(n.done,false,stderr);const response=JSON.parse(n.value);assert.equal(response.id,id);
    return {response,bytes:Buffer.byteLength(n.value+'\n')};
  }, finish:async()=>{child.stdin.end();assert.equal((await closed)[0],0,stderr);assert.equal(stderr,'');}};
}
async function compare(file,steps,label) {
  const g=gui(file), p=await processFor(file);let observations=0,actions=0,failures=0,queries=0;
  const request=async r=>{queries++;return (await p.request(r)).response;};
  const current=()=>g.read('SESSION.query({select:["state","actions"]}).data');
  let old;
  if(legacy && (label.startsWith('sol/') || label.startsWith('astra/') || label === 'frame tree switch/exit')) {
    const app={innerHTML:''};const ctx=vm.createContext({document:{getElementById:()=>app},console,setTimeout:()=>0});
    const html=legacy.toSimulator(g.m.documents,g.m.entryModule);
    vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)[1],ctx);
    old={app,run:s=>vm.runInContext(s,ctx)};
  }
  const first=await request({command:'query',select:['state','actions','metadata']});
  assert.deepEqual(normalize({state:first.data.state,actions:first.data.actions}),normalize(current()));
  assert.deepEqual(first.data.metadata,g.read('SESSION.query({select:["metadata"]}).data.metadata'));
  for(const step of steps) {
    let r;
    if(step.reset) {r=await request({command:'reset'});g.run('resetSession()');}
    else if(step.trial) {
      r=await request({command:'setTestVariant',...step.trial});
      g.run(`setInstanceVariant(${JSON.stringify(step.trial.module)},${JSON.stringify(step.trial.component)},${JSON.stringify(step.trial.variant)})`);
    } else {
      const listed=await request({command:'query',select:['actions']});
      const matches=listed.data.actions.items.filter(a=>(a.actionText===step.name || a.actionText.startsWith(step.name+'(')) &&
        (!step.target || a.actionText.startsWith(step.name+'('+step.target+')') || a.actionText.startsWith(step.name+'('+step.target+'.')));
      assert.equal(matches.length,1,`${label}: ambiguous/missing ${step.name}`);
      const a=matches[0], ga=g.read('SESSION.query({select:["actions"]}).data.actions.items').find(o=>o.actionText===a.actionText&&o.scope===a.scope&&JSON.stringify(o.host)===JSON.stringify(a.host)&&JSON.stringify(o.placement)===JSON.stringify(a.placement));
      assert.ok(ga);
      const branch=step.branch === undefined ? undefined : a.branches.find(b=>b.label===step.branch)?.id;
      const gb=step.branch === undefined ? undefined : ga.branches.find(b=>b.label===step.branch)?.id;
      r=await request({command:'dispatch',handle:a.handle,...(branch===undefined?{}:{branch})});
      if(r.ok) {
        const onclicks=[...g.app.innerHTML.matchAll(/onclick="([^"]+)"/g)].map(m=>m[1]);
        const onclick=onclicks.find(s=>s.includes(ga.handle) && (gb===undefined || s.includes("'"+gb+"'")));
        assert.ok(onclick,`${label}: missing rendered click ${step.name}`);g.run(onclick);actions++;
        if(old) {
          try {
            old.run(onclick);
            const oldLocation=JSON.parse(old.run('JSON.stringify({module:currentFrame().module,component:currentFrame().component,variant:displayVariant(currentFrame())})'));
            const newLocation=g.read('SESSION.query().summary.location');
            const oldStack=JSON.parse(old.run('JSON.stringify(stack.map(f=>f.component))'));
            const newStack=g.read('stack.map(f=>f.component)');
            result.legacyComparisons.push({label,action:step.name,branch:step.branch??null,locationEqual:JSON.stringify(oldLocation)===JSON.stringify(newLocation),
              activePathEqual:JSON.stringify(oldStack)===JSON.stringify(newStack), oldLocation,newLocation,oldStack,newStack});
          } catch(e) {result.legacyComparisons.push({label,action:step.name,legacyError:String(e)});}
        }
      } else {
        const err=g.run(`(()=>{try{SESSION.dispatch(${JSON.stringify({handle:ga.handle,...(gb===undefined?{}:{branch:gb})})});return null;}catch(e){return e.code;}})()`);
        assert.equal(r.error.code,step.error);assert.equal(err,step.error);failures++;
      }
    }
    const ids=[];
    if(r.receipt?.observations.count) {
      let after;
      do {
        const h=await request({command:'query',select:['history'],history:{operationId:r.receipt.operationId,limit:2,...(after===undefined?{}:{after})}});
        ids.push(...h.data.history.items.map(i=>i.id));after=h.data.history.nextAfter;
      } while(after!==null);
      assert.equal(ids.length,r.receipt.observations.count);
    } else if(step.reset) ids.push(r.summary.cursorObservationId);
    for(const id of ids) {
      const saved=await request({command:'query',select:['observation'],observationId:id});
      const index=g.run(`timeline.findIndex(i=>i.id===${id})`);assert.ok(index>=0);
      g.run(`jumpToTimeline(${index})`);
      assert.deepEqual(normalize(saved.data.observation.view.state),normalize(current().state));
      const detailed=g.read(`(()=>{const a=SESSION.query({select:['actions']}).data.actions;return {
        items:a.items.map(i=>{const {definition,...detail}=SESSION.query({select:['action'],handle:i.handle}).data.action;return detail;}),
        controls:{back:SESSION.query({select:['action'],handle:a.controls.back.handle}).data.action}};})()`);
      assert.deepEqual(normalize(saved.data.observation.view.actions),normalize(detailed));observations++;
    }
    const live=await request({command:'query',select:['state','actions']});
    assert.deepEqual(normalize(live.data),normalize(current()));
    assert.deepEqual(live.summary.location,g.read('SESSION.query().summary.location'));
  }
  await p.finish();const report={label,steps:steps.length,renderedActions:actions,rejections:failures,observationComparisons:observations,cliRequests:queries,modelId:first.data.metadata.modelId};
  result.comparisons.push(report);return g;
}
await compare(resolve(root,'docs/design/session-fixtures/switch-contexts.shitae'),
  ['home','detail','b','modal','c','close-reading','resume-b','push-detail','back','close-modal'].map(name=>({name})), 'frame tree switch/exit');
await compare(resolve(root,'docs/design/session-fixtures/trial-values.shitae'),[
  {name:'choose',error:'BRANCH_REQUIRED'},
  {trial:{module:'trial-values',component:'Badge',variant:'On'}},
  {name:'choose',branch:'yes'}, {reset:true},
  {name:'show-card'}, {trial:{module:'trial-values',component:'Card',variant:'Ready'}},
  {name:'gate',target:'a'}, {name:'open-card'}, {reset:true},
], 'snapshot/manual/branch/reset');
const modelSteps={
  'sol/current':[{name:'Normalize'},{name:'NodeDoubleClick'},{name:'ParseError'},{name:'ValidInput'},{name:'CloseLastDocument'},{name:'Save'}],
  'sol/proposed':[{name:'SourceOnly'},{name:'DiagramOnly'},{name:'NodeDoubleClick'},{name:'Conflict'},{name:'Review'},{name:'KeepEditing'},{name:'ParseError'},{name:'DiagramOnly'},{name:'NodeDoubleClick',error:'DISABLED_ACTION'},{name:'ValidInput'},{name:'NodeDoubleClick'},{name:'CloseLastDocument'},{name:'NewDocument'}],
  'astra/current':[{name:'開く'},{name:'編集'},{name:'保存',branch:'成功'},{name:'切替',target:'B'},{name:'編集'},{name:'切替',target:'A'}],
  'astra/proposed':[{name:'開く'},{name:'編集'},{name:'保存',branch:'成功'},{name:'切替',target:'B'},{name:'編集'},{name:'切替',target:'A'},{name:'図のみ'},{name:'ノードからソースへ'},{name:'外部変更確認'},{name:'取消'}],
};
for(const [name,steps] of Object.entries(modelSteps)) {
  const file=resolve(root,`docs/dogfooding/2026-10-13-standalone/${name.split('/')[0]}/models/${name.split('/')[1]}.shitae`);
  await compare(file,steps,name);result.savedModels.push({name,authorModelChanged:false,fixedFixtureLoads:1,steps:steps.length,unexpectedActionIdentificationFailures:0,unexpectedBranchErrors:0});
}
const dir=mkdtempSync(resolve(tmpdir(),'shitae18-size-'));
try {
  for(const large of [false,true]) {
    const file=resolve(dir,'main.shitae');
    const layers=Array.from({length:100},(_,i)=>`> layer${i} -> push(Home, @layer${i})\n`).join('')+'> resume -> switch(Home, @layer0)\n';
    if(large) for(let i=0;i<30;i++) writeFileSync(resolve(dir,`module${i}.shitae`),'# Other\nx\n');
    writeFileSync(file,(large?Array.from({length:30},(_,i)=>`import module${i} as m${i}\n`).join(''):'')+layers+'# Home\n'+
      (large?Array.from({length:300},(_,i)=>`c${i}: C${i}\n`).join('')+Array.from({length:30},(_,i)=>`m${i}::Other\n`).join(''):'')+'> step -> push(Home)\n'+
      (large?Array.from({length:300},(_,i)=>`# C${i}\nx\n`).join(''):''));
    const p=await processFor(file);let receipt;
    const names=large?[...Array.from({length:100},(_,i)=>'layer'+i),'resume','step']:['step'];
    for(const name of names) {
      const listed=(await p.request({command:'query',select:['actions']})).response;
      receipt=await p.request({command:'dispatch',handle:listed.data.actions.items.find(a=>a.actionText===name).handle});
    }
    const summary=await p.request({command:'query'});const detail=(await p.request({command:'query',select:['state','history']})).response;
    result.compactBytes.push({inclusions:detail.data.state.inclusion.main.children.length,modules:new Set(detail.data.state.componentValues.map(c=>c.module)).size,frames:detail.data.state.frames.length,activePathDepth:detail.data.state.activePath.length,dormantFrames:detail.data.state.frames.length-detail.data.state.activePath.length,totalStackEntries:detail.data.state.frames.reduce((n,f)=>n+f.stack.length,0),history:summary.response.summary.observationCount,dispatchUtf8Bytes:receipt.bytes,summaryUtf8Bytes:summary.bytes,defaultKeys:Object.keys(summary.response)});
    await p.finish();
  }
} finally {rmSync(dir,{recursive:true,force:true});}
writeFileSync(process.argv[3] ? resolve(process.argv[3]) : resolve(import.meta.dirname,'session-regression.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
