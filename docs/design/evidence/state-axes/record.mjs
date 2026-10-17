// Thin JSONL client for the public `shitae session` CLI: picks each named operation from a fresh actions query, then exports the scenario and the #23 review text.
// Usage: node record.mjs <model.shitae> <out-prefix> <Operation|Operation[Label]>...
// Writes <out-prefix>.jsonl (every request/response), <out-prefix>.scenario.json, <out-prefix>.review.txt. Refuses to overwrite.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');
const [model, prefix, ...ops] = process.argv.slice(2);
if (!model || !prefix || ops.length === 0) {
  console.error('usage: node record.mjs <model.shitae> <out-prefix> <Operation|Operation[Label]>...');
  process.exit(2);
}
for (const ext of ['.jsonl', '.scenario.json', '.review.txt']) if (existsSync(prefix + ext)) throw new Error(`refusing to overwrite ${prefix + ext}`);

const child = spawn(process.execPath, [resolve(root, 'packages/cli/dist/index.js'), 'session', model], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
const lines = createInterface({ input: child.stdout });
const log = [];
const pending = [];
lines.on('line', (line) => { const value = JSON.parse(line); log.push({ direction: 'out', value }); pending.shift()(value); });
let id = 0;
const send = (request) => new Promise((done) => {
  const value = { id: String(++id), ...request };
  log.push({ direction: 'in', value });
  pending.push(done);
  child.stdin.write(JSON.stringify(value) + '\n');
});

for (const spec of ops) {
  const [, op, label] = spec.match(/^([^[]+)(?:\[(.+)\])?$/);
  const list = await send({ command: 'query', select: ['actions'] });
  const action = list.data.actions.items.find((a) => a.actionText === op || a.actionText.startsWith(`${op}(`));
  if (!action || !action.enabled) throw new Error(`${op} is ${action ? 'disabled' : 'not offered'} here`);
  const branch = label ? action.branches.find((b) => b.label === label)?.id : undefined;
  if (label && !branch) throw new Error(`${op} has no branch [${label}]`);
  const d = await send({ command: 'dispatch', handle: action.handle, ...(branch ? { branch } : {}) });
  if (!d.ok) throw new Error(`${op} rejected: ${JSON.stringify(d)}`);
}
const state = await send({ command: 'query', select: ['state'] });
const review = await send({ command: 'query', select: ['review'] });
const exported = await send({ command: 'exportScenario' });
child.stdin.end();
writeFileSync(prefix + '.jsonl', log.map((l) => JSON.stringify(l)).join('\n') + '\n');
writeFileSync(prefix + '.scenario.json', JSON.stringify(exported.scenario, null, 2) + '\n');
writeFileSync(prefix + '.review.txt', review.data.review.text);
console.log(JSON.stringify({ shared: state.data.state.sharedVariants.map((v) => `${v.component}##${v.variant}`), overlays: state.data.state.overlays.map((o) => o.component) }));
