import json, subprocess, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
CLI = ROOT / "packages/cli/dist/index.js"
AUTHOR = ROOT / "docs/dogfooding/2026-10-23-end-to-end/author/v2"

def session(name, model, replay=None, plan=()):
    command = ["node", str(CLI), "session", str(model)]
    if replay: command += ["--replay", str(replay)]
    events = []
    stderr = (OUT / (name + ".stderr.txt")).open("w")
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True, cwd=ROOT)
    def send(request):
        request["id"] = name + "-" + str(len(events) + 1)
        process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        process.stdin.flush()
        line = process.stdout.readline()
        if not line: raise RuntimeError("No response; see stderr")
        response = json.loads(line)
        events.append({"request":request, "response":response})
        assert response["id"] == request["id"] and response["ok"], response
        return response
    try:
        start=send({"command":"query", "select":["state","actions","metadata","provenanceSummary","review"]})
        for label, expected_variant in plan:
            q=send({"command":"query", "select":["actions"]})
            matches=[a for a in q["data"]["actions"]["items"] if a["actionText"]==label and a["enabled"]]
            assert len(matches)==1, (label,matches)
            response=send({"command":"dispatch", "handle":matches[0]["handle"]})
            if expected_variant is not None:
                assert response["summary"]["location"]["variant"]==expected_variant, response["summary"]
        final=send({"command":"query", "select":["state","actions","provenanceSummary","review"]})
        exported=send({"command":"exportScenario"})
        (OUT/(name+".scenario.json")).write_text(json.dumps(exported["scenario"], ensure_ascii=False, indent=2)+"\n")
        result={"success":True,"start":start["summary"],"final":final["summary"]}
    except Exception as error:
        result={"success":False,"error":str(error)}
    finally:
        process.stdin.close()
        process.wait(timeout=10)
        stderr.close()
        result["exitCode"]=process.returncode
        (OUT/(name+".json")).write_text(json.dumps({"command":command,"events":events,"result":result}, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"name":name,**result}, ensure_ascii=False))
    return result

mode=sys.argv[1]
if mode=="continue":
    session("continued",AUTHOR/"visit.shitae",AUTHOR/"visit.scenario.json",[("見学を予約する","現地案内"),("オンライン案内を選ぶ","オンライン案内"),("取り消す",None)])
elif mode=="resume":
    session("resumed",AUTHOR/"visit.shitae",OUT/"continued.scenario.json")
elif mode=="baseline":
    session("new-requirement-red",AUTHOR/"visit.shitae",plan=[("詳細を見る",None),("見学を予約する","オンライン案内")])
elif mode=="changed":
    session("changed",OUT/"changed/visit.shitae",plan=[("詳細を見る",None),("見学を予約する","オンライン案内"),("現地案内を選ぶ","現地案内"),("取り消す",None),("見学を予約する","オンライン案内"),("確定する",None),("通知を閉じる",None),("一覧へ戻る",None),("詳細を見る",None)])
elif mode=="changed-resume":
    session("changed-resumed",OUT/"changed/visit.shitae",OUT/"changed.scenario.json")
else:
    raise SystemExit("Unknown mode")
