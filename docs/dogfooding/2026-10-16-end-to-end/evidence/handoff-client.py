"""Thin public JSONL client: query, choose one action, dispatch, export."""
import json
import pathlib
import subprocess

ROOT = pathlib.Path('/private/tmp/shitae-e2e-20261016-01a1424a')
BASE = ROOT / 'docs/dogfooding/2026-10-16-end-to-end'
MODEL = BASE / 'evidence/handoff-model/proposed.shitae'
MODEL.parent.mkdir(exist_ok=False)
MODEL.write_bytes((BASE / 'models/sol-original/proposed.shitae').read_bytes())
checks = []
for command in ['check', 'simulate']:
    result = subprocess.run(['node', 'packages/cli/dist/index.js', command, str(MODEL)], cwd=ROOT, capture_output=True, text=True)
    checks.append({'command': command, 'exitCode': result.returncode, 'stderr': result.stderr, 'stdoutBytes': len(result.stdout.encode())})
    if command == 'simulate':
        (BASE / 'evidence/handoff-regenerated.html').write_text(result.stdout)
    if result.returncode:
        raise SystemExit(result.stderr)
(BASE / 'evidence/handoff-checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')

p = subprocess.Popen(['node', 'packages/cli/dist/index.js', 'session', str(MODEL), '--replay', str(BASE / 'scenarios/sol-cli-diverged.scenario.json')], cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
transcript = []
def send(request):
    p.stdin.write(json.dumps(request, ensure_ascii=False) + '\n')
    p.stdin.flush()
    line = p.stdout.readline()
    if not line:
        raise RuntimeError(p.stderr.read())
    response = json.loads(line)
    transcript.append({'request': request, 'response': response})
    if not response.get('ok'):
        raise RuntimeError(response)
    return response

initial = send({'id': 'resume', 'command': 'query', 'select': ['actions', 'state', 'metadata']})
print(json.dumps(initial, ensure_ascii=False))
actions = initial['data']['actions']['items']
chosen = next(x for x in actions if x.get('actionText') == 'SourceOnly')
print('CHOSEN ' + json.dumps(chosen, ensure_ascii=False))
after = send({'id': 'continue-source', 'command': 'dispatch', 'handle': chosen['handle']})
print(json.dumps(after, ensure_ascii=False))
summary = send({'id': 'after', 'command': 'query'})
print(json.dumps(summary, ensure_ascii=False))
export = send({'id': 'save', 'command': 'exportScenario'})
(BASE / 'scenarios/handoff-resumed.scenario.json').write_text(json.dumps(export['scenario'], ensure_ascii=False, indent=2) + '\n')
p.stdin.close()
p.wait(timeout=20)
(BASE / 'evidence/handoff-cli.json').write_text(json.dumps({'transcript': transcript, 'exitCode': p.returncode, 'stderr': p.stderr.read()}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'checks': checks, 'exitCode': p.returncode, 'exportSteps': len(export['scenario']['steps']), 'final': export['scenario']['final']['view']['view']['location']}, ensure_ascii=False))
