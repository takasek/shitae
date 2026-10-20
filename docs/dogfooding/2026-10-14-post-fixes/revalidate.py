"""Reuse old verification checks, with isolated outputs and current acceptance criteria."""
from pathlib import Path
import subprocess, json, re, hashlib, collections, platform, difflib, tempfile
here=Path(__file__).resolve().parent
root=here.parents[2]
old=here.parent/'2026-10-13-standalone'
cli=root/'packages/cli/dist/index.js'
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
assert sha=='e985f4ee58ab76339df5b0f59144e1f1a5da91c8'
generated=here/'generated'; generated.mkdir(exist_ok=True)
digest=lambda b:hashlib.sha256(b).hexdigest()
def syntax_exit(script):
    with tempfile.TemporaryDirectory(prefix='shitae-post-fixes-syntax-') as tmp:
        js=Path(tmp)/'script.js';js.write_text(script)
        return subprocess.run(['node','--check',str(js)],capture_output=True).returncode
old_results=json.loads((old/'evidence/validation.json').read_text())
results=[]
for source in sorted(old.glob('*/models/*.shitae'))+sorted(old.glob('reproductions/*.shitae')):
    relative=str(source.relative_to(old)); key=relative.replace('/','-').removesuffix('.shitae')
    check=subprocess.run(['node',str(cli),'check',str(source)],capture_output=True)
    diagnostic=check.stderr.decode().replace(str(old)+'/', '')
    mermaid=subprocess.run(['node',str(cli),'mermaid',str(source)],capture_output=True)
    (generated/(key+'.mmd')).write_bytes(mermaid.stdout)
    saved=source.with_suffix('.mmd')
    matches=saved.read_bytes()==mermaid.stdout if saved.exists() else None
    if saved.exists() and not matches:
        (generated/(key+'.diff')).write_text(''.join(difflib.unified_diff(saved.read_text().splitlines(True),mermaid.stdout.decode().splitlines(True))))
    html=generated/(key+'.html')
    with html.open('wb') as f:
        run=subprocess.run(['node',str(cli),'simulate',str(source)],stdout=f,stderr=subprocess.PIPE)
    data=html.read_bytes(); decoded=data.decode('utf8')
    scripts=re.findall(r'<script>([\s\S]*?)</script>',decoded)
    syntax=[]
    for i,s in enumerate(scripts):
        syntax.append(syntax_exit(s))
    previous=next(r for r in old_results['models'] if r['model']==relative)
    warnings=dict(collections.Counter(re.findall(r'\[warning\] (W\d+)',diagnostic)))
    result=dict(model=relative,sha256=digest(source.read_bytes()),checkExit=check.returncode,warningCodes=warnings,
      diagnostics=diagnostic,diagnosticsMatchOld=diagnostic==previous['diagnostics'],mermaidExit=mermaid.returncode,
      savedMermaidMatches=matches,simulateFileExit=run.returncode,htmlBytes=len(data),htmlSHA256=digest(data),
      completeHtml=decoded.rstrip().endswith('</html>'),validUtf8=True,scriptSyntaxExits=syntax)
    results.append(result)
    assert check.returncode==mermaid.returncode==run.returncode==0
    assert result['completeHtml'] and scripts and all(x==0 for x in syntax)
source=old/'sol/models/current.shitae'; expected=(generated/'sol-models-current.html').read_bytes(); pipes=[]
for i in range(3):
    run=subprocess.run(['node',str(cli),'simulate',str(source)],capture_output=True)
    decoded=run.stdout.decode('utf8'); scripts=re.findall(r'<script>([\s\S]*?)</script>',decoded)
    syntax=[]
    for j,s in enumerate(scripts):
        syntax.append(syntax_exit(s))
    record=dict(attempt=i+1,exit=run.returncode,bytes=len(run.stdout),sha256=digest(run.stdout),
      byteIdenticalToFile=run.stdout==expected,validUtf8=True,completeHtml=decoded.rstrip().endswith('</html>'),scriptSyntaxExits=syntax)
    pipes.append(record)
    assert run.returncode==0 and record['byteIdenticalToFile'] and record['completeHtml'] and scripts and all(x==0 for x in syntax)
# Reuse old bounded probe without modifying it or adopting its old bug outcomes.
probe=subprocess.run(['node',str(old/'runtime-probes.mjs')],capture_output=True,text=True)
assert probe.returncode==0,probe.stderr
probes=json.loads(probe.stdout)
for state,expected_enabled in [('ready',True),('error',False),('restored',True)]:
    rows=probes['aliasMember'][state]
    assert rows[0]['enabled']==rows[1]['enabled']==expected_enabled
    assert rows[2]['enabled'] is True
for row in probes['inline']:
    assert all(name in row['rendered'] for name in ['New','Save','Format'])
output=dict(evaluationShitae=sha,environment=dict(os=platform.platform(),node=subprocess.check_output(['node','--version'],text=True).strip(),pnpm=subprocess.check_output(['pnpm','--version'],text=True).strip()),lockSHA256=digest((root/'pnpm-lock.yaml').read_bytes()),models=results,capturedPipe=pipes,runtimeProbes=probes)
(here/'evidence/validation.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(models=len(results),warnings=[r['warningCodes'] for r in results],diagnosticsMatchOld=all(r['diagnosticsMatchOld'] for r in results),mermaidMatchesOld=all(r['savedMermaidMatches'] is not False for r in results),pipes=pipes),ensure_ascii=False,indent=2))
