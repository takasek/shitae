"""Public CLI verification. Run from repository root; new evidence only."""
import json, subprocess
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
ROOT=BASE.parents[2]
MODEL=BASE/'models/history-flow.shitae'
logs=[]
def start(replay=None):
 args=['node','packages/cli/dist/index.js','session',str(MODEL)]
 if replay:args+=['--replay',str(replay)]
 return subprocess.Popen(args,cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def req(p,**kw):
 q={'id':str(len(logs)+1),**kw};p.stdin.write(json.dumps(q,ensure_ascii=False)+'\n');p.stdin.flush()
 line=p.stdout.readline()
 if not line:raise RuntimeError(p.stderr.read())
 r=json.loads(line);logs.append({'request':q,'response':r});assert r['ok'],r
 return r
def act(p,name,branch=None,host=None):
 a=req(p,command='query',select=['actions'])['data']['actions']['items']
 cs=[x for x in a if x['actionText']==name and (host is None or x['host']['component']==host)]
 assert len(cs)==1,(name,[(x['actionText'],x.get('branches')) for x in a])
 x=cs[0];kw={'command':'dispatch','handle':x['handle']}
 if branch:
  b=[b for b in x['branches'] if b['label']==branch];assert len(b)==1,x;kw['branch']=b[0]['id']
 return req(p,**kw)
def values(p):
 r=req(p,command='query',select=['state','metadata']);return {x['component']:x['variant'] for x in r['data']['state']['sharedVariants']}
def expect(p,cursor,view,future):
 v=values(p);assert [v['実行位置'],v['参照表示'],v['未来の扱い']]==[cursor,view,future],v
checks=[]
for case in ['cancel','resume','redo','branch','unavailable','record-only','summary']:
 p=start();act(p,'詳細を開く')
 if case in ['cancel','resume','redo','branch','unavailable']:
  act(p,'Bの画面を見る');expect(p,'C','B','保持');act(p,'Bから再開する')
  if case=='cancel':
   act(p,'取り消す(取消)');expect(p,'C','B','保持');act(p,'現在の表示へ戻る');expect(p,'C','現在','保持')
  elif case=='unavailable':
   act(p,'移動を確定(確定)','対象が無効');expect(p,'C','B','保持')
  else:
   act(p,'移動を確定(確定)','対象が保持中');expect(p,'B','現在','保持')
   if case=='redo':
    act(p,'Cの画面を見る',host='Bで再開');act(p,'Cへ進める');act(p,'移動を確定','対象が保持中');expect(p,'C','現在','保持')
   if case=='branch':
    act(p,'別の操作を実行する');expect(p,'新経路','現在','破棄');act(p,'Cの画面を見る','破棄済み');expect(p,'新経路','現在','破棄')
 elif case=='record-only':
  act(p,'Dの記録を読む');act(p,'無観測の結果を読む');expect(p,'C','現在','保持')
 elif case=='summary':
  act(p,'読込要約の案内を開く');expect(p,'C','現在','保持')
 s=req(p,command='exportScenario')['scenario'];dest=BASE/'evidence'/f'{case}.scenario.json';dest.write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
 p.stdin.close();assert p.wait()==0,p.stderr.read()
 p2=start(replay=dest);v2=values(p2);p2.stdin.close();assert p2.wait()==0,p2.stderr.read();checks.append({'case':case,'separateProcessReplay':True,'values':v2})
(BASE/'evidence/model-cli.json').write_text(json.dumps(logs,ensure_ascii=False,indent=2)+'\n')
(BASE/'evidence/model-results.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(checks,ensure_ascii=False,indent=2))
