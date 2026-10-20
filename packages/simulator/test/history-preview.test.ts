import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import { toSimulator } from '../src/simulator.js';

function gui(source = '# Home\ncard: Card\n> Change -> set(Card##New) ; effect\n> Nothing -> back()\n#! Card\n## Old\nold\n## New\nnew\n') {
  const documents = new Map([['main', parse(source).document]]);
  const files = new Map([['main', '/test/main.shitae']]);
  const metadata = createMetadata(documents, 'main', files, new Map([['main', new TextEncoder().encode(source)]]));
  const app = { innerHTML: '' };
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, TextEncoder, console, setTimeout: () => 0, document: { getElementById: () => app } });
  const html = toSimulator(documents, 'main', undefined, { files, metadata });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (s: string) => vm.runInContext(s, ctx);
  return { app, run, ctx, snapshot: () => run('JSON.stringify(SESSION.query({select:["state","actions","history","provenance"]}))') };
}

describe('read-only history preview and explicit resume', () => {
  it('keeps state, handles, revision, journal and export unchanged while previewing and cancelling', async () => {
    const g = gui(); g.run("handleInteraction('component',0,0)");
    const before = g.snapshot(), saved = await g.run('buildScenarioJson()');
    g.run('previewObservation(1)');
    expect(g.app.innerHTML).toContain('見ている履歴の画面');
    expect(g.run('historicalPreview.view.state.sharedVariants[0].variant')).toBe('Old');
    expect(g.run('JSON.stringify(historicalPreview.view.actions)')).not.toContain('handle');
    expect(g.run('historyPreviewHtml()')).not.toMatch(/handleInteraction|setInstanceVariant|goBack\(/);
    g.run('requestResume(1)'); g.run('cancelResume()');
    expect(g.run('historySelection.id')).toBe(1);
    expect(g.snapshot()).toBe(before); expect(await g.run('buildScenarioJson()')).toBe(saved);
    g.run('endHistoryPreview()'); expect(g.run('historySelection')).toBeNull();
    expect(g.snapshot()).toBe(before);
  });
  it('resumes only after confirmation and rejects stale confirmation across load/reset', async () => {
    const g = gui(); g.run("handleInteraction('component',0,0)");
    const saved = await g.run('buildScenarioJson()');
    g.run('previewObservation(1); requestResume(1)');
    const pending = g.run('JSON.stringify(resumeConfirmation)');
    g.run('confirmResume()'); expect(g.run('view.summary.cursorObservationId')).toBe(1);
    expect(g.run('timeline.some(p=>p.ghost)')).toBe(true);
    await g.run('loadScenarioText(' + JSON.stringify(saved) + ')');
    const before = g.snapshot(); g.run('resumeConfirmation=' + pending + '; confirmResume()');
    expect(g.snapshot()).toBe(before); expect(g.app.innerHTML).toContain('対象が変わりました');
    g.run('previewObservation(1); resetSession()'); expect(g.run('historySelection')).toBeNull();
  });
  it('retains preview on rejection/load failure but clears it on accepted no-op and branch', async () => {
    const g = gui(); g.run("handleInteraction('component',0,0)");
    g.run('previewObservation(1); command(()=>SESSION.dispatch({handle:"invalid"}))');
    expect(g.run('historySelection.id')).toBe(1);
    await g.run('loadScenarioText("invalid")'); expect(g.run('historySelection.id')).toBe(1);
    g.run("handleInteraction('component',1,0)"); expect(g.run('historySelection')).toBeNull();
    g.run('previewObservation(2); requestResume(2); confirmResume(); previewObservation(3)');
    g.run("handleInteraction('component',0,0)");
    expect(g.run('historySelection')).toBeNull();
    expect(g.app.innerHTML).toContain('一部の結果は文章のみ');
    expect(g.app.innerHTML).toContain('見ていた履歴の画面は閲覧・再開できなくなりました');
  });
  it('shows partial load scope and a persistent executable state-query guide', async () => {
    const g = gui(); await g.run('buildScenarioJson().then(loadScenarioText)');
    expect(g.app.innerHTML).toContain('読み込んだ時点の状態（一部）');
    expect(g.app.innerHTML).toContain('画面外も含む全て');
    expect(g.app.innerHTML).toContain('data.state.sharedVariants');
    expect(g.run('scenarioControls()')).toContain('</details><details data-state-key="state-query">');
    expect(g.app.innerHTML.match(/data-state-key="state-query"/g)).toHaveLength(1);
    expect(g.app.innerHTML).toContain('data-state-key="load-state-query"');
    g.run("handleInteraction('component',0,0)");
    expect(g.app.innerHTML).toContain('画面外も含めて状態を確認する方法');
    expect(g.app.innerHTML).not.toContain('読み込んだ時点の状態（一部）');
  });
});

describe('history presentation anchors', () => {
  it('keeps a visible row at the same viewport offset and focuses its heading when a point is filtered', () => {
    const g = gui();
    let paneTop = 0;
    const trace: any = { scrollTop: 120, getBoundingClientRect: () => ({ top: paneTop }) };
    const center = { scrollTop: 80 };
    let top = 130, filtered = false, focused = '';
    const heading = { dataset: { historyKey: 'step:1' }, getBoundingClientRect: () => ({ top: paneTop + top - trace.scrollTop }), getAttribute: (k: string) => k === 'data-focus-key' ? 'step:1' : null, focus: () => { focused = 'step:1'; } };
    (heading as any).closest = () => heading;
    const point = { dataset: { historyKey: 'point:2' }, getBoundingClientRect: () => ({ top: paneTop + top - trace.scrollTop }), getAttribute: (k: string) => k === 'data-focus-key' ? 'preview:2' : null, closest: () => heading };
    Object.assign(g.app, { querySelector: (s: string) => s === '.pane-trace' ? trace : center, contains: () => true,
      querySelectorAll: (s: string) => s.includes('data-history-key') ? (filtered ? [heading] : [point, heading]) : s.includes('data-focus-key') ? [heading] : [] });
    (g.ctx as any).document.activeElement = point;
    // The visible point disappears under an event filter; its parent survives.
    g.run("globalThis.savedPresentation = capturePresentation()");
    filtered = true; top += 200; paneTop = 20;
    g.run('restorePresentation(savedPresentation)');
    expect(trace.scrollTop).toBe(340);
    expect(center.scrollTop).toBe(80);
    expect(focused).toBe('step:1');
  });
});


describe('result and snapshot boundaries', () => {
  it('labels the saved point of an operation whose final result has no observation', () => {
    const g = gui('# Home\n> Try -> effect ; back()\n');
    g.run("handleInteraction('component',0,0); toggleProvenanceStep(1)");
    const result = JSON.parse(g.run('JSON.stringify(SESSION.query({select:["provenanceStep"],step:1}).data.provenanceStep)'));
    expect(result.results[1].observations).toEqual([]);
    expect(g.app.innerHTML).toContain('結果2: back() / 再開できる地点なし');
    expect(g.app.innerHTML).toMatch(/この操作の最後に保存された状態を見る: 記録1[^<]*結果1[^<]*状態1/);
    g.run('previewObservation(2)');
    expect(g.app.innerHTML).toContain('結果1 / 状態1');
  });
  it('renders retained overlay and inclusion values without leaking current shared variants', () => {
    const g = gui('# Home\ncard: Card\n> Show -> show(Card)\n> Change -> set(Card##New)\n#! Card\n## Old\nold\n## New\nnew\n');
    g.run("handleInteraction('component',0,0); handleInteraction('component',1,0)");
    const before = g.snapshot();
    g.run('previewObservation(2)');
    expect(g.run('historicalPreview.view.state.inclusion.main.children[0].value.variant')).toBe('Old');
    expect(g.run('historicalPreview.view.state.inclusion.overlays[0].variant')).toBe('Old');
    expect(g.snapshot()).toBe(before);
    g.run('previewObservation(3)');
    expect(g.run('historicalPreview.view.state.inclusion.overlays[0].variant')).toBe('New');
    g.run('resetSession(); toggleProvenanceStep(1)');
    expect(g.app.innerHTML).toContain('文章のみ');
    expect(g.app.innerHTML).toMatch(/onclick="previewObservation\(2\)" disabled/);
    expect(g.run('resumeConfirmation')).toBeNull();
  });
});

describe('focus across history controls', () => {
  it('moves focus to the confirmation and back to an existing control on cancel and end', () => {
    const g = gui();
    const doc: any = g.ctx.document;
    let html = '', controls: any[] = [];
    Object.defineProperty(g.app, 'innerHTML', { get: () => html, set: (value: string) => {
      html = value; doc.activeElement = null;
      controls = [...value.matchAll(/<button\s+([^>]+)>/g)].map(m => {
        const attrs = Object.fromEntries([...m[1]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]]));
        const button = { getAttribute: (key: string) => attrs[key] ?? null, focus: () => { doc.activeElement = button; } };
        return button;
      });
    } });
    Object.assign(g.app, { contains: (el: any) => controls.includes(el), querySelectorAll: (s: string) => s.includes('data-focus-key') ? controls : [] });
    const focus = (key: string) => controls.find(b => b.getAttribute('data-focus-key') === key)!.focus();
    const focused = () => doc.activeElement?.getAttribute('data-focus-key');
    g.run("handleInteraction('component',0,0); previewObservation(1)");
    focus('request-resume'); g.run('requestResume(1)'); expect(focused()).toBe('confirm-resume');
    focus('cancel-resume'); g.run('cancelResume()'); expect(focused()).toBe('request-resume');
    focus('end-preview'); g.run('endHistoryPreview()'); expect(focused()).toBe('preview:1');
    g.run('previewObservation(1); requestResume(1)'); focus('confirm-resume'); g.run('confirmResume()'); expect(focused()).toBe('current-position');
  });
});

describe('long-history rendering', () => {
  it('does not repeatedly scan earlier steps for every completion shortcut', () => {
    const g = gui('# Home\n> Step -> effect\n');
    for (let n = 0; n < 30; n++) g.run("handleInteraction('component',0,0)");
    g.run('globalThis.detailQueries = 0; const originalQuery = SESSION.query.bind(SESSION); SESSION.query = options => { if (options?.select?.includes("provenanceStep")) detailQueries++; return originalQuery(options); }; render();');
    expect(g.run('detailQueries')).toBeLessThanOrEqual(90);
  });
});
