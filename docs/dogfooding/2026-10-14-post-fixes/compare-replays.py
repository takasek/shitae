"""Recompute the exact saved main DOM-snapshot comparison (no whitespace normalization)."""
from pathlib import Path
import json, hashlib
here=Path(__file__).resolve().parent
observations={row['id']:row['snapshot'] for row in json.loads((here/'evidence/browser-observations.json').read_text())}
def main_snapshot(snapshot):
    assert '- main:' in snapshot
    return snapshot.split('- main:',1)[1].split('  - generic "遷移マップ"',1)[0]
rows=[]
for first,repeat in [('sol-proposed-close-last','replay-close'),('astra-proposed-b-edit','astra-replay-b-edit')]:
    a=main_snapshot(observations[first]);b=main_snapshot(observations[repeat])
    rows.append(dict(first=first,repeat=repeat,mainDOMSnapshotIdentical=a==b,
      extraction='split after first "- main:", then before first "  - generic \\"遷移マップ\\""; preserve all whitespace; hash UTF-8 bytes',
      firstComparedText=a,repeatComparedText=b,
      firstSHA256=hashlib.sha256(a.encode('utf8')).hexdigest(),repeatSHA256=hashlib.sha256(b.encode('utf8')).hexdigest()))
assert all(row['mainDOMSnapshotIdentical'] for row in rows)
(here/'evidence/replay-comparison.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print('Two saved main DOM snapshots match their repeats; compared text and SHA256 recorded.')
