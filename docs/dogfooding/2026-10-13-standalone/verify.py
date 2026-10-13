"""Recheck saved models and record output completeness without modifying product code."""
from pathlib import Path
import json, re, subprocess, tempfile, hashlib, collections, platform
report=Path(__file__).resolve().parent
root=report.parents[2]
cli=root/'packages/cli/dist/index.js'
results=[]
with tempfile.TemporaryDirectory(prefix='shitae-dogfood-validation-') as tmp:
    for source in sorted(report.glob('*/models/*.shitae'))+sorted(report.glob('reproductions/*.shitae')):
        relative=str(source.relative_to(report))
        check=subprocess.run(['node',str(cli),'check',str(source)],capture_output=True)
        diagnostic=check.stderr.decode().replace(str(report)+'/', '')
        assert check.returncode==0,diagnostic
        mermaid=subprocess.run(['node',str(cli),'mermaid',str(source)],capture_output=True)
        assert mermaid.returncode==0
        saved=source.with_suffix('.mmd')
        if saved.exists():assert saved.read_bytes()==mermaid.stdout,relative
        html=Path(tmp)/(relative.replace('/','-')+'.html')
        with html.open('wb') as f:
            generated=subprocess.run(['node',str(cli),'simulate',str(source)],stdout=f,stderr=subprocess.PIPE)
        data=html.read_bytes()
        decoded=data.decode('utf8')
        assert generated.returncode==0 and decoded.rstrip().endswith('</html>'),relative
        scripts=re.findall(r'<script>([\s\S]*?)</script>',decoded)
        assert scripts,relative
        for i,script in enumerate(scripts):
            js=Path(tmp)/f'script-{i}.js';js.write_text(script)
            syntax=subprocess.run(['node','--check',str(js)],capture_output=True)
            assert syntax.returncode==0,syntax.stderr
        results.append({'model':relative,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                        'checkExit':check.returncode,'warningCodes':dict(collections.Counter(re.findall(r'\[warning\] (W\d+)',diagnostic))),
                        'diagnostics':diagnostic,'mermaidExit':mermaid.returncode,'savedMermaidMatches':saved.exists(),
                        'simulateFileExit':generated.returncode,'htmlBytes':len(data),'completeHtml':True,'scriptSyntaxExit':0})
    source=report/'sol/models/current.shitae'
    expected=next(r['htmlBytes'] for r in results if r['model']=='sol/models/current.shitae')
    pipe=[]
    for attempt in range(3):
        run=subprocess.run(['node',str(cli),'simulate',str(source)],capture_output=True)
        try:run.stdout.decode('utf8');utf8=True
        except UnicodeDecodeError:utf8=False
        pipe.append({'attempt':attempt+1,'exit':run.returncode,'bytes':len(run.stdout),'fileBytes':expected,
                     'matchesFileLength':len(run.stdout)==expected,'completeHtml':run.stdout.rstrip().endswith(b'</html>'),'validUtf8':utf8})
    runtime=subprocess.run(['node',str(report/'runtime-probes.mjs')],capture_output=True,text=True)
    assert runtime.returncode==0,runtime.stderr
    probes=json.loads(runtime.stdout)
output={'evaluationShitae':'a3ebaedbd5d452c99093a949bbaf94508da43ab4',
        'validationBase':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        'environment':{'os':platform.system(),'machine':platform.machine(),'node':subprocess.check_output(['node','--version'],text=True).strip()},
        'models':results,'capturedPipe':pipe,'runtimeProbes':probes}
(report/'evidence/validation.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'models':len(results),'checkErrors':0,'warnings':{r['model']:r['warningCodes'] for r in results},'pipe':pipe,'runtimeProbes':probes},ensure_ascii=False,indent=2))
