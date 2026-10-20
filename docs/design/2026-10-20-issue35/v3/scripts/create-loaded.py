import json,subprocess
from pathlib import Path
R=Path('/Users/m5/.codex/worktrees/shitae-issue35-design/shitae'); B=R/'docs/design/2026-10-20-issue35/v3'
p=subprocess.Popen(['node','packages/cli/dist/index.js','session',str(B/'materials/expense.shitae')],cwd=R,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
log=[]
def q(**x):
 x={'id':str(len(log)),**x};p.stdin.write(json.dumps(x,ensure_ascii=False)+'\n');p.stdin.flush();r=json.loads(p.stdout.readline());assert r['ok'],r;log.append({'request':x,'response':r});return r
actions=['下書きを作る','金額を入力する','領収書を確認する','申請する','差し戻す','金額を訂正する','再申請する','承認する','保存する','支払いを予約する','領収書の更新を受け取る','支払いを完了する']
for name in actions:
 a=next(x for x in q(command='query',select=['actions'])['data']['actions']['items'] if x['actionText']==name)
 args={'command':'dispatch','handle':a['handle']}
 if a['branches']:args['branch']=a['branches'][0]['id']
 q(**args)
s=q(command='exportScenario')['scenario'];(B/'materials/loaded.scenario.json').write_text(json.dumps(s,ensure_ascii=False,indent=2)+'\n')
h=q(command='query',select=['history','metadata','state'])
(B/'evidence/loaded-query.json').write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(h['data']['history']['items'][-3:],ensure_ascii=False,indent=2)[:5000])
print('metadata',json.dumps(h['data']['metadata']))
(B/'evidence/generation-log.json').write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
p.stdin.close();assert p.wait()==0
