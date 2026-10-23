"""Read real GUI downloads, replay through public CLI, and preserve results.

Usage: python3 verify-gui.py NEW_OUTPUT_DIR
Never changes model bytes, scenarios or previous evidence.
"""
import collections,hashlib,json,pathlib,subprocess,sys
HERE=pathlib.Path(__file__).resolve().parents[1]
ROOT=HERE.parents[2]
CLI=ROOT/'packages/cli/dist/index.js'
MODEL=HERE.parent/'2026-10-23-end-to-end/models/module/main.shitae'
OUT=pathlib.Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=False)
results=[]
for name,want_dispatch,want_ghost,want_overlays in [
 ('module-ghost-gui',5,3,[('a','Notice'),('b','Notice'),('a','Controller')]),
 ('module-branched-gui',6,0,[('a','Notice'),('a','Controller')]),
]:
 scenario=HERE/'scenarios'/(name+'.scenario.json');s=json.loads(scenario.read_text());kinds=collections.Counter(x['command']['kind'] for x in s['steps']);assert kinds=={'dispatch':want_dispatch,'seek':1}
 fv=s['final']['view'];ghost=sum(x['ghost'] for x in fv['timeline']);assert ghost==want_ghost
 assert fv['view']['location']=={'module':'a','component':'Home','variant':None}
 assert [(x['module'],x['component']) for x in fv['view']['state']['overlays']]==want_overlays
 out=OUT/name;out.mkdir();err=(out/'stderr.txt').open('w');p=subprocess.Popen(['node',str(CLI),'session',str(MODEL),'--replay',str(scenario)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True)
 requests=[];responses=[]
 def send(command,**args):
  req={'id':str(len(requests)+1),'command':command,**args};line=json.dumps(req,ensure_ascii=False);requests.append(req);p.stdin.write(line+'\n');p.stdin.flush();line=p.stdout.readline();assert line,'CLI stopped';r=json.loads(line);responses.append(r);assert r['id']==req['id'] and r['ok'],r;return r
 query=send('query',select=['state','history','metadata']);assert query['summary']['location']==fv['view']['location'];assert [(x['module'],x['component']) for x in query['data']['state']['overlays']]==want_overlays
 exported=send('exportScenario')['scenario'];assert exported['final']['digest']==s['final']['digest'];assert exported['final']['view']['timeline']==fv['timeline'];assert exported['final']['view']['cursor']==fv['cursor']
 # After the second GUI save, continue once in this separate process.
 if name=='module-branched-gui':
  actions=send('query',select=['actions'])['data']['actions']['items'];a=next(x for x in actions if x['actionText']=='HideA');send('dispatch',handle=a['handle']);continued=send('query',select=['state']);assert [(x['module'],x['component']) for x in continued['data']['state']['overlays']]==[('a','Controller')]
  (out/'continued.scenario.json').write_text(json.dumps(send('exportScenario')['scenario'],ensure_ascii=False,indent=2)+'\n')
 p.stdin.close();p.wait(timeout=10);err.close();assert p.returncode==0
 (out/'requests.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in requests));(out/'responses.jsonl').write_text(''.join(json.dumps(x,ensure_ascii=False)+'\n' for x in responses))
 results.append({'case':name,'exit':p.returncode,'dispatch':want_dispatch,'seek':1,'ghost':ghost,'timeline':len(fv['timeline']),'digestMatched':True,'sha256':hashlib.sha256(scenario.read_bytes()).hexdigest(),'engineVersion':s['model']['engineVersion'],'modelId':s['model']['modelId']})
(OUT/'results.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
