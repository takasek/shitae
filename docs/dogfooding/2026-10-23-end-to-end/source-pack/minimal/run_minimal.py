#!/usr/bin/env python3
"""Public-CLI specification checks. Known defects FAIL at the pinned SHA.

No product imports, private state APIs, patched handles, or scenario migration.
All execution output is written to a newly created run directory.
"""
import datetime,json,os,pathlib,re,subprocess,sys
BASE=pathlib.Path(__file__).resolve().parent
CLI=os.environ.get('SHITAE_CLI')
if not CLI or not pathlib.Path(CLI).is_file():
    sys.exit('Set SHITAE_CLI to the built shitae packages/cli/dist/index.js file.')
plans=json.loads((BASE/'plan.json').read_text())
selection=set(sys.argv[1:])
if selection-set(p['id'] for p in plans):sys.exit('Unknown case ID: '+str(selection-set(p['id'] for p in plans)))
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
OUT=pathlib.Path(os.environ.get('SHITAE_OUTPUT',str(BASE/'runs'/stamp)))
OUT.mkdir(parents=True,exist_ok=False)
results=[]
for p in plans:
    if selection and p['id'] not in selection:continue
    out=OUT/p['id'];out.mkdir()
    model=BASE/'models'/p['model']
    check=subprocess.run(['node',CLI,'check',str(model)],text=True,capture_output=True)
    (out/'check.stdout.txt').write_text(check.stdout);(out/'check.stderr.txt').write_text(check.stderr)
    observed={'exit':check.returncode,'E028':bool(re.search(r'\bE028\b',check.stdout+check.stderr)),'W106':bool(re.search(r'\bW106\b',check.stdout+check.stderr))}
    responses=[];failed=[]
    if not p.get('check_only'):
        with (out/'session.stderr.txt').open('w') as err,(out/'requests.jsonl').open('w') as reqfile,(out/'responses.jsonl').open('w') as respfile:
            proc=subprocess.Popen(['node',CLI,'session',str(model)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True)
            count=0
            def send(req):
                global count
                count+=1;req={'id':str(count),**req};line=json.dumps(req,ensure_ascii=False)
                reqfile.write(line+'\n');reqfile.flush();proc.stdin.write(line+'\n');proc.stdin.flush()
                answer=proc.stdout.readline()
                if not answer:raise RuntimeError('Session ended unexpectedly. See session.stderr.txt.')
                respfile.write(answer);respfile.flush();obj=json.loads(answer)
                if obj.get('id')!=req['id']:raise RuntimeError('Response ID mismatch')
                responses.append(obj);return obj
            try:
                for step in p.get('steps',[]):
                    if 'query' in step:send({'command':'query','select':step['query']})
                    elif 'action' in step:
                        actions=send({'command':'query','select':['actions']})['data']['actions']['items']
                        found=[a for a in actions if a['actionText']==step['action'] and (not step.get('host') or a.get('host',{}).get('component')==step['host']) and (not step.get('scope') or a.get('scope')==step['scope']) and ('path' not in step or a['placement']['path']==step['path'])]
                        if len(found)!=1:raise RuntimeError('Action selection is not unique: '+step['action'])
                        a=found[0]
                        if step.get('detail'):send({'command':'query','select':['action'],'handle':a['handle']})
                        req={'command':'dispatch','handle':a['handle']}
                        if 'branch' in step:
                            branches=[x for x in a['branches'] if x['label']==step['branch']]
                            if len(branches)!=1:raise RuntimeError('Branch selection is not unique')
                            req['branch']=branches[0]['id']
                        response=send(req)
                        if not response.get('ok'):raise RuntimeError('Dispatch rejected: '+str(response.get('error')))
                    else:send(step)
                last=send({'command':'query','select':['state']})
                loc=last['summary']['location'];observed['location']=[loc['module'],loc['component']]
                observed['shared']=[[v['module'],v['component'],v['variant']] for v in last['data']['state']['sharedVariants']]
                observed['overlays']=[[v['module'],v['component'],v['variant']] for v in last['data']['state']['overlays']]
                proc.stdin.close();proc.wait(timeout=10)
                if proc.returncode:raise RuntimeError('Session exit '+str(proc.returncode))
            except Exception as ex:
                proc.kill();proc.wait();failed.append('TRANSPORT: '+str(ex))
    for key,want in p['spec_assertions'].items():
        got=observed.get(key)
        match=want in got if key=='shared' and isinstance(got,list) else want==got
        if not match:failed.append(f'{key}: expected {want!r}; observed {got!r}')
    item={'id':p['id'],'status':'SPEC_PASS' if not failed else 'SPEC_FAIL','known_failure_at_pinned_sha':p['known_failure_at_pinned_sha'],'observed':observed,'failures':failed}
    results.append(item);print(item['status'],p['id'], '; '.join(failed))
(OUT/'summary.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print('Saved:',OUT)
sys.exit(1 if any(x['status']=='SPEC_FAIL' for x in results) else 0)
