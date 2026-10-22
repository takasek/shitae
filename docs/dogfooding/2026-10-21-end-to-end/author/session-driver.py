import subprocess, json, sys
model=sys.argv[1]
p=subprocess.Popen(["node","packages/cli/dist/index.js","session",model],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,cwd="/Users/m5/works/shitae/.worktrees/dogfood-2026-10-21")
n=0
def send(o):
    global n; n+=1; o["id"]=f"r{n}"
    p.stdin.write(json.dumps(o,ensure_ascii=False)+"\n"); p.stdin.flush()
    return json.loads(p.stdout.readline())
def acts():
    r=send({"command":"query","select":["actions"]})
    return r["data"]["actions"]["items"]
def do(text,branch_label=None):
    for a in acts():
        if a["actionText"]==text and a.get("enabled",True):
            o={"command":"dispatch","handle":a["handle"]}
            if branch_label:
                b=[x for x in a["branches"] if branch_label in x["label"]][0]; o["branch"]=b["id"]
            r=send(o); return r
    return {"NOT_FOUND":text,"have":[a["actionText"] for a in acts()]}
def stack():
    r=send({"command":"query","select":["state"]})
    return json.dumps(r["data"]["state"],ensure_ascii=False)[:600]
for step in sys.argv[2:]:
    t,_,b=step.partition("|")
    r=do(t,b or None)
    print("STEP",step,"->",json.dumps(r,ensure_ascii=False)[:300])
    print("  actions:",[a["actionText"] for a in acts()])
p.stdin.close()
