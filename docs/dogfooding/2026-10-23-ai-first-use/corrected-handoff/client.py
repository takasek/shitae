import sys, subprocess, json
from pathlib import Path
base=Path(__file__).resolve().parent
name=sys.argv[1]
scenario=Path(sys.argv[2]).resolve()
root=base.parents[3]
cmd=['node',str(root/'packages/cli/dist/index.js'),'session',str(root/'docs/dogfooding/2026-10-23-ai-first-use/author/v2/equipment.shitae'),'--replay',str(scenario)]
(base/(name+'.command.json')).write_text(json.dumps(cmd,ensure_ascii=False,indent=2)+'\n')
with (base/(name+'.stderr.txt')).open('w') as err, (base/(name+'.requests.jsonl')).open('w') as req, (base/(name+'.responses.jsonl')).open('w') as resp:
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True)
 print(json.dumps({'pid':p.pid,'command':cmd},ensure_ascii=False),flush=True)
 for line in sys.stdin:
  data=json.loads(line)
  wire=json.dumps(data,ensure_ascii=False)
  req.write(wire+'\n');req.flush()
  p.stdin.write(wire+'\n');p.stdin.flush()
  answer=p.stdout.readline()
  if not answer: break
  resp.write(answer);resp.flush()
  value=json.loads(answer)
  if 'scenario' in value:
   tmp=base/(name+'.scenario.tmp')
   tmp.write_text(json.dumps(value['scenario'],ensure_ascii=False,indent=2)+'\n')
   tmp.replace(base/(name+'.scenario.json'))
   value={k:v for k,v in value.items() if k!='scenario'}
   value['saved']=name+'.scenario.json'
  print(json.dumps(value,ensure_ascii=False),flush=True)
 p.stdin.close();code=p.wait()
 (base/(name+'.exit.json')).write_text(json.dumps({'pid':p.pid,'exitCode':code})+'\n')
 print(json.dumps({'exitCode':code}),flush=True)
