import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import { Session, replayScenario } from '@shitae/session';
import { toSimulator } from '../src/simulator.js';

const SOURCE = '# Home\ncard: Card\n> Choose -> before ; [ok] show(Card##Ready) ; goto(##Changed)\n> Check(card.signal?) -> checked\n## Start\n## Changed\n# Card\n## Idle\nx\n## Ready\nsignal\n';
function gui(source = SOURCE, astOnly = false, engine?: string) {
  const parsed = parse(source); expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const documents = new Map([['main', parsed.document]]), files = new Map([['main', '/gui/main.shitae']]);
  const metadata = createMetadata(documents, 'main', files, new Map([['main', new TextEncoder().encode(source)]]), engine);
  const html = toSimulator(documents, 'main', undefined, astOnly ? undefined : { files, metadata });
  const app = { innerHTML: '' }, downloads: Array<{ name: string; blob: Blob }> = [];
  const blobs = new Map<string, Blob>(); let count = 0;
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, TextEncoder, Blob, console, setTimeout: () => 0,
    URL: { createObjectURL: (b: Blob) => { const key = 'blob:' + (++count); blobs.set(key, b); return key; }, revokeObjectURL: (key: string) => blobs.delete(key) },
    document: { getElementById: () => app, createElement: () => ({ href: '', download: '',
      click() { downloads.push({ name: this.download, blob: blobs.get(this.href)! }); }, remove() {} }),
    },
  });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (code: string) => vm.runInContext(code, ctx);
  return { html, app, downloads, run, prepared: { documents, files, metadata, entryModule: 'main' },
    query: () => JSON.parse(run('JSON.stringify(SESSION.query({select:["state","actions","history"]}))')),
    load: (text: string) => { ctx.scenarioText = text; return run('loadScenarioText(scenarioText)'); } };
}
describe('scenario GUI import/export', () => {
  it('identifies same-entry artifacts by model and engine without claiming shortened IDs guarantee equality', async () => {
    const pages = [gui(), gui(SOURCE + ' \n'), gui(SOURCE, false, 'f'.repeat(64))];
    const names = [];
    for (const g of pages) {
      const m = g.prepared.metadata;
      expect(g.app.innerHTML).toContain('model ' + m.modelId.slice(0, 12));
      expect(g.app.innerHTML).toContain('engine ' + m.engineVersion.slice(0, 12));
      expect(g.app.innerHTML).toContain('短縮IDは対応付けの補助');
      expect(g.app.innerHTML).toContain('遷移マップの分割設定も渡すならsimconfig');
      expect(g.app.innerHTML).toContain(m.modelId);
      expect(g.app.innerHTML).toContain(m.engineVersion);
      await g.run('saveScenario()');
      expect(g.downloads[0]!.name).toBe(`main.${m.modelId.slice(0, 12)}.${m.engineVersion.slice(0, 12)}.scenario.json`);
      names.push(g.downloads[0]!.name);
    }
    expect(new Set(names).size).toBe(3);
    const a = pages[0]!, before = a.query(), saved = await a.run('buildScenarioJson()');
    await a.load(await pages[2]!.run('buildScenarioJson()'));
    expect(a.app.innerHTML).toContain('モデルは未照合');
    expect(a.app.innerHTML).toContain('完全な期待/実際の識別情報');
    expect(a.query()).toEqual(before);
    expect(await a.run('buildScenarioJson()')).toBe(saved);
    const collision = JSON.parse(saved);
    collision.model.modelId = collision.model.modelId.slice(0, 12) + '0'.repeat(52);
    await a.load(JSON.stringify(collision));
    expect(a.app.innerHTML).toContain('MODEL_MISMATCH');
    expect(a.query()).toEqual(before);
    expect(a.app.innerHTML.indexOf('次の行動')).toBeLessThan(a.app.innerHTML.indexOf('完全な期待/実際の識別情報'));
    a.run("handleInteraction('component',0,0)");
    expect(a.query().summary.location.variant).toBe('Changed');
  });

  it('explains the complete journal before save and after load while preserving display settings', async () => {
    const g = gui();
    g.run("handleInteraction('component',0,0)");
    g.run('jumpToTimeline(1)');
    g.run("setInstanceVariant('main','Card','Ready')");
    g.run('resetSession()');
    g.run("handleInteraction('component',0,0)");
    g.run('jumpToTimeline(1)');
    const text = await g.run('buildScenarioJson()');
    expect(JSON.parse(text).steps.map((s: any) => s.command.kind)).toEqual(['dispatch', 'seek', 'setTestVariant', 'reset', 'dispatch', 'seek']);
    const counts = 'dispatch 2件 / seek 2件 / reset 1件 / 手動試験 1件';
    expect(g.app.innerHTML).toContain(counts);
    expect(g.app.innerHTML).toContain('条件選択はdispatchの内訳として操作来歴');
    expect(g.app.innerHTML).toContain('破棄経路・reset前');
    expect(g.app.innerHTML).toContain('モデル本文・DOM・表示設定は含みません');
    expect(g.app.innerHTML).toContain('後の履歴 2地点');
    expect(g.app.innerHTML).toContain('文章のみ 5地点');
    const restored = gui(); restored.run('toggleShowEvents(); toggleShowActions(); toggleShowStates()');
    await restored.load(text);
    expect(restored.run('[showEvents,showActions,showStates]')).toEqual([false, false, true]);
    expect(restored.app.innerHTML).toContain('操作の再生ファイルを読み込みました（' + counts + 'を照合）');
    expect(restored.app.innerHTML).not.toContain('6操作');
    expect(await restored.run('buildScenarioJson()')).toBe(text);
  });

  it('hides noncurrent event destinations when events are hidden, while keeping the operation and the current point readable', () => {
    const g = gui();
    g.run("setInstanceVariant('main','Card','Ready')");
    g.run("handleInteraction('component',0,0)");
    const before = g.query();
    expect(g.app.innerHTML).toContain('data-focus-key="last:1"');
    g.run('toggleShowEvents()');
    expect(g.app.innerHTML).not.toContain('data-focus-key="last:1"');
    expect(g.app.innerHTML).toContain('手動試験 main::Card##Ready');
    expect(g.query()).toEqual(before);
    g.run("setInstanceVariant('main','Card','Idle')");
    expect(g.app.innerHTML).toContain('data-focus-key="last:3"');
  });

  it('groups journal operations, exposes only retained points as destinations and exports readable review without mutation', async () => {
    const g = gui(); g.run("handleInteraction('component',0,0)");
    expect(g.app.innerHTML).toContain('操作来歴');
    expect(g.app.innerHTML).toContain('選んだ条件：ok');
    g.run('toggleProvenanceStep(1)');
    expect(g.app.innerHTML).toContain('結果1 / 状態1');
    g.run('jumpToTimeline(1)');
    expect(g.app.innerHTML).toContain('後の履歴 2地点');
    g.run("setInstanceVariant('main','Card','Ready')");
    expect(g.app.innerHTML).toContain('文章のみ 2地点');
    expect(g.app.innerHTML).not.toMatch(/seekProvenancePoint\(4[,)]/);
    const before = await g.run('buildScenarioJson()');
    g.run('toggleReview()'); expect(g.app.innerHTML).toContain('版をまたぐ自動再生');
    g.run('saveReview()');
    expect(g.downloads.at(-1)!.name).toBe('main.review.txt');
    const text = await g.downloads.at(-1)!.blob.text();
    expect(text).toContain('Choose'); expect(text).toContain('巻戻し/やり直し先'); expect(text).toContain('破棄 2観測点');
    expect(await g.run('buildScenarioJson()')).toBe(before);
    const restored = gui(); await restored.load(before);
    expect(restored.app.innerHTML).toContain('選んだ条件：ok');
    expect(restored.app.innerHTML).toContain('文章のみ 2地点');
  });

  it('downloads one sidecar, imports into another generated page, preserves mid-result ghost and rejects old clicks', async () => {
    const a = gui();
    a.run("handleInteraction('component',0,0)");
    a.run("setInstanceVariant('main','Card','Ready')");
    a.run('jumpToTimeline(2)');
    const sourceBefore = a.query();
    const text = await a.run('buildScenarioJson()');
    expect(a.query()).toEqual(sourceBefore);
    await a.run('saveScenario()');
    expect(a.downloads).toHaveLength(1); expect(a.downloads[0]!.name).toBe(`main.${a.prepared.metadata.modelId.slice(0, 12)}.${a.prepared.metadata.engineVersion.slice(0, 12)}.scenario.json`);
    expect(await a.downloads[0]!.blob.text()).toBe(text);
    const b = gui(); const oldClick = b.app.innerHTML.match(/onclick="(handleInteraction[^\"]+)"/)![1]!;
    await b.load(text);
    expect(b.app.innerHTML).toContain('操作の再生ファイルを読み込みました');
    expect(b.query().summary.location).toEqual(sourceBefore.summary.location);
    expect(b.query().data.history.items.map((i: any) => i.ghost)).toEqual(sourceBefore.data.history.items.map((i: any) => i.ghost));
    expect(await b.run('buildScenarioJson()')).toBe(text);
    b.run(oldClick); expect(b.app.innerHTML).toContain('UNKNOWN_HANDLE');
    const replayed = await replayScenario(a.prepared, JSON.parse(text));
    expect(await replayed.exportScenario()).toEqual(JSON.parse(text));
    expect(b.app.innerHTML).toContain('操作の再生ファイルを保存'); expect(b.app.innerHTML).toContain('操作の再生ファイルを読み込む');
  });

  it('keeps the live Session and its handles on invalid/foreign imports, and accepts CLI/library output', async () => {
    const g = gui(); const before = g.query();
    await g.load('{broken'); expect(g.app.innerHTML).toContain('SCENARIO_FORMAT'); expect(g.query()).toEqual(before);
    const foreign = gui(SOURCE + '// changed\n');
    await g.load(await foreign.run('buildScenarioJson()'));
    expect(g.app.innerHTML).toContain('MODEL_MISMATCH'); expect(g.query()).toEqual(before);
    const s = new Session(g.prepared.documents, 'main', g.prepared.files, g.prepared.metadata);
    s.setTestVariant({ module: 'main', component: 'Card', variant: 'Ready' });
    const sidecar = await s.exportScenario();
    await g.load(JSON.stringify(sidecar));
    expect(JSON.parse(await g.run('buildScenarioJson()'))).toEqual(sidecar);
    expect(g.query().data.state.testVariants[0]).toMatchObject({ component: 'Card', variant: 'Ready' });
  });

  it('reports AST-only export as unsupported without fabricating source-byte identity', async () => {
    const g = gui(SOURCE, true); const before = g.query();
    await g.run('saveScenario()');
    expect(g.app.innerHTML).toContain('SCENARIO_UNSUPPORTED'); expect(g.query()).toEqual(before);
    expect(g.downloads).toEqual([]);
  });

  it('locks from the start of file reading through replay, rejects older/newer overlap and unlocks on read failure', async () => {
    const g = gui(), changed = gui(); changed.run("handleInteraction('component',0,0)");
    const text = await changed.run('buildScenarioJson()'), before = g.query();
    g.run('var releaseFile; var slowRead = new Promise(resolve => { releaseFile = resolve; }); var firstLoad = loadScenarioFile({files:[{text:()=>slowRead}], value:"first"});');
    expect(g.run('scenarioBusy')).toBe(true);
    await g.load(await g.run('buildScenarioJson()'));
    g.run("handleInteraction('component',0,0)"); expect(g.query()).toEqual(before);
    g.run('releaseFile(' + JSON.stringify(text) + ')'); await g.run('firstLoad');
    expect(g.query().summary.location.variant).toBe('Changed'); expect(g.run('scenarioBusy')).toBe(false);
    const after = g.query();
    await g.run('loadScenarioFile({files:[{text:async()=>{throw new Error("read failed")}}],value:"bad"})');
    expect(g.run('scenarioBusy')).toBe(false); expect(g.query()).toEqual(after);
    expect(g.app.innerHTML).toContain('read failed');
  });
});
