// Usage: node build-browser-fixtures.mjs <out-dir>
// Copies ./model into two absolute directories (one with Japanese and a space), generates HTML with the CLI in each,
// checks the HTML is identical and path-free, and writes CLI-side scenarios for the browser check.
import { cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../../..');
const cli = join(repo, 'packages/cli/dist/index.js');
const { loadModel } = await import(join(repo, 'packages/cli/dist/model.js'));
const { Session } = await import(join(repo, 'packages/session/dist/index.js'));
const out = resolve(process.argv[2]);
const dirs = [join(out, '作業 A'), join(out, 'dir-B')];
const html = dirs.map((dir) => {
  mkdirSync(dir, { recursive: true }); cpSync(join(here, 'model'), dir, { recursive: true });
  const text = execFileSync('node', [cli, 'simulate', join(dir, 'main.shitae')], { encoding: 'utf8' });
  writeFileSync(join(dir, 'main.html'), text);
  return text;
});
const leaks = dirs.flatMap((d) => [d, realpathSync(d)]).filter((d) => html.some((h) => h.includes(d)));
const checks = { identicalHtml: html[0] === html[1], absolutePathLeaks: leaks, bodyPathKept: html[0].includes('/Users/someone/notes.shitae') };

function scenario(dir, steps) {
  const p = loadModel(join(dir, 'main.shitae'));
  const s = new Session(p.documents, p.entryModule, p.modulePaths, p.metadata);
  for (const text of steps) {
    const a = s.query({ select: ['actions'] }).data.actions.items.find((i) => i.actionText === text);
    s.dispatch({ handle: a.handle });
  }
  return s;
}
const resumed = scenario(dirs[0], ['Buy', 'Menu']);
writeFileSync(join(out, 'cli-buy-menu.scenario.json'), JSON.stringify(await resumed.exportScenario(), null, 2) + '\n');
writeFileSync(join(out, 'cli-detail.scenario.json'), JSON.stringify(await scenario(dirs[0], ['Next']).exportScenario(), null, 2) + '\n');
checks.cliBuyMenuState = resumed.query({ select: ['state'] }).data.state.componentValues.filter((c) => c.singleton)
  .map((c) => `${c.module}::${c.component} ##${c.variant}`);
checks.modelId = loadModel(join(dirs[1], 'main.shitae')).metadata.modelId;
// A changed copy for the mismatch case (the browser keeps the existing Session).
const changed = join(out, 'changed');
mkdirSync(changed, { recursive: true }); cpSync(join(here, 'model'), changed, { recursive: true });
writeFileSync(join(changed, 'shop/cart.shitae'), readFileSync(join(changed, 'shop/cart.shitae'), 'utf8') + '## Closed\nc\n');
writeFileSync(join(out, 'cli-changed.scenario.json'), JSON.stringify(await scenario(changed, ['Buy']).exportScenario(), null, 2) + '\n');
console.log(JSON.stringify(checks, null, 2));
