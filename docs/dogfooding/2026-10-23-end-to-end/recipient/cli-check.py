import json, subprocess
from pathlib import Path
root=Path.cwd()
base=root/'docs/dogfooding/2026-10-23-end-to-end'
out=base/'recipient'
cli=['node','packages/cli/dist/index.js','session']
results=[]
def run(version, actions=(), scenario=None, tag=None):
    tag=tag or version
    source=base/'author'/version/'visit.shitae'
    replay=scenario or base/'author'/version/'visit.scenario.json'
    proc=subprocess.Popen(cli+[str(source),'--replay',str(replay)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    reqs=[]; resps=[]; checks=[]
    def ask(command, **kw):
        q={'id':str(len(reqs)+1),'command':command,**kw}
        reqs.append(q); proc.stdin.write(json.dumps(q,ensure_ascii=False)+'\n');proc.stdin.flush()
        line=proc.stdout.readline()
        if not line: raise RuntimeError(proc.stderr.read())
        a=json.loads(line);resps.append(a)
        if a.get('ok') is not True:raise RuntimeError(a)
        return a
    start=ask('query',select=['state','actions','metadata'])
    saved=ask('exportScenario')['scenario']
    expected=json.loads(replay.read_text())
    assert saved['final']['digest']==expected['final']['digest']
    checks.append({'check':'replayed final digest','pass':True,'digest':saved['final']['digest']})
    for label in actions:
        q=ask('query',select=['state','actions'])
        chosen=[a for a in q['data']['actions']['items'] if a['actionText']==label and a['enabled']]
        assert len(chosen)==1,(label,q)
        assert not chosen[0]['branches']
        a=ask('dispatch',handle=chosen[0]['handle'])
        state=ask('query',select=['state','actions'])
        checks.append({'action':label,'summary':state['summary'],'shared':state['data']['state']['sharedVariants'],'overlays':state['data']['state']['overlays']})
    final=ask('exportScenario')['scenario']
    (out/(tag+'.scenario.json')).write_text(json.dumps(final,ensure_ascii=False,indent=2)+'\n')
    proc.stdin.close(); code=proc.wait(timeout=10);stderr=proc.stderr.read()
    assert code==0 and not stderr,(code,stderr)
    (out/(tag+'.requests.jsonl')).write_text(''.join(json.dumps(q,ensure_ascii=False)+'\n' for q in reqs))
    (out/(tag+'.responses.jsonl')).write_text(''.join(json.dumps(q,ensure_ascii=False)+'\n' for q in resps))
    (out/(tag+'.stderr.txt')).write_text(stderr)
    result={'tag':tag,'pid':proc.pid,'exitCode':code,'checks':checks,'steps':len(final['steps']),'finalDigest':final['final']['digest']}
    results.append(result)
    return out/(tag+'.scenario.json')
run('v1')
new=run('v2',['見学を予約する','オンライン案内を選ぶ','取り消す','見学を予約する','オンライン案内を選ぶ','確定する','通知を閉じる','一覧へ戻る','詳細を見る'],tag='v2-continued')
run('v2',scenario=new,tag='v2-continued-replayed')
bad=subprocess.run(cli+[str(base/'author/v2/visit.shitae'),'--replay',str(base/'author/v1/visit.scenario.json')],input='',text=True,capture_output=True)
assert bad.returncode!=0 and 'MODEL_MISMATCH' in bad.stderr and not bad.stdout
(out/'mismatch.stderr.txt').write_text(bad.stderr)
results.append({'tag':'v1-scenario-on-v2','exitCode':bad.returncode,'expected':'MODEL_MISMATCH','pass':True})
(out/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([{'tag':r['tag'],'exitCode':r['exitCode'],'steps':r.get('steps'),'pid':r.get('pid')} for r in results],ensure_ascii=False,indent=2))
