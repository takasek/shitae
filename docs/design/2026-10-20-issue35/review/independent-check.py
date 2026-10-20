import subprocess,json
from pathlib import Path
base=Path('docs/design/2026-10-20-issue35')
log=[]
def start(path):
 return subprocess.Popen(['node','packages/cli/dist/index.js','session',str(base/'models/history-flow.shitae'),'--replay',str(path)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def req(p,**q):
 q={'id':str(len(log)+1),**q};p.stdin.write(json.dumps(q)+'\n');p.stdin.flush();r=json.loads(p.stdout.readline());log.append({'request':q,'response':r});assert r['ok'];return r
def query(p):return req(p,command='query',select=['state','actions'])
def act(p,q,name,host):
 a=next(a for a in q['data']['actions']['items'] if a['actionText']==name and a['host']['component']==host)
 return req(p,command='dispatch',handle=a['handle'])
def end(p):p.stdin.close();assert p.wait()==0
p=start(base/'evidence/resume.scenario.json');q=query(p)
act(p,q,'別の操作を実行する','Bで再開');q=query(p)
assert {s['component']:s['variant'] for s in q['data']['state']['sharedVariants']}=={'実行位置':'新経路','未来の扱い':'破棄','参照表示':'現在'}
s=req(p,command='exportScenario')['scenario'];out=base/'review/independent-next.scenario.json';out.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n');end(p)
p=start(out);q=query(p);assert {s['component']:s['variant'] for s in q['data']['state']['sharedVariants']}=={'実行位置':'新経路','未来の扱い':'破棄','参照表示':'現在'};end(p)
p=start(base/'evidence/resume.scenario.json');q=query(p)
act(p,q,'Cの画面を見る','Bで再開');q=query(p)
act(p,q,'別の操作を実行する','Bで再開');q=query(p)
state=q['data']['state'];issue={'shared':state['sharedVariants'],'overlays':state['overlays'],'actions':q['data']['actions']['items']}
end(p)
(base/'review/independent-cli.json').write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'requests':len(log),'queries':sum(x['request']['command']=='query' for x in log),'dispatch':sum(x['request']['command']=='dispatch' for x in log),'exports':sum(x['request']['command']=='exportScenario' for x in log),'counterexample':issue},ensure_ascii=False))
