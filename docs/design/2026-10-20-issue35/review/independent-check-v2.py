import subprocess,json
from pathlib import Path
base=Path('docs/design/2026-10-20-issue35');log=[];results=[]
def start():return subprocess.Popen(['node','packages/cli/dist/index.js','session',str(base/'models/v2/history-flow.shitae'),'--replay',str(base/'evidence/v2/resume.scenario.json')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
def req(p,**q):
 q={'id':str(len(log)+1),**q};p.stdin.write(json.dumps(q)+'\n');p.stdin.flush();r=json.loads(p.stdout.readline());log.append({'request':q,'response':r});assert r['ok'];return r
def query(p):return req(p,command='query',select=['state','actions'])
def act(p,q,name,host,branch=None):
 a=next(a for a in q['data']['actions']['items'] if a['actionText']==name and a['host']['component']==host)
 args={'command':'dispatch','handle':a['handle']}
 if branch is not None:args['branch']=next(b['id'] for b in a['branches'] if b['label']==branch)
 req(p,**args);return query(p)
def state(q):
 s=q['data']['state'];return ({x['component']:x['variant'] for x in s['sharedVariants']},[x['component'] for x in s['overlays']])
def end(p):p.stdin.close();assert p.wait()==0
p=start();q=query(p);q=act(p,q,'Cの画面を見る','Bで再開');q=act(p,q,'別の操作を実行する','Bで再開');v,o=state(q)
assert v=={'実行位置':'新経路','未来の扱い':'破棄','参照表示':'現在'} and 'C参照' not in o and 'B参照' not in o
assert not any(a['actionText']=='Cへ進める' for a in q['data']['actions']['items']);results.append('v1反例解消');end(p)
p=start();q=query(p)
for name,branch,target,other in [('Bの画面を見る',None,'B','C'),('Cの画面を見る','保持中','C','B'),('Bの画面を見る',None,'B','C')]:
 q=act(p,q,name,'操作詳細',branch);v,o=state(q);assert v['実行位置']=='B' and v['参照表示']==target and target+'参照' in o and other+'参照' not in o
results.append('B-C-B参照切替');end(p)
for target in ['B','C']:
 p=start();q=query(p);q=act(p,q,target+'の画面を見る','操作詳細','保持中' if target=='C' else None)
 q=act(p,q,'Bから再開する' if target=='B' else 'Cへ進める',target+'参照')
 q=act(p,q,'移動を確定(確定)' if target=='B' else '移動を確定',target+'移動確認','対象が無効')
 v,o=state(q);assert v['実行位置']=='B' and v['参照表示']=='現在' and '参照不可' in o and 'B参照' not in o and 'C参照' not in o
 results.append(target+'無効対象');end(p)
(base/'review/independent-cli-v2.json').write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'passed':results,'requests':len(log),'queries':sum(x['request']['command']=='query' for x in log),'dispatch':sum(x['request']['command']=='dispatch' for x in log)},ensure_ascii=False))
