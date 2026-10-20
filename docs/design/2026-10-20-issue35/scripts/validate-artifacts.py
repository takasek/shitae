from pathlib import Path
import re,json,subprocess,hashlib,tempfile
B=Path(__file__).resolve().parents[1];R=B.parents[2]
links=[]
for f in B.glob('*.md'):
 for target in re.findall(r'\]\(([^)]+)\)',f.read_text()):
  if ':' in target or target.startswith('#'):continue
  path=(f.parent/target.split('#')[0]);links.append({'source':f.name,'target':target,'exists':path.exists()})
assert all(x['exists'] for x in links),links
html=[]
for f in [B/'ui-proposal.html',B/'evidence/model.html',B/'evidence/current.html',B/'evidence/v2/model.html']:
 s=f.read_text();assert s.rstrip().endswith('</html>'),f
 for js in re.findall(r'<script[^>]*>(.*?)</script>',s,re.S):
  with tempfile.NamedTemporaryFile(suffix='.js',mode='w') as tmp:
   tmp.write(js);tmp.flush();check=subprocess.run(['node','--check',tmp.name],capture_output=True,text=True);assert check.returncode==0,check.stderr
 html.append({'path':str(f.relative_to(B)),'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'scriptSyntax':'passed'})
tracked=subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=R,text=True).splitlines();assert not tracked,tracked
untracked=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=R,text=True).splitlines();assert all(x.startswith(str(B.relative_to(R))+'/') for x in untracked),untracked
logs=json.loads((B/'evidence/v2/model-cli.json').read_text());m=next(x['response']['data']['metadata'] for x in logs if 'metadata' in x['response'].get('data',{}))
r={'markdownLinks':links,'html':html,'modelMetadata':m,'trackedChanges':tracked,'untrackedFileCount':len(untracked),'allNewFilesInsideDesignDirectory':True}
(B/'evidence/artifact-validation.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'html':html,'trackedChanges':tracked,'untrackedFileCount':len(untracked)},indent=2))
