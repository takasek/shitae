import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[5]
out = Path(__file__).resolve().parent
model = root / 'docs/dogfooding/2026-10-20-end-to-end/models/author/library-v1.shitae'
p = subprocess.Popen(['node', 'packages/cli/dist/index.js', 'session', str(model)], cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
trace = []
def request(command, **params):
    q = dict(id=f'a{len(trace)+1}', command=command, **params)
    p.stdin.write(json.dumps(q, ensure_ascii=False)+'\n')
    p.stdin.flush()
    r = json.loads(p.stdout.readline())
    trace.append(dict(request=q,response=r))
    assert r['ok'], r
    return r
def act(name, expected):
    q = request('query', select=['actions'])
    candidates = [a for a in q['data']['actions']['items'] if a['actionText'] == f'タップ({name})']
    assert len(candidates)==1, candidates
    r = request('dispatch', handle=candidates[0]['handle'])
    assert r['summary']['location']['component']==expected, r
    return r

try:
    act('検索する','図書検索')
    act('本','本の詳細')
    act('予約する','予約確認')
    act('戻る','予約確認')
    request('query', select=['state'])
    act('取り消す','本の詳細')
    act('戻る','図書検索')
    act('本','本の詳細')
    act('予約する','予約確認')
    act('確定する','予約完了')
    request('query', select=['state'])
    act('戻る','図書検索')
    saved = request('exportScenario')
    (out/'library-v1.scenario.json').write_text(json.dumps(saved['scenario'], ensure_ascii=False, indent=2)+'\n')
finally:
    p.stdin.close()
    p.wait()
    (out/'v1-cli-trace.json').write_text(json.dumps(trace, ensure_ascii=False, indent=2)+'\n')
    (out/'v1-cli.stderr.txt').write_text(p.stderr.read())
print(json.dumps(dict(requests=len(trace), processExit=p.returncode, final=trace[-1]['response'].get('summary')),ensure_ascii=False))
