import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { replayScenario } from '@shitae/session';
import { createMetadata } from '@shitae/session/model';
import { toSimulator } from '../src/simulator.js';

// Multi-module variant of the scenario-ui harness. Module IDs equal the import names because every file lives in one directory.
function gui(sources: Record<string, string>, entry = 'main') {
  const documents = new Map<string, any>(), files = new Map<string, string>(), bytes = new Map<string, Uint8Array>();
  for (const [module, source] of Object.entries(sources)) {
    const parsed = parse(source); expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    documents.set(module, parsed.document); files.set(module, `/gui/${module}.shitae`); bytes.set(module, new TextEncoder().encode(source));
  }
  const metadata = createMetadata(documents, entry, files, bytes);
  const html = toSimulator(documents, entry, undefined, { files, metadata });
  const app = { innerHTML: '' };
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, TextEncoder, Blob, console, setTimeout: () => 0,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    document: { getElementById: () => app, createElement: () => ({ href: '', download: '', click() {}, remove() {} }) } });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (code: string) => vm.runInContext(code, ctx);
  return { app, run, prepared: { documents, entryModule: entry, files, metadata },
    query: () => JSON.parse(run('JSON.stringify(SESSION.query({select:["state","actions","history"]}))')),
    load: (text: string) => { ctx.scenarioText = text; return run('loadScenarioText(scenarioText)'); } };
}
const one = (source: string) => ({ main: source });
// The summary is its own status element(s) next to the notice; the notice text itself is #24's and is not asserted here.
const summaryHtml = (html: string) => html.match(/<p role="status">読み込んだ時点の状態（一部）[\s\S]*?<\/p>(?:<details data-state-key="load-singletons">[\s\S]*?<\/details>)?/)?.[0] ?? '';
const NOTICE = '操作の再生ファイルを読み込みました';

const NONE = '# Home\nplain: Plain\n> Open -> push(Detail)\n# Plain\nx\n# Detail\ny\n#! Cart\n## Empty\ne\n';
const SEVERAL = '# Home\nbar: Bar\nlist: List\nside: { mode: Mode }\n> Add -> set(Cart##Full) ; set(Bar##Away)\n' +
  '# List\ncart: Cart\nagain: Bar\nplain: Plain\n# Plain\nx\n#! Bar\n## On\na\n## Away\nb\n#! Cart\n## Empty\ne\n## Full\nf\n' +
  '#! Mode\n## Light\nl\n## Dark\nd\n#! Unseen\n## One\no\n';
const MODULES = {
  main: 'import shop as shop\n# Home\ncart: Cart\nshopCart: shop::Cart\ncoupon: shop::Coupon\n> Buy -> set(shop::Cart##Full)\n#! Cart\n## Empty\ne\n## Full\nf\n',
  shop: '#! Cart\n## Open\no\n## Full\nf\n#! Coupon\n## Valid\nv\n',
};
const OVERLAY = '# Home\ncart: Cart\n> Open -> set(Banner##Loud) ; show(Menu) ; show(Banner) ; show(Toast)\n' +
  '# Menu\nmode: Mode\n# Toast\nt\n#! Banner\n## Quiet\nq\n## Loud\nl\n#! Cart\n## Empty\ne\n#! Mode\n## Light\nl\n';
// The operable state of Home depends on Auth through a member gate, although no inclusion shows Auth.
const AUTH = '# Home\n> Login -> set(Auth##In)\n> タップ(Auth.badge?) -> push(Detail)\n#! Auth\n## Out\no\n## In\nbadge\n# Detail\nd\n';
const GATE_OVERLAY = '# Home\n> Open -> show(Menu)\n# Menu\n> Check(Auth.badge?) -> hide(Menu)\n#! Auth\n## Out\no\n## In\nbadge\n';
const GATE_AND_INCLUSION = '# Home\nauth: Auth\n> Check(Auth.badge?) -> push(Detail)\n> Peek(Lamp.glow?) -> push(Detail)\n' +
  '#! Auth\n## In\nbadge\n#! Lamp\n## On\nglow\n# Detail\nd\n';
const GATE_MODULES = {
  main: 'import shop as shop\n# Home\n> Check(Cart.line?) -> push(Detail)\n> Peek(shop::Cart.line?) -> push(Detail)\n#! Cart\n## Empty\nline\n# Detail\nd\n',
  shop: '#! Cart\n## Open\nline\n',
};
const MANY = '# Home\na: Alpha\nb: Beta\nc: Gamma\nd: Delta\ne: Epsilon\n> Open -> show(Menu)\n# Menu\nmode: Mode\nlamp: Lamp\n' +
  ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Mode', 'Lamp'].map(n => `#! ${n}\n## On\no\n`).join('');

// Produce a scenario by operating a page of the same model, then load it into a fresh page.
async function resumed(sources: Record<string, string>, operate: string[] = []) {
  const a = gui(sources); for (const op of operate) a.run(op);
  const text = await a.run('buildScenarioJson()');
  const b = gui(sources); await b.load(text);
  return { a, b, text };
}
const withoutHandles = (v: any): any => Array.isArray(v) ? v.map(withoutHandles)
  : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'handle').map(([k, x]) => [k, withoutHandles(x)])) : v;
const stateValues = (g: ReturnType<typeof gui>) => g.query().data.state.componentValues;
const valueOf = (g: ReturnType<typeof gui>, module: string, component: string) => stateValues(g).find((c: any) => c.module === module && c.component === component);

describe('singleton summary at the scenario load point', () => {
  it('says explicitly when no singleton is displayed, without listing undisplayed singletons', async () => {
    const { b } = await resumed(one(NONE), ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態はありません。画面外の部品の共有状態がないという意味ではありません。</p>');
    expect(b.app.innerHTML).not.toContain('Cart');
  });

  it('shows each displayed singleton once with the variant of the replayed Session', async () => {
    const { a, b } = await resumed(one(SEVERAL), ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Bar ##Away, Cart ##Full, Mode ##Light</p>');
    expect(b.app.innerHTML).not.toContain('Unseen');
    for (const [component, variant] of [['Bar', 'Away'], ['Cart', 'Full'], ['Mode', 'Light']] as const) {
      expect(valueOf(b, 'main', component)).toMatchObject({ variant, singleton: true });
      expect(valueOf(a, 'main', component).variant).toBe(variant);
    }
    // The notice (#24) is kept and not duplicated into the summary.
    expect(b.app.innerHTML).toContain(NOTICE);
    expect(summaryHtml(b.app.innerHTML)).not.toContain('dispatch');
  });

  it('follows the Session when a loaded scenario seeks back before the change', async () => {
    const { b } = await resumed(one(SEVERAL), ["handleInteraction('component',0,0)", 'jumpToTimeline(0)']);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Bar ##On, Cart ##Empty, Mode ##Light</p>');
    expect(valueOf(b, 'main', 'Cart')!.variant).toBe('Empty');
  });

  it('qualifies a singleton name that exists in more than one module and only that name', async () => {
    const { b } = await resumed(MODULES, ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: main::Cart ##Empty, shop::Cart ##Full, Coupon ##Valid</p>');
    expect(valueOf(b, 'main', 'Cart')!.variant).toBe('Empty');
    expect(valueOf(b, 'shop', 'Cart')!.variant).toBe('Full');
  });

  it('groups the main frame and each open overlay, counting a singleton overlay root itself and omitting groups without singletons', async () => {
    const { b } = await resumed(one(OVERLAY), ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Cart ##Empty / overlay Menu: Mode ##Light / overlay Banner: Banner ##Loud</p>');
    expect(b.app.innerHTML).not.toContain('overlay Toast');
    expect(b.query().data.state.overlays.map((o: any) => o.component)).toEqual(['Menu', 'Banner', 'Toast']);
  });

  it('lists a singleton that only a member gate of a placed operation depends on, at the load point and after it changes', async () => {
    const initial = await resumed(one(AUTH));
    expect(summaryHtml(initial.b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Auth ##Out</p>');
    const { a, b } = await resumed(one(AUTH), ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Auth ##In</p>');
    expect(valueOf(b, 'main', 'Auth')).toMatchObject({ variant: 'In', singleton: true });
    expect(valueOf(a, 'main', 'Auth')!.variant).toBe('In');
  });

  it('groups a gate target under the root that places the operation, once per component, after the inclusion singletons', async () => {
    const overlay = await resumed(one(GATE_OVERLAY), ["handleInteraction('component',0,0)"]);
    expect(overlay.b.query().data.state.overlays.map((o: any) => o.component)).toEqual(['Menu']);
    expect(summaryHtml(overlay.b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: overlay Menu: Auth ##Out</p>');
    const mixed = await resumed(one(GATE_AND_INCLUSION));
    expect(summaryHtml(mixed.b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Auth ##In, Lamp ##On</p>');
  });

  it('qualifies gate targets of the same name in different modules', async () => {
    const { b } = await resumed(GATE_MODULES);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: main::Cart ##Empty, shop::Cart ##Open</p>');
  });

  it('qualifies an overlay group label with the same rule as entries', async () => {
    const SHOW_SHOP = { main: 'import shop as shop\n# Home\n> Open -> show(shop::Menu)\n#! Menu\n## A\na\n', shop: '#! Menu\n## B\nb\n' };
    const { b } = await resumed(SHOW_SHOP, ["handleInteraction('component',0,0)"]);
    expect(b.query().data.state.overlays.map((o: any) => [o.module, o.component])).toEqual([['shop', 'Menu']]);
    expect(summaryHtml(b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: overlay shop::Menu: shop::Menu ##B</p>');
    const single = await resumed(one(OVERLAY), ["handleInteraction('component',0,0)"]);
    expect(summaryHtml(single.b.app.innerHTML)).toContain('overlay Menu: Mode ##Light');
  });

  it('shows a count line and a keyed details list only above five entries', async () => {
    const five = await resumed(one(MANY));
    expect(summaryHtml(five.b.app.innerHTML)).toBe('<p role="status">読み込んだ時点の状態（一部）: 画面・操作条件に関係する部品の共有状態: 本体: Alpha ##On, Beta ##On, Gamma ##On, Delta ##On, Epsilon ##On</p>');
    expect(five.b.app.innerHTML).not.toContain('load-singletons');
    const { b } = await resumed(one(MANY), ["handleInteraction('component',0,0)"]);
    const html = summaryHtml(b.app.innerHTML);
    expect(html.startsWith('<p role="status">読み込んだ時点の状態（一部）: 関係する部品の共有状態（表示箇所別 7件）</p><details data-state-key="load-singletons">')).toBe(true);
    for (const line of ['本体: Alpha ##On', '本体: Epsilon ##On', 'overlay Menu: Mode ##On', 'overlay Menu: Lamp ##On']) expect(html).toContain('<li>' + line + '</li>');
    expect(html.match(/<li>/g)).toHaveLength(7);
    expect(html).not.toContain('Alpha ##On, Beta');
  });

  it('shows nothing for a mismatched load, keeps the previous Session, and drops the summary on the next operation or failed load', async () => {
    const g = gui(one(SEVERAL)); const before = g.query();
    const foreign = gui(one(SEVERAL + '// changed\n'));
    await g.load(await foreign.run('buildScenarioJson()'));
    expect(g.app.innerHTML).toContain('MODEL_MISMATCH'); expect(g.query()).toEqual(before);
    expect(g.app.innerHTML).not.toContain('読み込んだ時点の状態（一部）');
    const { text } = await resumed(one(SEVERAL), ["handleInteraction('component',0,0)"]);
    await g.load(text);
    expect(summaryHtml(g.app.innerHTML)).toContain('Cart ##Full');
    await g.load(await foreign.run('buildScenarioJson()'));
    expect(g.app.innerHTML).toContain('MODEL_MISMATCH'); expect(g.app.innerHTML).not.toContain('読み込んだ時点の状態（一部）');
    await g.load(text);
    expect(summaryHtml(g.app.innerHTML)).toContain('Cart ##Full');
    g.run('resetSession()');
    expect(g.app.innerHTML).not.toContain('読み込んだ時点の状態（一部）'); expect(g.app.innerHTML).not.toContain(NOTICE);
    await g.load(text);
    g.run('toggleShowStates()');
    expect(summaryHtml(g.app.innerHTML)).toContain('Cart ##Full');
  });

  it('keeps the previous Session and shows no summary or notice when computing the summary fails', async () => {
    const { text } = await resumed(one(SEVERAL), ["handleInteraction('component',0,0)"]);
    const g = gui(one(SEVERAL)); const before = g.query();
    g.run("summarizeLoadSingletons = () => { throw new Error('summary boom'); }");
    await g.load(text);
    expect(g.app.innerHTML).toContain('summary boom');
    expect(g.query()).toEqual(before);
    expect(g.app.innerHTML).not.toContain('読み込んだ時点の状態（一部）'); expect(g.app.innerHTML).not.toContain(NOTICE);
  });

  it('does not change display settings, the exported scenario or Session state', async () => {
    const { text } = await resumed(one(SEVERAL), ["handleInteraction('component',0,0)"]);
    const b = gui(one(SEVERAL)); b.run('toggleShowEvents(); toggleShowActions(); toggleShowStates()');
    expect(b.run('[showEvents,showActions,showStates]')).toEqual([false, false, true]);
    await b.load(text);
    expect(summaryHtml(b.app.innerHTML)).toContain('Cart ##Full');
    expect(b.run('[showEvents,showActions,showStates]')).toEqual([false, false, true]);
    expect(await b.run('buildScenarioJson()')).toBe(text);
    // Computing the summary must not move the replayed Session: an independent replay of the same text, outside the GUI, is identical.
    // Operation handles embed a per-Session id, so they are stripped before comparing.
    // The replay uses the page's module-relative file names, because the exported HTML never carries absolute paths.
    const { documents, entryModule, metadata } = b.prepared;
    const files = new Map(b.run('[...MODEL.files]') as Array<[string, string]>);
    const outside = await replayScenario({ documents: new Map(documents), entryModule, files, metadata }, JSON.parse(text));
    const select = ['state', 'actions', 'history'];
    expect(withoutHandles(b.query())).toEqual(withoutHandles(outside.query({ select })));
    expect(b.query().revision).toBe(outside.query().revision);
    expect(b.query().summary).toEqual(outside.query().summary);
    expect(await b.run('buildScenarioJson()')).toBe(text);
    const fresh = gui(one(SEVERAL)); await fresh.load(text);
    expect(fresh.run('[showEvents,showActions,showStates]')).toEqual([true, true, false]);
    expect(fresh.app.innerHTML).not.toContain('component-state-value');
  });
});
