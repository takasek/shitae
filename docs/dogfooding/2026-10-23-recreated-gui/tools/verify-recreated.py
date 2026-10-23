"""Verify supplied recreated GUI scenarios using their pinned public CLI.
Run with LEGACY_CLI CURRENT_CLI NEW_OUTPUT_DIR. Never edits input records.
"""
import collections,hashlib,json,pathlib,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parents[1]
LEGACY=pathlib.Path(sys.argv[1]).resolve();CURRENT=pathlib.Path(sys.argv[2]).resolve();OUT=pathlib.Path(sys.argv[3]).resolve();OUT.mkdir(parents=True,exist_ok=False)
plans=[('r2_1','r2_1-gui48-recreated-20261023',48,{'module':'work','component':'進行中一覧','variant':None},'公共バナーを閉じる'),('refactor_candidate','refactor-candidate-gui11-recreated-20261023',11,{'module':'room_a','component':'レビュー','variant':'代替枠拒否'},'選択へ戻る')]
results=[]
for version,name,count,location,next_action in plans:
 folder=OUT/version;folder.mkdir();model=HERE/'source-pack/models'/version/'main.shitae';scenario=HERE/'source-pack/exports'/(name+'.scenario.json');original=json.loads(scenario.read_text())
 assert collections.Counter(x['command']['kind'] for x in original['steps'])=={'dispatch':count}
 for item in original['model']['manifest']:
  assert hashlib.sha256((model.parent/(item['module']+'.shitae')).read_bytes()).hexdigest()==item['sourceSha256']
 stderr=(folder/'legacy.stderr.txt').open('w');p=subprocess.Popen(['node',str(LEGACY),'session',str(model),'--replay',str(scenario)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=stderr,text=True);events=[]
 def send(command,**args):
  req={'id':str(len(events)+1),'command':command,**args};p.stdin.write(json.dumps(req,ensure_ascii=False)+'\n');p.stdin.flush();line=p.stdout.readline();assert line,'CLI stopped';r=json.loads(line);events.append({'request':req,'response':r});assert r.get('id')==req['id'] and r.get('ok'),r;return r
 q=send('query',select=['state','actions','metadata']);assert q['summary']['location']==location
 state=q['data']['state'];shared={(x['module'],x['component']):x['variant'] for x in state['sharedVariants']}
 assert shared[('records','予約A')]=='原枠'
 if version=='r2_1':
  assert shared[('records','予約B')]=='代替枠';assert shared[('work','進行A')]==shared[('work','進行B')]=='なし';assert [(x['module'],x['component']) for x in state['overlays']]==[('nav','公共バナー')];assert {f['beginsSession']['name'] for f in state['frames'] if f['beginsSession']}=={'member','rooms','progress'}
 else:
  assert shared[('nav','Rooms復帰')]=='A変更';assert shared[('work','進行A')]=='Rooms変更';assert not state['overlays']
 reexport=send('exportScenario')['scenario'];assert reexport==original
 (folder/'reexport.scenario.json').write_text(json.dumps(reexport,ensure_ascii=False,indent=2)+'\n')
 actions=send('query',select=['actions'])['data']['actions']['items'];a=[a for a in actions if a['actionText']==next_action and a['enabled']];assert len(a)==1;send('dispatch',handle=a[0]['handle']);continued=send('query',select=['state']);assert continued['data']['state']['sharedVariants']==state['sharedVariants']
 if version=='r2_1':assert not continued['data']['state']['overlays'];assert continued['summary']['location']==location
 else:assert continued['summary']['location']=={'module':'room_a','component':'枠選択','variant':'代替枠'}
 (folder/'continued.scenario.json').write_text(json.dumps(send('exportScenario')['scenario'],ensure_ascii=False,indent=2)+'\n');p.stdin.close();p.wait(timeout=10);stderr.close();assert p.returncode==0
 (folder/'events.json').write_text(json.dumps(events,ensure_ascii=False,indent=2)+'\n')
 refused=subprocess.run(['node',str(CURRENT),'session',str(model),'--replay',str(scenario)],input='',text=True,capture_output=True);(folder/'current.stderr.txt').write_text(refused.stderr);assert refused.returncode==1 and not refused.stdout and 'ENGINE_MISMATCH' in refused.stderr
 results.append({'version':version,'dispatch':count,'legacyReplayExit':p.returncode,'scenarioExactEquality':True,'location':location,'shared':state['sharedVariants'],'continuation':next_action,'continuationLocation':continued['summary']['location'],'currentReplayExit':refused.returncode,'currentError':'ENGINE_MISMATCH','engineVersion':original['model']['engineVersion'],'modelId':original['model']['modelId'],'scenarioSha256':hashlib.sha256(scenario.read_bytes()).hexdigest()})
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');print(json.dumps([{k:r[k] for k in ['version','dispatch','legacyReplayExit','scenarioExactEquality','continuation','currentError']} for r in results],ensure_ascii=False))
