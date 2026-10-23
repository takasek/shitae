import sys,json
sys.path.insert(0,'docs/dogfooding/2026-10-23-end-to-end/tools')
from client import Client,O
prefix=['デモでサインイン','Bookingsタブへ','予約Aを見る','Aの変更を始める','進行中タブへ','Aを遠隔破棄','Bookingsタブへ','変更を取り消す','下書きを破棄する']
results=[]
for v in ['r2_1','refactor_candidate']:
 for policy in ['same-origin','other-origin']:
  c=Client(O/'source-pack/workshop'/v/'main.shitae',v+'-'+policy)
  for a in prefix:c.act(a)
  for a in (['Aの変更を始める'] if policy=='same-origin' else ['Roomsタブへ','Cedarを見る','予約Aを見る','Aの変更を始める']):c.act(a)
  c.act('進行中タブへ');before=c.state('before');a=next(x for x in c.actions() if x['actionText'].startswith('遠隔破棄を確定する'));assert a['enabled']==(policy=='same-origin')
  if a['enabled']:c.act(a['actionText'])
  else:r=c.send('dispatch',handle=a['handle']);assert not r['ok']
  after=c.state('after');shared={(x['module'],x['component']):x['variant'] for x in after['data']['state']['sharedVariants']}
  assert shared[('work','進行A')]==('なし' if policy=='same-origin' else 'Rooms変更')
  if policy=='other-origin':assert before['data']['state']==after['data']['state']
  c.save(v+'-'+policy);c.close();results.append({'version':v,'policy':policy,'pass':True})
(O/'evidence/exploration-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print(results)
