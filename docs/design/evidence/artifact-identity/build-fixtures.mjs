// Controlled identity cases for #24. The engine case changes only supplied
// metadata, not runtime semantics; it does not represent a historical release.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from '../../../../packages/parser/dist/index.js';
import { createMetadata } from '../../../../packages/session/dist/model.js';
import { Session } from '../../../../packages/session/dist/index.js';
import { toSimulator } from '../../../../packages/simulator/dist/index.js';
import assert from 'node:assert/strict';

const output = resolve(process.argv[2]); mkdirSync(output, { recursive: true });
const fixtures = resolve(import.meta.dirname, '../../session-fixtures/provenance/audio/v1');
const original = new Map(['main', 'player'].map(m => [m, readFileSync(resolve(fixtures, m + '.shitae'), 'utf8')]));
const cases = [
  ['A', new Map(original), 'main', undefined],
  ['B', new Map(original), 'main', 'a'.repeat(64)],
  ['C', new Map(original), 'player', undefined],
  ['D', new Map([...original, ['extra', '# Extra\nbody\n']]), 'main', undefined],
  ['E', new Map([['main', '# ライブラリ\n> 再生 -> 記録した\n']]), 'main', undefined],
  ['F', new Map([...original].map(([m, s]) => [m, s + (m === 'player' ? ' \n' : '')])), 'main', undefined],
  ['G', new Map([...original].map(([m, s]) => [m, s + (m === 'main' ? ' \n' : '')])), 'main', undefined],
];
const identities = {};
for (const [name, texts, entryModule, engine] of cases) {
  const documents = new Map([...texts].map(([m, text]) => {
    const result = parse(text); assert.deepEqual(result.diagnostics.filter(d => d.severity === 'error'), []);
    return [m, result.document];
  }));
  const files = new Map(), sources = new Map([...texts].map(([m, t]) => [m, new TextEncoder().encode(t)]));
  const metadata = createMetadata(documents, entryModule, files, sources, engine);
  const session = new Session(documents, entryModule, files, metadata);
  if (name === 'A') {
    session.setTestVariant({ module: 'player', component: 'プレイヤー', variant: '再生中' });
    const act = (text, root) => {
      const action = session.query({ select: ['actions'] }).data.actions.items.find(a => a.actionText === text && (!root || a.placement.root === root));
      assert(action, text); session.dispatch({ handle: action.handle });
    };
    act('確認(先頭.操作可能?)'); session.reset(); act('再生');
    session.dispatch({ handle: session.query({ select: ['actions'] }).data.actions.controls.back.handle });
    act('停止', 'overlay:プレイヤー');
  }
  writeFileSync(resolve(output, name + '.html'), toSimulator(documents, entryModule, undefined, { files, metadata }));
  writeFileSync(resolve(output, name + '.scenario.json'), JSON.stringify(await session.exportScenario(), null, 2) + '\n');
  identities[name] = metadata;
}
writeFileSync(resolve(output, 'identities.oracle.json'), JSON.stringify(identities, null, 2) + '\n');
console.log('Generated A–G HTML/scenario identity cases. B is a controlled metadata-only engine difference.');
