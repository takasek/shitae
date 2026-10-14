// Independent fixed expectations from SPEC's switch rule, not a second reducer.
// First build @shitae/runtime, then run this file. --expect-spec is a red probe
// until all four observations agree with the SPEC expectations.
import { initialState, reduce, activeLocation, activeFrame, formatTree } from '../../../packages/runtime/dist/index.js';

const span = { offset: 0, length: 0, line: 1, col: 1 };
const action = (word, component, session) => ({
  kind: 'transition', word,
  target: component ? { kind: 'component', module: 'main', name: component, variant: null } : null,
  session: session ? { name: session, span } : null, span,
});
const apply = (state, word, component, session) => reduce(state, action(word, component, session)).state;
const entry = () => initialState({ module: 'main', component: 'Entry', variant: null });
const parentSession = (state) => {
  const parent = state.frames.find((f) => f.id === activeFrame(state).parentId);
  return parent?.beginsSession?.name ?? null;
};
const observations = [];
const record = (id, state, actual, expected) => observations.push({
  id, actual, expected, matchesSpec: actual === expected, tree: formatTree(state),
});

let state = apply(entry(), 'present', 'Home', 'home');
state = apply(state, 'push', 'Detail', 'reading');
state = apply(state, 'switch', 'B', 'b');
record('anchor-push-parent', state, parentSession(state), 'reading');
state = apply(state, 'exit', null, 'reading');
record('anchor-push-exit-location', state, activeLocation(state).component, 'Home');

state = apply(entry(), 'present', 'Home', 'home');
state = apply(state, 'switch', 'B', 'b');
state = apply(state, 'present', 'Modal', 'modal');
state = apply(state, 'switch', 'C', 'c');
record('switch-present-parent', state, parentSession(state), 'home');
state = apply(state, 'exit', null, 'modal');
record('switch-present-exit-location', state, activeLocation(state).component, 'C');

const report = {
  baselineCommit: 'e985f4ee58ab76339df5b0f59144e1f1a5da91c8',
  expectedSource: 'docs/SPEC.md:434 and docs/adr/0008-switch-sibling-rule-nearest-switch-ancestor.md',
  observations,
  matches: observations.filter((o) => o.matchesSpec).length,
  total: observations.length,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (process.argv.includes('--expect-spec') && report.matches !== report.total) process.exitCode = 1;
