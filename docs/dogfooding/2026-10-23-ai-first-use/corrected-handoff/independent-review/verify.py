import json, subprocess, pathlib, hashlib
root=pathlib.Path('/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae')
base=root/'docs/dogfooding/2026-10-23-ai-first-use'
out=pathlib.Path('/private/tmp/shitae-handoff-correction-review-4357869637')
cli=root/'packages/cli/dist/index.js'
model=base/'author/v2/equipment.shitae'
log=[]
def start(scenario):
 return subprocess.Popen(['node',str(cli),'session',str(model),'--replay',str(scenario)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def req(p,v):
 v['id']='r'+str(len(log))
 p.stdin.write(json.dumps(v)+'\n');p.stdin.flush();a=json.loads(p.stdout.readline());log.append({'request':v,'response':a});assert a['ok'],a;return a
def state(p):
 return req(p,{'command':'query','select':['state','actions','history']})
def variant(a):
 return a['data']['state']['sharedVariants'][0]['variant']
def act(p,text):
 a=state(p);items=[x for x in a['data']['actions']['items'] if x['actionText']==text];assert len(items)==1
 return req(p,{'command':'dispatch','handle':items[0]['handle']})
def stop(p):
 p.stdin.close();assert p.wait()==0,p.stderr.read()
p=start(base/'author/v2/confirmed.scenario.json');a=state(p);assert variant(a)=='ロッカー依頼済'
# Historical observation confirms cancellation and initial defaults, independent of final state.
for oid,want,loc in [(5,'未依頼',None),(6,'未依頼','ロッカー')]:
 a=req(p,{'command':'query','select':['observation'],'observationId':oid})
 assert a['data']['observation']['view']['state']['sharedVariants'][0]['variant']==want
 if loc: assert a['data']['observation']['view']['location']['variant']==loc
for action in ['貸出依頼へ','窓口受取を選ぶ','取り消す','一覧へ戻る','詳細を開く']:
 act(p,action)
a=state(p);assert variant(a)=='ロッカー依頼済';assert a['summary']['location']['component']=='備品詳細'
act(p,'貸出依頼へ');a=state(p);assert a['summary']['location']['variant']=='ロッカー'
s=req(p,{'command':'exportScenario'})['scenario'];(out/'continued.scenario.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');stop(p)
p=start(out/'continued.scenario.json');s2=req(p,{'command':'exportScenario'})['scenario'];assert s==s2;stop(p)
(out/'cli-evidence.json').write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
checks=[]
for rel in ['author/v2/equipment.shitae','author/v2/equipment.html','author/v2/confirmed.scenario.json']:
 path=base/rel; original=subprocess.check_output(['git','show','HEAD:'+str(path.relative_to(root))],cwd=root);current=path.read_bytes();assert original==current
 checks.append({'path':str(path.relative_to(root)),'unchangedFromHEAD':True,'sha256':hashlib.sha256(current).hexdigest()})
result={'inputUnchanged':checks,'replayedOriginal':True,'historicalCancellationAndDefaultVerified':True,'meaningfulContinuationDispatches':6,'secondProcessReplayAndExportEqual':s==s2}
(out/'results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
