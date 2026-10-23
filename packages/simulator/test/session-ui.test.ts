import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { parse } from '@shitae/parser';
import { toSimulator } from '../src/simulator.js';

function gui(source: string, extras: Record<string, string> = {}) {
  const p = parse(source); expect(p.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const docs = new Map([['main', p.document]]);
  for (const [module, text] of Object.entries(extras)) {
    const parsed = parse(text); expect(parsed.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
    docs.set(module, parsed.document);
  }
  const html = toSimulator(docs, 'main');
  const app = { innerHTML: '' };
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, document: { getElementById: () => app }, console, setTimeout: () => 0 });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (s: string) => vm.runInContext(s, ctx);
  return { html, app, run, view: () => JSON.parse(run('JSON.stringify(SESSION.query({select:["state","actions","history"]}))')) };
}
describe('GUI consumes the common Session', () => {
  it('counts only frames outside the current path as retained work', () => {
    const g = gui('# Home\n> A -> switch(A, @a)\n# A\n> Child -> present(Child, @child)\n# Child\n> B -> switch(B, @b)\n# B\n> Child -> switch(Child, @child)\n');
    g.run("handleInteraction('component',0,0)");
    g.run("handleInteraction('component',0,0)");
    expect(g.view().data.state.frames).toHaveLength(3);
    expect(g.app.innerHTML).toContain('残っている作業（現在の経路外 0件）');
    expect(g.app.innerHTML).toContain('現在の経路の祖先は件数に含めません');
    g.run("handleInteraction('component',0,0)");
    expect(g.view().data.state.frames).toHaveLength(4);
    expect(g.app.innerHTML).toContain('残っている作業（現在の経路外 2件）');
    expect(g.app.innerHTML.match(/現在の経路外で保持/g)).toHaveLength(2);
    g.run("handleInteraction('component',0,0)");
    expect(g.view().summary.location.component).toBe('Child');
    expect(g.app.innerHTML).toContain('残っている作業（現在の経路外 1件）');
  });

  it('qualifies ambiguous component modules and does not repeat equal element/component names', () => {
    const g = gui('import left as l\nimport right as r\n# Home\none: l::Card\ntwo: r::Card\nCard\nPlain\n# Card\n## Local\nbody\n# Plain\nbody\n', {
      left: '# Card\n## Left\nbody\n', right: '# Card\n## Right\nbody\n',
    });
    expect(g.app.innerHTML).not.toContain('component-state-value');
    const before = g.view(); g.run('toggleShowStates()');
    expect(g.app.innerHTML).toContain(' → left::Card · ##Left');
    expect(g.app.innerHTML).toContain(' → right::Card · ##Right');
    expect(g.app.innerHTML).toContain(' · main · ##Local');
    expect(g.app.innerHTML).not.toContain(' → Card');
    expect(g.app.innerHTML).not.toContain(' → Plain');
    expect(g.app.innerHTML).toContain(' · variantなし');
    expect(g.view()).toEqual(before);
  });

  it('resumes saved switch frames and renders their active path without a GUI reducer', () => {
    const g = gui('# Home\n> A -> switch(A, @a)\n# A\n> Detail -> push(D)\n# D\n> B -> switch(B, @b)\n# B\n> A -> switch(A, @a)\n');
    g.run("handleInteraction('component',0,0)"); g.run("handleInteraction('component',0,0)"); g.run("handleInteraction('component',0,0)"); g.run("handleInteraction('component',0,0)");
    expect(g.view().summary.location.component).toBe('D');
    expect(g.view().data.state.frames).toHaveLength(3);
    expect(g.app.innerHTML).toContain('D');
    expect(g.html).not.toContain('function applyTransition(');
    expect(g.html).not.toContain('function restoreState(');
  });
  it('captures handles in rendered clicks and rejects a queued click after a revision change', () => {
    const g = gui('# Home\n> Go -> push(Detail)\n# Detail\n> Surprise -> effect\n');
    const click = g.app.innerHTML.match(/onclick="(handleInteraction[^\"]+)"/)![1]!;
    g.run(click); const before = g.view(); g.run(click);
    expect(g.view()).toEqual(before);
    expect(g.app.innerHTML).toContain('STALE_HANDLE');
  });
  it('uses Session trial values/overlays and makes state annotations optional without changing execution', () => {
    const g = gui('# Home\ncard: Card\n> Show -> show(Card)\n> Check(card.ready?) -> effect\n# Card\n## Idle\nx\n## Ready\nready\n');
    expect(g.app.innerHTML).not.toContain('component-state-value');
    g.run("handleInteraction('component',0,0)"); g.run("setInstanceVariant('main','Card','Ready')");
    expect(g.view().data.state.inclusion.main.children[0].value).toMatchObject({ variant: 'Ready', origin: 'manual-test' });
    expect(g.view().data.state.inclusion.overlays[0]).toMatchObject({ variant: 'Idle', origin: 'initial' });
    const before = g.view(); g.run('toggleShowStates()');
    expect(g.view()).toEqual(before);
    expect(g.app.innerHTML).toContain('component-state-value');
    expect(g.app.innerHTML).toContain('manual-test');
    g.run('jumpToTimeline(0)'); expect(g.view().data.state.overlays).toEqual([]);
    g.run('resetSession()'); expect(g.view().data.history.items).toHaveLength(1);
  });
  it('does not embed model text as a closing script tag', () => {
    const g = gui('# Home\n> Go -> "</script><script>injected()"\n');
    expect(g.html.match(/<\/script>/g)).toHaveLength(1);
  });
});


describe('issue #66: same-name overlay cards', () => {
  it('renders distinct module titles and routes each card gate and close operation', () => {
    const g = gui('import a as a\nimport b as b\n# Screen\n> Show -> show(a::Notice##Ready) ; show(b::Notice)\n', {
      a: '# Notice\n> Close -> hide(Notice)\n> Check(signal?) -> A\n## Idle\na label\n## Ready\nsignal\n',
      b: '# Notice\n> Close -> hide(Notice)\n> Check(signal?) -> B\n## Idle\nb label\n## Ready\nsignal\n',
    });
    g.run("handleInteraction('component',0,0)");
    expect(g.view().data.state.overlays).toHaveLength(2);
    expect(g.app.innerHTML).toContain('a::Notice'); expect(g.app.innerHTML).toContain('b::Notice');
    const checks = g.view().data.actions.items.filter((a: any) => a.actionText === 'Check(signal?)');
    expect(checks.map((a: any) => a.enabled)).toEqual([true, false]);
    g.run("handleOverlayInteraction(1,'component',0,0)");
    expect(g.view().data.state.overlays.map((o: any) => o.module)).toEqual(['a']);
    g.run("handleOverlayInteraction(0,'component',0,0)");
    expect(g.view().data.state.overlays).toEqual([]);
  });
});
