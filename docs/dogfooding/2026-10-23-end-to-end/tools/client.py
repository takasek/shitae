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
