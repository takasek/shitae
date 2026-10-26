import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import { toSimulator } from '../src/simulator.js';

function gui(source: string, extras: Record<string, string> = {}) {
  const parsed = parse(source);
  expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const documents = new Map([['main', parsed.document]]);
  for (const [module, text] of Object.entries(extras)) {
    const extra = parse(text); expect(extra.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    documents.set(module, extra.document);
  }
  const sources = new Map([['main', source], ...Object.entries(extras)]);
  const files = new Map([...sources.keys()].map(module => [module, '/test/' + module + '.shitae']));
  const metadata = createMetadata(documents, 'main', files, new Map([...sources].map(([module, text]) => [module, new TextEncoder().encode(text)])));
  const app = { innerHTML: '' };
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, TextEncoder, console, setTimeout: () => 0, document: { getElementById: () => app } });
  const html = toSimulator(documents, 'main', undefined, { files, metadata });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (s: string) => vm.runInContext(s, ctx);
  return { app, run };
}

describe('operation definition and actual result targets', () => {
  it('shows ordered definition results with inherited conditions without changing the session', async () => {
    const g = gui('import shared as s\n# Home\n> Try -> prepare <item> ; [OK] set(s::Value##New) ; show(Note) ; [NG] dismiss() ; [OK] push(Done, @work)\n# Done\n# Note\n', { shared: '#! Value\n## Old\n## New\n' });
    const before = g.run('JSON.stringify(SESSION.query({select:["state","history","provenance"]}))');
    const saved = await g.run('buildScenarioJson()');
    const details = g.run('operationDetails(view.data.actions.items[0])');
    expect(details).toContain('定義された結果（実行前）');
    expect(details).toContain('自由文: prepare &lt;item&gt;');
    const rows = [...details.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
    expect(rows).toEqual([
      '条件なし: 自由文: prepare &lt;item&gt;',
      '[OK]: set(s::Value##New)',
      '[OK]: show(Note)',
      '[NG]: dismiss()',
      '[OK]: push(Done, @work)',
    ]);
    expect(details).toContain('自由文は実際の処理を実行しません');
    g.run('render(); render()');
    expect(g.run('JSON.stringify(SESSION.query({select:["state","history","provenance"]}))')).toBe(before);
    expect(await g.run('buildScenarioJson()')).toBe(saved);
  });

  it('shows the effective override results, quoted names and unnamed session syntax', () => {
    const g = gui('# Parent\ncard: Child\n> Tap(card.button) -> present("Detail page", @) ; goto(##"New state") ; exit(@) ; back() ; hide("Note box")\n# Child\nbutton\n> Tap(button) -> default effect\n# "Detail page"\n## "New state"\n# "Note box"\n');
    const details = g.run('operationDetails(view.data.actions.items[0])');
    expect(details).toContain('present(&quot;Detail page&quot;, @)');
    expect(details).toContain('goto(##&quot;New state&quot;)');
    expect(details).toContain('exit(@)');
    expect(details).toContain('back()');
    expect(details).toContain('hide(&quot;Note box&quot;)');
    expect(details).not.toContain('default effect');
  });

  it('preserves a literal collection marker inside quoted target names', () => {
    const g = gui('# Home\n> Try -> push("*Details") ; show("*Note") ; set("*State"##New)\n# "*Details"\n# "*Note"\n#! "*State"\n## New\n');
    const details = g.run('operationDetails(view.data.actions.items[0])');
    expect(details).toContain('push(&quot;*Details&quot;)');
    expect(details).toContain('show(&quot;*Note&quot;)');
    expect(details).toContain('set(&quot;*State&quot;##New)');
  });

  it('distinguishes a child definition from the active parent with the same variants', () => {
    const g = gui('# Parent\nChild\n## Old\n## New\n# Child\n> Change -> goto(##New)\n## Old\n## New\n');
    expect(g.app.innerHTML).toContain('定義元: main::Child');
    expect(g.app.innerHTML).toContain('部品の既定操作');
    expect(g.app.innerHTML).toContain('配置: main / Child');
    g.run("handleNestedInteraction(-1,[0],'component',0,0); toggleProvenanceStep(1)");
    expect(g.app.innerHTML).toContain('実行後の作用先: main::Parent / New');
    expect(g.app.innerHTML).toContain('共有範囲: この画面の状態');
    expect(g.run('view.data.state.inclusion.main.children[0].value.variant')).toBe('Old');
  });

  it('identifies a screen override separately from a component default', () => {
    const g = gui('# Parent\ncard: Child\n> Tap(card.button) -> effect\n# Child\nbutton\n> Tap(button) -> default\n');
    expect(g.app.innerHTML).toContain('定義元: main::Parent');
    expect(g.app.innerHTML).toContain('局所上書き: main::Child の既定操作');
    expect(g.app.innerHTML).not.toContain('定義元: main::Child');
  });

  it('reports the resolved override inside inline groups in both current and recorded details', async () => {
    const g = gui('# Parent\nbox: { Child }\n> Tap(Child.button) -> push(Done)\n# Child\nbutton\n> Tap(button) -> default\n# Done\n> Finish -> effect\n');
    expect(g.run('view.data.actions.items.map(op => op.actionText)')).toEqual(['Tap(Child.button)']);
    expect(g.run('view.data.actions.items[0].overrides')).toMatchObject([
      { host: { module: 'main', component: 'Child' }, placement: { root: 'main', path: [0, 0] }, source: { module: 'main', span: { line: 6 } } },
    ]);
    expect(g.app.innerHTML).toContain('局所上書き: main::Child の既定操作');
    expect(g.run('operationDetails({...view.data.actions.items[0], overrides: undefined})')).not.toContain('局所上書き:');
    g.run("handleInteraction('component',0,0)");
    expect(g.app.innerHTML).not.toContain('局所上書き:');
    expect(g.run('view.data.actions.items[0].overrides')).toEqual([]);
    g.run('toggleProvenanceStep(1)');
    expect(g.app.innerHTML).toContain('局所上書き: main::Child の既定操作');
    expect(g.app.innerHTML).toContain('定義元: main::Parent');
    expect(await g.run('buildScenarioJson()')).not.toContain('"overrides"');
  });

  it('matches override action whitespace and collection identity like Session', () => {
    const collection = gui('# Parent\ncard: Child\n> Tap(*card.button) -> effect\n# Child\nbutton\n> Tap(button) -> default\n');
    expect(collection.app.innerHTML).not.toContain('局所上書き:');
    expect(collection.app.innerHTML).toContain('定義元: main::Child');
    const spaces = gui('# Parent\ncard: Child\n> Double Tap(card.button) -> effect\n# Child\nbutton\n> Double  Tap(button) -> default\n');
    expect(spaces.app.innerHTML).toContain('局所上書き: main::Child の既定操作');
    expect(spaces.app.innerHTML).not.toContain('定義元: main::Child');
  });

  it('distinguishes qualified modules and gives a local alias precedence', () => {
    const g = gui('import shared as s\n# Parent\nChild\ns::Child\n> Tap(s::Child.button) -> effect\n# Child\nbutton\n> Tap(button) -> local\n', { shared: '# Child\nbutton\n> Tap(button) -> shared\n' });
    expect(g.app.innerHTML).toContain('局所上書き: shared::Child の既定操作');
    expect(g.app.innerHTML).not.toContain('局所上書き: main::Child');
    const alias = gui('import shared as s\n# Parent\nChild\nChild: s::Other\n> Tap(Child.button) -> effect\n# Child\nbutton\n> Tap(button) -> local\n', { shared: '# Other\nbutton\n> Tap(button) -> shared\n' });
    expect(alias.app.innerHTML).toContain('局所上書き: shared::Other の既定操作');
    expect(alias.app.innerHTML).not.toContain('局所上書き: main::Child');
  });

  it('uses the receiver after dismiss, and reports singleton writes independently of the screen', () => {
    const g = gui('# Parent\n> Open -> present(Dialog)\n## Old\n## New\n# Dialog\nChild\n## Old\n## New\n# Child\n> Done -> dismiss() ; goto(##New) ; set(Shared##New)\n## Old\n## New\n#! Shared\n## Old\n## New\n');
    g.run("handleInteraction('component',0,0); handleNestedInteraction(-1,[0],'component',0,0); toggleProvenanceStep(2)");
    expect(g.app.innerHTML).toContain('実行後の作用先: main::Parent / New');
    expect(g.app.innerHTML).toContain('変更先: main::Shared / New');
    expect(g.app.innerHTML).toContain('共有範囲: 同じ実行内の同じ定義の全使用箇所（singleton）');
    expect(g.app.innerHTML).toContain('定義元: main::Child');
    expect(g.app.innerHTML).toContain('配置: main / Child');
  });

  it('keeps Session state, cursor, history and saved scenario unchanged when rendering details', async () => {
    const g = gui('# Parent\nChild\n# Child\n> Tap -> effect\n');
    const snapshot = () => g.run('JSON.stringify(SESSION.query({select:["state","actions","history","provenance"]}))');
    const before = snapshot(), saved = await g.run('buildScenarioJson()');
    g.run('render(); render()');
    expect(g.app.innerHTML).toContain('<summary>操作の詳細</summary>');
    expect(snapshot()).toBe(before);
    expect(await g.run('buildScenarioJson()')).toBe(saved);
  });

  it('resolves imported singleton targets and does not call rejected transitions changes', () => {
    const g = gui('import shared as s\n# Home\n> Change -> set(s::Value##New)\n> Bad -> dismiss(@missing)\n', { shared: '#! Value\n## Old\n## New\n' });
    g.run("handleInteraction('component',0,0); toggleProvenanceStep(1)");
    expect(g.app.innerHTML).toContain('変更先: shared::Value / New');
    g.run("handleInteraction('component',1,0); toggleProvenanceStep(2)");
    expect(g.run('resultTargetHtml(SESSION.query({select:["provenanceStep"],step:2}).data.provenanceStep.results[0])')).toContain('警告');
    expect(g.run('resultTargetHtml(SESSION.query({select:["provenanceStep"],step:2}).data.provenanceStep.results[0])')).not.toContain('変更先:');
  });

  it('does not describe a remote session removal as changing the active screen', () => {
    const g = gui('# Home\n> A -> switch(A, @a)\n# A\n> B -> switch(B, @b)\n# B\n> Close -> exit(@a)\n');
    g.run("handleInteraction('component',0,0); handleInteraction('component',0,0); handleInteraction('component',0,0); toggleProvenanceStep(3)");
    const target = g.run('resultTargetHtml(SESSION.query({select:["provenanceStep"],step:3}).data.provenanceStep.results[0])');
    expect(target).toContain('実行後の画面: main::B');
    expect(target).not.toContain('作用先: main::B');
  });

  it('shows a successful transition target alongside its warning even with events hidden', () => {
    const g = gui('# Home\n> Open -> push(A, @s)\n# A\n> Again -> push(B, @s)\n# B\n');
    g.run("handleInteraction('component',0,0); handleInteraction('component',0,0); toggleProvenanceStep(2); toggleShowEvents()");
    const target = g.run('resultTargetHtml(SESSION.query({select:["provenanceStep"],step:2}).data.provenanceStep.results[0])');
    expect(target).toContain('実行後の画面: main::B');
    expect(target).toContain('共有範囲: この画面の状態');
    expect(target).toContain('R005:');
    expect(g.app.innerHTML).toContain('実行後の画面: main::B');
    expect(target).not.toContain('変更先は確定表示しません');
  });

  it.each([
    ['s::Shared##New', true],
    ['s::Shared', false],
    ['Ordinary##New', false],
  ])('shows resumed screen and any explicit singleton write for %s', async (target, sharedWrite) => {
    const g = gui('import shared as s\n# Home\n> Open -> switch(A, @a)\n# A\n> Detail -> push(Detail)\n# Detail\n> Other -> switch(B, @b)\n# B\n> Resume -> switch(' + target + ', @a)\n# Ordinary\n## Old\n## New\n', { shared: '#! Shared\n## Old\n## New\n' });
    g.run("handleInteraction('component',0,0); handleInteraction('component',0,0); handleInteraction('component',0,0); handleInteraction('component',0,0); toggleProvenanceStep(4)");
    const html = g.run('resultTargetHtml(SESSION.query({select:["provenanceStep"],step:4}).data.provenanceStep.results[0])');
    expect(html).toContain('実行後の画面: main::Detail');
    if (sharedWrite) {
      expect(html).toContain('共有状態の書換え先: shared::Shared / New');
      expect(html).toContain('共有範囲: 同じ実行内の同じ定義の全使用箇所（singleton）');
    } else expect(html).not.toContain('共有状態の書換え先:');
    const before = g.run('JSON.stringify(SESSION.query({select:["state","history","provenance"]}))');
    const saved = await g.run('buildScenarioJson()');
    g.run('render(); toggleProvenanceStep(4); toggleProvenanceStep(4)');
    expect(g.run('JSON.stringify(SESSION.query({select:["state","history","provenance"]}))')).toBe(before);
    expect(await g.run('buildScenarioJson()')).toBe(saved);
  });
});
