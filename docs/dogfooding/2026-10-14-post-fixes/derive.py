"""Generate isolated comparison models; never rewrite saved source models."""
from pathlib import Path
import hashlib, subprocess, json, difflib, re
here=Path(__file__).resolve().parent;root=here.parents[2]
source=here.parent/'2026-10-13-standalone/sol/models/proposed.shitae'
original=source.read_text(); dest=here/'derived';dest.mkdir(exist_ok=True)
status=original.replace('state: SavedOrUnsaved','"Document state: valid": SavedOrUnsaved').replace('state: DiagramUnavailable','"Document state: invalid": DiagramUnavailable').replace('state: ExternalChange','"Document state: conflict": ExternalChange',1)
for key,content,purpose in [
 ('sol-proposed-alias',original.replace('NodeDoubleClick(DiagramView.graph?)','NodeDoubleClick(diagram.graph?)'),'Remove only the real-component gate workaround'),
 ('sol-proposed-readable-status',status,'Test whether semantic aliases make status variants understandable without a new observation UI')]:
    model=dest/(key+'.shitae');model.write_text(content)
    (dest/(key+'.diff')).write_text(''.join(difflib.unified_diff(original.splitlines(True),content.splitlines(True),fromfile=str(source.relative_to(root)),tofile=str(model.relative_to(root)))))
    rows=[]
    for command in ['check','mermaid','simulate']:
        result=subprocess.run(['node',str(root/'packages/cli/dist/index.js'),command,str(model)],capture_output=True)
        if command!='check':(dest/(key+('.mmd' if command=='mermaid' else '.html'))).write_bytes(result.stdout)
        rows.append(dict(command=command,exit=result.returncode,stderr=result.stderr.decode(),warningCodes=re.findall(r'\[warning\] (W\d+)',result.stderr.decode())))
        assert result.returncode==0
    (dest/(key+'-validation.json')).write_text(json.dumps(dict(purpose=purpose,originalSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),derivedSHA256=hashlib.sha256(model.read_bytes()).hexdigest(),commands=rows),ensure_ascii=False,indent=2)+'\n')
print('Generated 2 comparison models; saved sources were read only.')
