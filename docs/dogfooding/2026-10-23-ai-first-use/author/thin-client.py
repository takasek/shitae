import sys, subprocess, json
from pathlib import Path
root = Path(__file__).resolve().parent
version = sys.argv[1]
p = subprocess.Popen(['node', 'packages/cli/dist/index.js', 'session', str(root/version/'equipment.shitae')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
with (root/version/'cli.requests.jsonl').open('w') as req, (root/version/'cli.responses.jsonl').open('w') as resp:
    for line in sys.stdin:
        req.write(line); req.flush()
        p.stdin.write(line); p.stdin.flush()
        answer = p.stdout.readline()
        resp.write(answer); resp.flush()
        print(answer, end='', flush=True)
p.stdin.close()
p.wait()
