import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import { toSimulator } from '../src/simulator.js';

function gui(source = '# Home\ncard: Card\n> Change -> set(Card##New) ; effect\n> Nothing -> back()\n#! Card\n## Old\nold\n## New\nnew\n') {
  const parsed = parse(source);
  expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const documents = new Map([['main', parsed.document]]);
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


describe('report usability safeguards', () => {
  it('keeps reset cancellation completely non-destructive, including an open preview', async () => {
    const g = gui(); g.run("handleInteraction('component',0,0); previewObservation(1)");
    const before = g.snapshot(), saved = await g.run('buildScenarioJson()');
    let message = '';
    Object.assign(g.ctx, { confirm: (text: string) => { message = text; return false; } });
    g.run('requestReset()');
    expect(message).toContain('過去の画面は再表示・再開できなくなります');
    expect(message).toContain('先に保存');
    expect(g.snapshot()).toBe(before);
    expect(await g.run('buildScenarioJson()')).toBe(saved);
    expect(g.run('historySelection.id')).toBe(1);
    Object.assign(g.ctx, { confirm: () => true });
    g.run('requestReset()');
    expect(g.run('historySelection')).toBeNull();
    expect(g.run('view.data.state.sharedVariants[0].variant')).toBe('Old');
    expect(g.run('SESSION.query({select:["provenanceSummary"]}).data.provenanceSummary.observations.discarded')).toBeGreaterThan(0);
  });
  it('does not ask or reset while a scenario is being checked', () => {
    const g = gui(); const before = g.snapshot();
    Object.assign(g.ctx, { confirm: () => { throw new Error('unexpected confirmation'); } });
    g.run('scenarioBusy = true; requestReset()');
    expect(g.snapshot()).toBe(before);
  });
  it('makes branch buttons explicit and executes the selected branch once', () => {
    const g = gui('# Home\n> Choose -> [Yes] goto(Done) ; [No] stay\n# Done\nfinished\n');
    const row = g.app.innerHTML.match(/<div class="action-row action-row-conditional">[\s\S]*?<\/div>/)?.[0];
    expect(row).toBeDefined();
    expect(row).toContain('[Yes]で実行');
    expect(row).toContain('[No]で実行');
    const handler = row!.match(/<button[^>]*onclick="([^"]+)"/)![1]!;
    g.run(handler);
    expect(g.run('view.summary.location.component')).toBe('Done');
    expect(g.run('SESSION.query({select:["provenance"]}).data.provenance.items.length')).toBe(1);
  });
  it('keeps initial actions before optional controls and folds technical explanations', () => {
    const g = gui(); const html = g.app.innerHTML;
    expect(html).toContain('操作して、表示・戻り先・状態の残り方を確かめる');
    expect(html.indexOf('class="action-row')).toBeLessThan(html.indexOf('class="action-toggle"'));
    const controls = g.run('scenarioControls()');
    expect(controls).toMatch(/<details data-state-key="scenario-details"><summary>/);
    expect(controls.indexOf('save-scenario')).toBeLessThan(controls.indexOf('scenario-details'));
    expect(html).toContain('onclick="requestReset()"');
    expect(html).not.toContain('onclick="resetSession()"');
  });
});


describe('addendum warning and remaining-work inspection', () => {
  it('counts real diagnostics in collapsed headings, independent of event visibility and retained snapshots', async () => {
    const g = gui('# Home\n> Warn -> exit(@missing) ; exit(@another)\n> Explain -> R002: explanation\n');
    g.run("handleInteraction('component',0,0)");
    expect(g.app.innerHTML).toMatch(/aria-expanded="false"[^>]*>記録1[^<]*<span[^>]*>要確認 2件/);
    g.run('toggleShowEvents(); toggleProvenanceStep(1)');
    expect(g.app.innerHTML).toContain('R002:');
    expect(g.app.innerHTML).toContain('対象セッション');
    const before = g.snapshot(), saved = await g.run('buildScenarioJson()');
    g.run('toggleProvenanceStep(1); renderRemainingWork()');
    expect(g.snapshot()).toBe(before); expect(await g.run('buildScenarioJson()')).toBe(saved);
    g.run('resetSession()');
    expect(g.app.innerHTML).toMatch(/aria-expanded="false"[^>]*>記録1[^<]*<span[^>]*>要確認 2件/);
    g.run("handleInteraction('component',1,0)");
    expect(g.app.innerHTML).not.toMatch(/記録3[^<]*要確認/);
    await g.run('buildScenarioJson().then(loadScenarioText)');
    expect(g.app.innerHTML).toMatch(/記録1[^<]*<span[^>]*>要確認 2件/);
  });
  it('shows inactive children and current-path parents without moving execution, and removes exited subtrees', async () => {
    const g = gui('# Home\n> Start -> present(Work, @member)\n# Work\n> Search -> switch(Search, @search)\n# Search\n> Confirm -> present(Confirm, @confirm)\n> End -> exit(@member)\n# Confirm\n> Search -> switch(Search, @search)\n');
    for (let n=0;n<4;n++) g.run("handleInteraction('component',0,0)");
    const before=g.snapshot(), saved=await g.run('buildScenarioJson()');
    const panel=g.run('renderRemainingWork()');
    expect(panel).toContain('残っている作業（現在の経路外 1件）');
    expect(panel).toContain('main::Confirm');
    expect(panel).toContain('@confirm');
    expect(panel).toContain('親: #2');
    expect(panel).toContain('現在の経路外で保持');
    expect(panel).toContain('現在の経路');
    expect(panel).not.toMatch(/onclick|onchange|seek|switch\(/);
    expect(g.snapshot()).toBe(before); expect(await g.run('buildScenarioJson()')).toBe(saved);
    g.run('previewObservation(1)');
    expect(g.run('renderRemainingWork()')).toContain('main::Confirm');
    expect(g.run('renderRemainingWork()')).toContain('現在の操作位置');
    g.run('endHistoryPreview(); handleInteraction("component",1,0)');
    const after=g.run('renderRemainingWork()');
    expect(after).not.toContain('main::Confirm'); expect(after).not.toContain('@member');
    expect(after).toContain('現在の経路外 0件');
  });
  it('keeps independent displays and shared state separate from ended work', () => {
    const g=gui('# Home\n> Start -> present(Work, @member) ; show(Notice) ; set(State##Ready)\n# Work\n> End -> exit(@member)\n# Notice\nnotice\n#! State\n## Idle\n## Ready\n');
    g.run("handleInteraction('component',0,0); handleInteraction('component',0,0)");
    const panel=g.run('renderRemainingWork()');
    expect(panel).toContain('独立表示'); expect(panel).toContain('main::Notice');
    expect(panel).toContain('共有状態'); expect(panel).toContain('main::State / Ready');
    expect(panel).not.toContain('main::Work');
    expect(panel).toContain('hide'); expect(panel).toContain('exit');
  });
});


describe('concept guide contract', () => {
  it('explains gate targets and manual settings at the control before use', async () => {
    const g = gui('# Home\ncard: Card\n> Check(card.signal?) -> checked\n# Card\n## Idle\nx\n## Ready\nsignal\n');
    const before = g.snapshot(), saved = await g.run('buildScenarioJson()');
    const row = g.app.innerHTML.match(/<div class="action-row action-row-disabled[\s\S]*?<\/div>/)![0];
    expect(row).toContain('Card.signal が参照先の状態パターンにないため無効');
    expect(row).toContain('画面上の可視性ではなく構造を判定');
    expect(row).toMatch(/<label[^>]*>検討用の手動設定[\s\S]*<select/);
    expect(row).toContain('aria-label="Card の状態パターンを検討用に手動設定"');
    g.run('render()');
    expect(g.snapshot()).toBe(before); expect(await g.run('buildScenarioJson()')).toBe(saved);
    g.run("setInstanceVariant('main','Card','Ready')");
    expect(g.app.innerHTML).not.toContain('gate-off-mark');
    expect(g.app.innerHTML).toContain('検討用に手動設定');
  });

  it('separates state location, source and independent display lifetime', () => {
    const g = gui('# Home\n> Start -> show(Notice) ; goto(##Changed)\n## Initial\n## Changed\n# Notice\nnotice\n');
    g.run('toggleShowStates()');
    expect(g.app.innerHTML).toContain('この画面の状態');
    expect(g.app.innerHTML).toContain('定義の初期値');
    g.run("handleInteraction('component',0,0)");
    expect(g.app.innerHTML).toContain('定義した操作で設定');
    expect(g.app.innerHTML).toContain('frame-location / dsl');
    expect(g.app.innerHTML).toContain('独立表示中（hide するまで残ります）');
    expect(g.app.innerHTML).toContain('この独立表示の状態');
  });

  it('names resume headings without exposing the journal technical action name', () => {
    const g = gui(); g.run("handleInteraction('component',0,0); jumpToTimeline(1)");
    const heading = g.app.innerHTML.match(/<button[^>]*data-focus-key="step:2"[^>]*>(.*?)<\/button>/)![1];
    expect(heading).toBe('記録2 · 操作を続ける位置の変更');
    expect(g.app.innerHTML).toContain('修正版を人が試し直すための文章です');
    expect(g.app.innerHTML).toContain('自動移行や初回入門用ではありません');
  });

  it('describes map limits alongside a back/dismiss/set trial', () => {
    const g = gui('# Home\n> Open -> push(Detail)\n# Detail\n> Modal -> present(Confirm)\n> Return -> back()\n# Confirm\n> Accept -> set(State##Ready) ; dismiss()\n#! State\n## Idle\n## Ready\n');
    expect(g.app.innerHTML).toContain('定義から得られる関係の静的な概観');
    expect(g.app.innerHTML).toContain('現在の試行の完全な実行経路ではありません');
    expect(g.app.innerHTML).toContain('戻り先は操作と履歴、状態変更は状態表示、残存作業は「残っている作業」');
    expect(g.app.innerHTML).toContain('ノードをクリックしても画面は遷移しません');
    g.run('graphShowAll = true; render()');
    const graph = () => g.app.innerHTML.match(/<svg class="graph-svg"[\s\S]*?<\/svg>/)![0];
    // Only Home -> Detail (push) and Detail -> Confirm (present) are static edges.
    expect(graph().match(/<line /g)).toHaveLength(2);
    expect(graph()).toContain('State');
    g.run("handleInteraction('component',0,0); handleInteraction('component',0,0); handleInteraction('component',0,0)");
    expect(g.run('view.summary.location.component')).toBe('Detail');
    expect(g.run('view.data.state.sharedVariants[0].variant')).toBe('Ready');
    g.run("handleInteraction('component',1,0)");
    expect(g.run('view.summary.location.component')).toBe('Home');
    expect(graph().match(/<line /g)).toHaveLength(2);
  });

  it('separates definitions, lifetimes and trial semantics in a closed, read-only guide', async () => {
    const g = gui();
    const before = g.snapshot(), saved = await g.run('buildScenarioJson()');
    const guide = g.app.innerHTML.match(/<details data-state-key="concept-guide">([\s\S]*?)<\/details>/)?.[1];
    expect(guide).toBeDefined();
    expect(guide).toContain('<h3>下書きを書く</h3>');
    expect(guide).toContain('<h3>動かしたときの残り方を決める</h3>');
    expect(guide).toContain('<h3>設計を確かめる</h3>');
    expect(guide).toContain('共有は同じ実行内で、永続保存ではありません');
    expect(guide).toContain('成功・失敗を自動判定しません');
    expect(guide).toContain('対象要素があるかを処理系が調べます');
    expect(guide).toContain('履歴を見るだけでは操作位置は変わらず');
    expect(guide).not.toMatch(/on(?:click|toggle|change)=|<button|<select/);
    g.run('render()');
    expect(g.snapshot()).toBe(before);
    expect(await g.run('buildScenarioJson()')).toBe(saved);
  });

  it('pairs operation roles with canonical scope names without changing dispatch', () => {
    const g = gui();
    expect(g.app.innerHTML).toContain('定義内の共通操作（component common）');
    // The same existing operation exercises each scope presentation; scope labels must not change its handler.
    for (const [scope, label] of [
      ['variant', 'この状態で定義（variant固有）'],
      ['component', '定義内の共通操作（component common）'],
      ['document', '文書の共通操作（document common）'],
    ]) {
      const row = g.run(`renderActionRow({...mainTopLevelItems()[0], scope:${JSON.stringify(scope)}}, () => 'unchangedHandler()')`);
      expect(row).toContain(label);
      expect(row).toContain('unchangedHandler(');
    }
    g.run("handleInteraction('component',0,0)");
    expect(g.run('historicalPreview')).toBeNull();
    expect(g.run('view.data.state.sharedVariants[0].variant')).toBe('New');
  });

  it('explains manual state setting before opening trials, including structural rather than visual presence', () => {
    const g = gui();
    expect(g.app.innerHTML).toContain('参照先の状態パターンを手動で変える（presence gate の試験）');
    expect(g.app.innerHTML).toContain('下書きに書いた操作の実行とは別です');
    expect(g.app.innerHTML).toContain('画面上の可視性は判定しません');
    const before = g.snapshot();
    g.run('toggleGatePanel()');
    expect(g.app.innerHTML).toContain('gate-drawer-header');
    expect(g.app.innerHTML).toContain('参照先の状態パターンを手動で変える（presence gate の試験）');
    expect(g.snapshot()).toBe(before);
  });
});
