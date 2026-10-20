import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[5]
out = Path(__file__).resolve().parent
model = root / 'docs/dogfooding/2026-10-20-end-to-end/models/author/revised/library-v1.shitae'
p = subprocess.Popen(['node','packages/cli/dist/index.js','session',str(model)],cwd=root,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
trace=[]
def request(command, **params):
    q=dict(id=f'v2-{len(trace)+1}',command=command,**params)
    p.stdin.write(json.dumps(q,ensure_ascii=False)+'\n');p.stdin.flush()
    r=json.loads(p.stdout.readline());trace.append(dict(request=q,response=r))
    assert r['ok'],r
    return r

sequence=[('検索する','図書検索'),('本','本の詳細'),('予約する','予約確認'),('戻る','本の詳細'),('予約する','予約確認'),('取り消す','本の詳細'),('戻る','図書検索'),('本','本の詳細'),('予約する','予約確認'),('確定する','予約完了'),('戻る','図書検索')]
try:
    for action,expected in sequence:
        q=request('query',select=['actions'])
        candidates=[a for a in q['data']['actions']['items'] if a['actionText']==f'タップ({action})']
        assert len(candidates)==1,candidates
        r=request('dispatch',handle=candidates[0]['handle'])
        assert r['summary']['location']['component']==expected,r
    saved=request('exportScenario')
    scenario=out/'library-v2-new.scenario.json'
    scenario.write_text(json.dumps(saved['scenario'],ensure_ascii=False,indent=2)+'\n')
finally:
    p.stdin.close();p.wait()
    (out/'v2-cli-trace.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
    (out/'v2-cli.stderr.txt').write_text(p.stderr.read())
replay=subprocess.run(['node','packages/cli/dist/index.js','session',str(model),'--replay',str(scenario)],cwd=root,input='{"id":"resumed","command":"query","select":["state","actions"]}\n',text=True,capture_output=True)
(out/'v2-new-scenario-replay.stdout.txt').write_text(replay.stdout)
(out/'v2-new-scenario-replay.stderr.txt').write_text(replay.stderr)
assert replay.returncode==0,replay.stderr
resumed=json.loads(replay.stdout)
assert resumed['summary']['location']==saved['summary']['location'],resumed
status=dict(dispatches=len(sequence),requests=len(trace),processExit=p.returncode,replayExit=replay.returncode,final=resumed['summary'])
(out/'v2-new-scenario-status.json').write_text(json.dumps(status,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(status,ensure_ascii=False))
