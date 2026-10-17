// Drives the public `shitae session` CLI through the combinations in expectations.md and compares each step with the expected reading.
// Usage: node check-axes.mjs <model.shitae> <original|split> [--out result.json]
// The reading profile is the human mapping from a model's singletons to the questions in expectations.md; the expectations themselves do not depend on the model.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../..');
const cli = resolve(root, 'packages/cli/dist/index.js');

const shared = (state, component) => state.sharedVariants.find((v) => v.component === component)?.variant;
const profiles = {
  // Saved Sol proposed: DocumentStatus holds syntax validity and conflict in one variant set.
  original: {
    conflict: (s) => shared(s, 'DocumentStatus') === 'Conflict',
    syntax: (s) => shared(s, 'DocumentStatus') !== 'Invalid',
  },
  // Derived model: syntax and disk conflict are separate singletons.
  split: {
    conflict: (s) => shared(s, 'DiskStatus') === 'Conflict',
    syntax: (s) => shared(s, 'SyntaxStatus') === 'Valid',
  },
};

const read = (profile, state, actions) => {
  const frame = state.frames.find((f) => f.id === state.activeFrameId);
  const node = actions.items.find((a) => a.actionText.startsWith('NodeDoubleClick'));
  return {
    conflict: profile.conflict(state),
    syntax: profile.syntax(state),
    diagram: shared(state, 'DiagramView') === 'Ready',
    notice: state.overlays.some((o) => o.component === 'RecoveryNotice'),
    review: frame.stack.at(-1).component === 'VersionReview',
    node: node ? node.enabled : null,
  };
};

// Each step names the operation and, where the result list is labelled, the branch label to choose. `expect` lists only the aspects expectations.md states for that row.
const initial = { conflict: false, syntax: true, diagram: true, notice: false, review: false };
const combos = [
  ['C1', [
    ['Conflict', null, { conflict: true, notice: true }],
    ['ParseError', null, { conflict: true, syntax: false, diagram: false, notice: true }],
    ['ValidInput', null, { conflict: true, syntax: true, diagram: true, notice: true }],
  ]],
  ['C2', [
    ['Conflict', null, { conflict: true, notice: true, review: false }],
    ['Review', null, { conflict: true, notice: false, review: true }],
    ['KeepEditing', null, { conflict: true, notice: true, review: false }],
  ]],
  ...[['C3-SaveCopy', 'SaveCopy', 'Success'], ['C3-ReplaceReviewedDisk', 'ReplaceReviewedDisk', 'ConfirmedFresh'], ['C3-UseDiskVersion', 'UseDiskVersion', 'ConfirmedFresh']].map(([name, op, label]) => [name, [
    ['Conflict', null, { conflict: true }],
    ['Review', null, { conflict: true, review: true }],
    [op, label, { conflict: false, syntax: true, notice: false, review: false }],
  ]]),
  ['C3-DiskChangedAgain', [
    ['Conflict', null, { conflict: true }],
    ['Review', null, { conflict: true, review: true }],
    ['DiskChangedAgain', null, { conflict: true, notice: false, review: true }],
  ]],
  ['C4', [
    ['ParseError', null, { conflict: false, syntax: false, diagram: false }],
    ['Conflict', null, { conflict: true, syntax: false, diagram: false }],
    ['Review', null, { conflict: true, syntax: false, diagram: false }],
    ['SaveCopy', 'Success', { conflict: false, syntax: false, diagram: false }],
  ]],
  ['C5', [
    ['Conflict', null, { conflict: true }],
    ['DiagramOnly', null, { conflict: true, diagram: true, node: true }],
    ['ParseError', null, { conflict: true, diagram: false, node: false }],
    ['ValidInput', null, { conflict: true, diagram: true, node: true }],
  ]],
];

const open = (model) => {
  const child = spawn(process.execPath, [cli, 'session', model], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout });
  const pending = [];
  lines.on('line', (line) => pending.shift()(JSON.parse(line)));
  let id = 0;
  const send = (request) => new Promise((done) => {
    pending.push(done);
    child.stdin.write(JSON.stringify({ id: String(++id), ...request }) + '\n');
  });
  return { send, close: () => child.stdin.end() };
};

const run = async (model, profileName) => {
  const profile = profiles[profileName];
  if (!profile) throw new Error(`unknown profile ${profileName}`);
  const report = [];
  for (const [name, steps] of combos) {
    const session = open(model);
    const look = async () => {
      const r = await session.send({ command: 'query', select: ['state', 'actions'] });
      if (!r.ok) throw new Error(JSON.stringify(r));
      return { reading: read(profile, r.data.state, r.data.actions), actions: r.data.actions.items };
    };
    let { reading, actions } = await look();
    const mismatches = Object.entries(initial).filter(([k, v]) => reading[k] !== v).map(([k, v]) => ({ step: 'initial', aspect: k, expected: v, actual: reading[k] }));
    for (const [op, label, expect] of steps) {
      const action = actions.find((a) => a.actionText === op || a.actionText.startsWith(`${op}(`));
      if (!action || !action.enabled) {
        mismatches.push({ step: op, aspect: 'available', expected: true, actual: action ? 'disabled' : 'missing' });
        break;
      }
      const branch = label === null ? undefined : action.branches.find((b) => b.label === label)?.id;
      if (label !== null && branch === undefined) throw new Error(`${name}: ${op} has no branch [${label}]`);
      const d = await session.send({ command: 'dispatch', handle: action.handle, ...(branch === undefined ? {} : { branch }) });
      if (!d.ok) throw new Error(`${name}: ${op} rejected ${JSON.stringify(d)}`);
      ({ reading, actions } = await look());
      for (const [k, v] of Object.entries(expect)) if (reading[k] !== v) mismatches.push({ step: op, aspect: k, expected: v, actual: reading[k] });
    }
    session.close();
    report.push({ combo: name, steps: steps.map(([op, label]) => (label ? `${op} [${label}]` : op)), mismatches });
  }
  return report;
};

const [model, profileName, ...rest] = process.argv.slice(2);
if (!model || !profileName) {
  console.error('usage: node check-axes.mjs <model.shitae> <original|split> [--out result.json]');
  process.exit(2);
}
const report = await run(model, profileName);
const out = rest[0] === '--out' ? rest[1] : null;
const failed = report.filter((r) => r.mismatches.length > 0);
const summary = { model, profile: profileName, combos: report.length, failedCombos: failed.map((r) => r.combo), report };
if (out) writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
for (const r of report) console.log(`${r.mismatches.length ? 'FAIL' : 'ok  '} ${r.combo}: ${r.steps.join(' → ')}${r.mismatches.map((m) => `\n     ${m.step} ${m.aspect}: expected ${m.expected}, got ${m.actual}`).join('')}`);
process.exit(failed.length ? 1 : 0);
