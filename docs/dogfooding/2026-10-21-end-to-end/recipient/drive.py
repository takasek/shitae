# 受領者が使った driver: 1 process に JSON Lines を送り、応答を逐次読む。
import json, subprocess, sys
root, model, replay, out_prefix, mode = sys.argv[1:6]
p = subprocess.Popen(["node","packages/cli/dist/index.js","session",model,"--replay",replay],
    cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
log=[]
def send(req):
    p.stdin.write(json.dumps(req,ensure_ascii=False)+"\n"); p.stdin.flush()
    line=p.stdout.readline(); resp=json.loads(line); log.append((req,resp)); return resp
counts={"query":0,"dispatch":0,"exportScenario":0}
def s(req):
    counts[req["command"]]+=1; return send(req)
if mode=="A":
    a=s({"id":"a1","command":"query","select":["actions"]})
    items=a["data"]["actions"]["items"]
    tgt=[i for i in items if i["actionText"].startswith("保存(ReplaceDisk)")][0]
    br=[b for b in tgt["branches"] if b["label"]=="再確認一致"][0]["id"]
    d=s({"id":"d1","command":"dispatch","handle":tgt["handle"],"branch":br})
    s({"id":"q1","command":"query","select":["state","actions"]})
    e=s({"id":"e1","command":"exportScenario"})
    json.dump(e["scenario"],open(out_prefix+".scenario.json","w"),ensure_ascii=False,indent=None)
else:
    s({"id":"q1","command":"query","select":["state","actions"]})
p.stdin.close(); rc=p.wait(); err=p.stderr.read()
with open(out_prefix+".log.jsonl","w") as f:
    for req,resp in log: f.write(json.dumps({"request":req,"response":resp},ensure_ascii=False)+"\n")
print("exit",rc,"stderr",repr(err),"counts",counts)
