import sys,json,pathlib
sys.path.insert(0,'docs/dogfooding/2026-10-23-end-to-end/tools')
from client import Client,O
plans=[('54-hide-unposted-module',['ShowA','HideB'],[('a','Notice')]),('55-overlay-alias-samefile-control',['ShowX','ShowY'],[('a','Notice')]),('56-overlay-distinctname-control',['ShowA','ShowB','HideA'],[('b','Banner')]),('58-overlay-source-lexical-hide',['ShowB','ShowController','HideLocal'],[('b','Notice'),('a','Controller')])]
res=[]
for name,steps,want in plans:
 c=Client(O/'source-pack/overlay-contract'/name/'main.shitae','overlay-'+name)
 for step in steps:c.act(step)
 state=c.state('final');got=[(x['module'],x['component']) for x in state['data']['state']['overlays']];assert got==want,(name,got,want)
 if name.startswith('55'):
  c.act('HideX');assert not c.state('hidden')['data']['state']['overlays']
 c.save(name);c.close();res.append({'case':name,'pass':True})
(O/'evidence/overlay-results.json').write_text(json.dumps(res,indent=2));print(res)
