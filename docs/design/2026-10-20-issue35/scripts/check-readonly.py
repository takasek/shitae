"""Current public CLI: inspect retained observation without mutating live state; verify C guidance."""
import json, subprocess
from pathlib import Path
B=Path(__file__).resolve().parents[1];R=B.parents[2]
model=R/'docs/dogfooding/2026-10-20-end-to-end/models/saved/astra/models/proposed.shitae'
scenario=R/'docs/dogfooding/2026-10-20-end-to-end/scenarios/astra-cli.scenario.json'
p=subprocess.Popen(['node','packages/cli/dist/index.js','session',str(model),'--replay',str(scenario)],cwd=R,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
log=[]
def q(**kw):
 x={'id':str(len(log)),**kw};p.stdin.write(json.dumps(x)+'\n');p.stdin.flush();line=p.stdout.readline()
 if not line:raise RuntimeError(p.stderr.read())
 y=json.loads(line);assert y['ok'],y;log.append({'request':x,'response':y});return y
before=q(command='query',select=['state','actions','provenanceSummary','metadata'])
save1=q(command='exportScenario')['scenario']
h=q(command='query',select=['history'])['data']['history']['items'];point=h[0]['id']
past=q(command='query',select=['observation'],observationId=point)
after=q(command='query',select=['state','actions','provenanceSummary','metadata'])
save2=q(command='exportScenario')['scenario']
assert before['revision']==after['revision']
assert before['summary']==after['summary'] and before['data']==after['data']
assert save1==save2
assert all('handle' not in x for x in past['data']['observation']['view']['actions']['items'])
shared=before['data']['state']['sharedVariants'];assert any(x['component']=='状態B' and x['variant']=='未保存' for x in shared),shared
p.stdin.close();assert p.wait()==0,p.stderr.read()
(B/'evidence/readonly-cli.json').write_text(json.dumps(log,ensure_ascii=False,indent=2)+'\n')
result={'method':'public CLI / saved scenario replay','observationId':point,'revisionStateActionsAndProvenanceUnchanged':True,'scenarioExportEqual':True,'pastActionsHaveNoHandles':True,'sharedVariants':shared,'metadata':before['data']['metadata']}
(B/'evidence/readonly-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
