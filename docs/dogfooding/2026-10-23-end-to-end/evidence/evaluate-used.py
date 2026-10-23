import json,pathlib,subprocess,shutil
W=pathlib.Path('/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae');O=W/'docs/dogfooding/2026-10-23-end-to-end';CLI=W/'packages/cli/dist/index.js'
class Client:
 def __init__(self,model,name,replay=None):
  self.out=O/'evidence'/name;self.out.mkdir(exist_ok=False);self.n=0;self.req=(self.out/'requests.jsonl').open('w');self.res=(self.out/'responses.jsonl').open('w');self.err=(self.out/'stderr.txt').open('w');self.p=subprocess.Popen(['node',str(CLI),'session',str(model)]+(['--replay',str(replay)] if replay else []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=self.err,text=True)
 def send(self,command,**kw):
  self.n+=1;r=dict(id=str(self.n),command=command,**kw);line=json.dumps(r,ensure_ascii=False);self.req.write(line+'\n');self.req.flush();self.p.stdin.write(line+'\n');self.p.stdin.flush();line=self.p.stdout.readline();assert line,'process stopped';self.res.write(line);self.res.flush();a=json.loads(line);assert a['id']==r['id'];return a
 def actions(self):return self.send('query',select=['actions'])['data']['actions']['items']
 def act(self,name,branch=None):
  a=[a for a in self.actions() if a['actionText']==name];assert len(a)==1,(name,a);assert a[0]['enabled'];kw={'handle':a[0]['handle']}
  if branch:kw['branch']=next(b['id'] for b in a[0]['branches'] if b['label']==branch)
  r=self.send('dispatch',**kw);assert r['ok'],r;return r
 def state(self,name):
  a=self.send('query',select=['state','metadata']);(self.out/(name+'.json')).write_text(json.dumps(a,ensure_ascii=False,indent=2));return a
 def save(self,name):
  r=self.send('exportScenario');assert r['ok'];p=O/'scenarios'/(name+'.scenario.json');p.write_text(json.dumps(r['scenario'],ensure_ascii=False,indent=2));return p
 def close(self):self.p.stdin.close();self.p.wait(timeout=10);assert self.p.returncode==0;self.req.close();self.res.close();self.err.close()
results=[]
prefix=['デモでサインイン','Bookingsタブへ','予約Aを見る','Aの変更を始める','進行中タブへ','Aを遠隔破棄','Bookingsタブへ','変更を取り消す','下書きを破棄する','予約一覧へ戻る','予約Bを見る','Bの変更を始める','進行中タブへ']
for v in ['r2','r2_1','refactor_candidate']:
 model=O/'source-pack/workshop'/v/'main.shitae';c=Client(model,'workshop-'+v)
 for a in prefix:c.act(a)
 before=c.state('before-stale-confirmation');acts=c.actions();a=next(a for a in acts if a['actionText'].startswith('遠隔破棄を確定する'))
 if v=='r2':c.act(a['actionText'])
 else:assert not a['enabled'];r=c.send('dispatch',handle=a['handle']);assert not r['ok'];(c.out/'disabled-response.json').write_text(json.dumps(r,ensure_ascii=False,indent=2))
 after=c.state('after-stale-confirmation');shared=lambda s:{(x['module'],x['component']):x['variant'] for x in s['data']['state']['sharedVariants']}
 assert shared(before)[('nav','Bookings復帰')]=='B変更'
 assert shared(after)[('nav','Bookings復帰')]==('通常' if v=='r2' else 'B変更')
 if v!='r2':assert before['data']['state']==after['data']['state'];c.act('Bookingsタブへ')
 path=c.save('workshop-'+v);c.close();d=Client(model,'workshop-'+v+'-replay',path);d.state('replayed')
 if v!='r2':d.act('代替枠に変える');d.act('レビューへ');d.act('確認結果を試す','accepted');final=d.state('continued');assert shared(final)[('records','予約B')]=='代替枠';assert shared(final)[('nav','Bookings復帰')]=='通常';d.save('workshop-'+v+'-continued')
 d.close();results.append({'case':v,'pass':True,'guarded':v!='r2'})
# GUI saved real file -> separate CLI process; continue closing B only.
model=W/'docs/stress-test/cases/module-identity-20261023/main.shitae';src=pathlib.Path('/Users/m5/Downloads/main.a0aafb42614c.683237908597.scenario.json');dest=O/'scenarios/module-gui.scenario.json';shutil.copy(src,dest);c=Client(model,'module-gui-replay',dest);a=c.state('replayed');assert a['summary']['location']['module']=='a';c.act('Close');a=c.state('continued');assert not any(x['module']=='b' for x in a['data']['state']['overlays']);c.save('module-gui-continued');c.close();results.append({'case':'GUI-save-to-CLI-replay-and-continue','pass':True})
# Original old engine is rejected with no partial stdout.
model=O/'source-pack/workshop/r2_1/main.shitae';old=O/'source-pack/workshop/r2_1/stale-A-blocked.scenario.json';r=subprocess.run(['node',str(CLI),'session',str(model),'--replay',str(old)],input='',capture_output=True,text=True);(O/'evidence/old-engine.stderr.txt').write_text(r.stderr);assert r.returncode==1 and not r.stdout and 'ENGINE_MISMATCH' in r.stderr;results.append({'case':'old-engine-rejection','pass':True})
(O/'evidence/integrated-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(json.dumps(results,ensure_ascii=False))
