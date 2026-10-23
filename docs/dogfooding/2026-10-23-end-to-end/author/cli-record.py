"""Thin JSONL client: no runtime imports; select current public handles by actionText."""
import json, pathlib, subprocess, sys
root = pathlib.Path(__file__).resolve().parent
version = sys.argv[1]
out = root / version
p = subprocess.Popen(['node', 'packages/cli/dist/index.js', 'session', str(out / 'visit.shitae')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=(out/'session.stderr.txt').open('w'), text=True)
req = (out/'requests.jsonl').open('w')
resp = (out/'responses.jsonl').open('w')
counter = 0
def send(command, **kw):
    global counter
    counter += 1
    request = dict(id=f'r{counter}', command=command, **kw)
    line = json.dumps(request, ensure_ascii=False)
    req.write(line+'\n'); req.flush()
    p.stdin.write(line+'\n'); p.stdin.flush()
    answer = p.stdout.readline()
    resp.write(answer); resp.flush()
    data = json.loads(answer)
    assert data['id'] == request['id'] and data['ok'], data
    return data

def act(text):
    q = send('query', select=['actions'])
    items = [a for a in q['data']['actions']['items'] if a['actionText'] == text and a['enabled']]
    assert len(items) == 1, items
    d = send('dispatch', handle=items[0]['handle'])
    print(text, json.dumps(d['summary'], ensure_ascii=False))

def snapshot(name):
    q = send('query', select=['state', 'actions', 'metadata'])
    (out/(name+'.json')).write_text(json.dumps(q,ensure_ascii=False,indent=2)+'\n')

snapshot('initial')
act('詳細を見る'); act('見学を予約する'); act('オンライン案内を選ぶ')
snapshot('before-cancel')
act('取り消す')
snapshot('after-cancel')
act('見学を予約する')
snapshot('reopened-confirmation')
act('確定する')
snapshot('after-confirm')
if version == 'v2':
    act('通知を閉じる')
    snapshot('after-hide')
act('一覧へ戻る'); act('詳細を見る')
snapshot('final')
saved = send('exportScenario')
(out/'visit.scenario.json').write_text(json.dumps(saved['scenario'],ensure_ascii=False,indent=2)+'\n')
p.stdin.close()
assert p.wait(timeout=10) == 0
req.close(); resp.close()
