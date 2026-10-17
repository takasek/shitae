// Execution, gates, effective operations and snapshots belong to the bundled Session.
let SESSION = new Shitae.Session(new Map(MODEL.documents), MODEL.entryModule, new Map(MODEL.files), MODEL.metadata);
let view, stack, overlays, sharedVariants, GATE_TARGETS, timeline, cursor, componentNameCounts;
let showEvents = true, showActions = true, showStates = false, sessionError = '';
let scenarioBusy = false, scenarioNotice = '', loadSummary = null;
let scenarioErrorDetails = null;
let provenanceOpen = new Set(), reviewOpen = false;
function toggleProvenanceStep(step) { if (provenanceOpen.has(step)) provenanceOpen.delete(step); else provenanceOpen.add(step); render(); }
function toggleReview() { reviewOpen = !reviewOpen; render(); }
function seekProvenancePoint(id) {
  // Revalidate against the current retained timeline, including after imports/reset.
  if (timeline.some(p => p.id === id)) command(() => SESSION.seek(id));
}
function saveReview() {
  const review = SESSION.query({ select: ['review'] }).data.review;
  if (!review.available) return;
  const url = URL.createObjectURL(new Blob([review.text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = MODEL.entryModule + '.review.txt'; link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function pointRef(ref) { return '記録' + ref.step + ' / 観測' + (ref.observation + 1); }
function provenanceCounts(counts) { return '現在まで ' + counts.retained + '観測点 / ghost ' + counts.ghost + '観測点 / 破棄済み ' + counts.discarded + '観測点'; }
function renderProvenance(fallback) {
  const summary = SESSION.query({ select: ['provenanceSummary'] }).data.provenanceSummary;
  if (!summary.available) return '<p>操作来歴を利用できません: ' + esc(summary.reason) + '</p><div class="timeline-log">' + fallback + '</div>';
  const items = []; let after;
  do {
    const page = SESSION.query({ select: ['provenance'], provenance: { limit: 100, ...(after === undefined ? {} : { after }) } }).data.provenance;
    items.push(...page.items); after = page.nextAfter;
  } while (after !== null);
  const pointButton = (p, extra = '') => '<button class="timeline-item timeline-item-' + p.kind + (p.current ? ' current' : '') + (p.status === 'ghost' ? ' ghost' : '') + '" onclick="seekProvenancePoint(' + p.id + ')">' + esc(extra + p.label) + ' <small>' + esc(locationLabel(p.location)) + (p.current ? ' / 現在地' : p.status === 'ghost' ? ' / ghost' : '') + '</small></button>';
  let html = '<p class="pane-desc">現在地: ' + esc(summary.cursor.actionText + ' / ' + pointRef(summary.cursor.ref) + ' / ' + locationLabel(summary.cursor.location)) + '</p>';
  html += '<p class="pane-desc">' + esc(provenanceCounts(summary.observations)) + '。記録には破棄経路・reset前・手動試験も含まれます。</p>';
  html += items.reverse().map(item => {
    const open = provenanceOpen.has(item.step);
    let body = '<div class="provenance-step"><button class="provenance-heading" aria-expanded="' + open + '" onclick="toggleProvenanceStep(' + item.step + ')">' + item.step + '. ' + esc(item.actionText + (item.branch === null ? '' : ' / 条件: ' + item.branch)) + '</button>';
    body += '<div class="pane-desc">' + esc((item.host.module ?? '') + '::' + locationLabel(item.host) + (item.placement ? ' / 配置 ' + item.placement.root + '[' + item.placement.path.join('.') + ']' : '')) + '</div>';
    body += '<div class="pane-desc">' + item.resultCount + '結果 / ' + item.observationCount + '観測点 · ' + esc(provenanceCounts(item.counts)) + '</div>';
    if (item.target) body += '<p class="provenance-marker">巻戻し/やり直し先: ' + esc(item.target.actionText + ' / ' + pointRef(item.target.ref) + (item.target.resultPosition === null ? '' : ' / 結果' + (item.target.resultPosition + 1)) + ' / ' + item.target.label) + '</p>';
    if (item.discarded.length) body += '<p class="provenance-marker">分岐・破棄 ' + item.discarded.length + '観測点（' + esc(item.discarded.map(pointRef).join('、')) + '）</p>';
    if (item.completionObservationId !== null) {
      const p = timeline.find(p => p.id === item.completionObservationId);
      if (p && (showEvents || p.kind !== 'event' || p.id === view.summary.cursorObservationId)) body += pointButton({ ...p, current: p.id === view.summary.cursorObservationId, status: p.ghost ? 'ghost' : 'retained' }, '完了点: ');
    } else if (item.kind === 'dispatch') body += '<p class="pane-desc">' + (item.observationCount ? '完了点は破棄済み' : '観測なし（移動先なし）') + '</p>';
    if (open) {
      const d = SESSION.query({ select: ['provenanceStep'], step: item.step }).data.provenanceStep;
      for (const r of d.results) body += '<p class="pane-desc">結果' + (r.position + 1) + ': ' + esc(r.label) + ' · ' + esc(provenanceCounts(r.counts)) + (r.observations.length ? '' : ' / 観測なし') + '</p>';
      for (const p of d.observations) {
        if (!p.seekable || (p.kind === 'event' && !showEvents && !p.current)) continue;
        body += pointButton(p, (p.resultPosition === null ? '' : '結果' + (p.resultPosition + 1) + ' / ') + '観測' + (p.ordinal + 1) + (p.id === d.completionObservationId ? '（完了点）: ' : '（途中）: '));
      }
    }
    return body + '</div>';
  }).join('');
  const initial = timeline.find(p => p.id === 1);
  if (initial) html += pointButton({ ...initial, current: initial.id === view.summary.cursorObservationId, status: initial.ghost ? 'ghost' : 'retained' }, '起点: ');
  html += '<p><button onclick="toggleReview()" aria-expanded="' + reviewOpen + '">検討手順を表示</button> <button onclick="saveReview()">検討手順を書出し</button></p>';
  if (reviewOpen) html += '<label>変更後モデルと見比べる検討手順<textarea class="review-text" readonly rows="14">' + esc(SESSION.query({ select: ['review'] }).data.review.text) + '</textarea></label>';
  return html;
}
async function buildScenarioJson() { return JSON.stringify(await SESSION.exportScenario(), null, 2) + '\n'; }
function scenarioFileName() {
  const m = MODEL.metadata;
  const entry = MODEL.entryModule.split('/').at(-1).replace(/[^\p{L}\p{N}._-]/gu, '_');
  return entry + '.' + m.modelId.slice(0, 12) + '.' + m.engineVersion.slice(0, 12) + '.scenario.json';
}
function scenarioCounts(session = SESSION) {
  const s = session.query({ select: ['provenanceSummary'] }).data.provenanceSummary;
  if (!s.available) return '記録の要約は利用できません';
  return 'dispatch ' + s.steps.dispatch + '件 / seek ' + s.steps.seek + '件 / reset ' + s.steps.reset + '件 / 手動試験 ' + s.steps.setTestVariant + '件';
}
function nameCounts(componentValues) {
  const counts = new Map();
  for (const c of componentValues) counts.set(c.component, (counts.get(c.component) ?? 0) + 1);
  return counts;
}
// Singletons shown by one inclusion root (the root itself and every component node below it), once per (module, component).
function rootSingletons(root) {
  const found = new Map();
  const add = (module, component, variant) => { const key = skey(module, component); if (!found.has(key)) found.set(key, { module, component, variant }); };
  if (root.singleton) add(root.module, root.component, root.variant);
  const walk = nodes => { for (const n of nodes) { if (n.kind === 'component' && n.value.singleton) add(n.reference.module, n.reference.component, n.value.variant); walk(n.children); } };
  walk(root.children);
  return [...found.values()];
}
// Read once from the replayed Session at the load point; nothing here is kept in or written to the Session.
function summarizeLoadSingletons(session) {
  const state = session.query({ select: ['state'] }).data.state, counts = nameCounts(state.componentValues);
  const label = e => (counts.get(e.component) > 1 ? e.module + '::' : '') + e.component + ' ' + (e.variant === null ? 'variantなし' : '##' + e.variant);
  return [{ label: '本体', root: state.inclusion.main }, ...state.inclusion.overlays.map(o => ({ label: 'overlay ' + o.component, root: o }))]
    .map(g => ({ label: g.label, entries: rootSingletons(g.root).map(label) })).filter(g => g.entries.length > 0);
}
const LOAD_SUMMARY_INLINE_LIMIT = 5;
function loadSummaryHtml() {
  if (!loadSummary) return '';
  const total = loadSummary.reduce((n, g) => n + g.entries.length, 0);
  if (total === 0) return '<p role="status">読込地点の表示中の部品にsingletonはありません</p>';
  if (total <= LOAD_SUMMARY_INLINE_LIMIT) return '<p role="status">読込地点のsingleton: ' + esc(loadSummary.map(g => g.label + ': ' + g.entries.join(', ')).join(' / ')) + '</p>';
  return '<p role="status">読込地点のsingleton ' + total + '件（' + esc(loadSummary.map(g => g.label + ' ' + g.entries.length).join(' / ')) + '）</p>' +
    '<details data-state-key="load-singletons"><summary>読込地点のsingleton一覧</summary><ul>' +
    loadSummary.flatMap(g => g.entries.map(e => '<li>' + esc(g.label + ': ' + e) + '</li>')).join('') + '</ul></details>';
}
async function saveScenario() {
  if (scenarioBusy) return;
  try {
    const text = await buildScenarioJson();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = scenarioFileName(); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sessionError = ''; scenarioErrorDetails = null; scenarioNotice = 'シナリオの保存ファイルを作成しました'; loadSummary = null;
  } catch (e) { sessionError = e.message; scenarioNotice = ''; loadSummary = null; }
  render();
}
async function replaceScenario(readText) {
  if (scenarioBusy) return;
  scenarioBusy = true; scenarioNotice = ''; loadSummary = null; sessionError = ''; scenarioErrorDetails = null; render();
  try {
    const text = await readText();
    let saved;
    try { saved = JSON.parse(text); } catch { throw new Shitae.ScenarioError('SCENARIO_FORMAT', 'シナリオのJSONを読めません'); }
    const next = await Shitae.replayScenario({ documents: new Map(MODEL.documents), entryModule: MODEL.entryModule,
      files: new Map(MODEL.files), metadata: MODEL.metadata }, saved);
    // Everything that can throw is computed from `next` first, so a failure cannot leave a swapped Session behind an error.
    const notice = 'シナリオを読み込みました（' + scenarioCounts(next) + 'を照合）', summary = summarizeLoadSingletons(next);
    SESSION = next;
    provenanceOpen = new Set(); reviewOpen = false;
    scenarioNotice = notice; loadSummary = summary;
  } catch (e) {
    scenarioErrorDetails = e.diagnostic ?? null;
    sessionError = e.diagnostic ? e.code + ': ' + e.diagnostic.reasons.join('\n') + '\n次の行動:\n' + e.diagnostic.nextActions.join('\n') : e.message;
  }
  finally { scenarioBusy = false; render(); }
}
async function loadScenarioText(text) { return replaceScenario(() => Promise.resolve(text)); }
async function loadScenarioFile(input) {
  const file = input.files?.[0];
  if (!file || scenarioBusy) return;
  input.value = '';
  return replaceScenario(() => file.text());
}
function scenarioControls() {
  const m = MODEL.metadata;
  const identity = { engineVersion: m.engineVersion, modelId: m.modelId, entryModule: m.entryModule, sourceBasis: m.sourceBasis,
    manifest: m.manifest.map(({ module, sourceSha256 }) => ({ module, sourceSha256 })) };
  return '<div class="scenario-controls">' +
    '<p class="artifact-identity">このHTML: ' + esc(m.entryModule) + ' · model ' + esc(m.modelId.slice(0, 12)) + ' · engine ' + esc(m.engineVersion.slice(0, 12)) + '</p>' +
    '<details class="identity-details"><summary>版の詳細・共有するもの</summary><p>短縮IDは対応付けの補助です。読込時は完全な識別情報で厳密に照合します。</p><pre>' + esc(JSON.stringify(identity, null, 2)) + '</pre>' +
    '<p>再開には、このHTMLと完全一致するscenarioの組を渡してください。編集・再生成やCLIでの再開には全モデル・参照moduleと対応する処理系が必要です。遷移マップの分割設定も渡すならsimconfigを添えてください。</p></details>' +
    '<p class="scenario-scope">保存範囲: ' + esc(scenarioCounts()) + '。条件選択はdispatchの内訳として操作来歴に表示します。破棄経路・reset前・ghost・手動試験も含む全記録を保存します。モデル本文・DOM・表示設定は含みません。読込後も現在の表示設定を使います。</p>' +
    '<button data-focus-key="save-scenario" onclick="saveScenario()"' + (scenarioBusy ? ' disabled' : '') + '>シナリオを保存</button> ' +
    '<label>シナリオを読み込む <input data-focus-key="load-scenario" type="file" accept=".scenario.json,application/json" onchange="loadScenarioFile(this)"' + (scenarioBusy ? ' disabled' : '') + '></label>' +
    (scenarioBusy ? '<p role="status">シナリオを照合しています</p>' : scenarioNotice ? '<p role="status">' + esc(scenarioNotice) + '</p>' + loadSummaryHtml() : '') + '</div>';
}
function scenarioError() {
  return (sessionError ? '<p role="alert">' + esc(sessionError) + '</p>' : '') +
    (scenarioErrorDetails ? '<details class="identity-details"><summary>完全な期待/実際の識別情報</summary><pre>' + esc(JSON.stringify(scenarioErrorDetails, null, 2)) + '</pre></details>' : '');
}
function skey(module, component) { return JSON.stringify([module, component]); }
function componentValue(module, component) { return view.data.state.componentValues.find(c => c.module === module && c.component === component); }
// Static map endpoints use the model's default, independently of trial display values.
function initialVariant(module, component) { return DATA.modules[module]?.components[component]?.initialVariant ?? null; }
function isSingleton(module, component) { return componentValue(module, component)?.singleton ?? false; }
function displayVariant(frame) { return frame.variant; }
function getComp(module, name) { return DATA.modules[module]?.components[name]; }
function currentFrame() { return stack.at(-1); }
function syncView() {
  view = SESSION.query({ select: ['state', 'actions'] });
  // Rendering uses gate/target/source annotations; the wire inventory stays compact.
  view.data.actions.items = view.data.actions.items.map(item => SESSION.query({ select: ['action'], handle: item.handle }).data.action);
  const s = view.data.state;
  componentNameCounts = nameCounts(s.componentValues);
  stack = s.activePath.flatMap(id => {
    const f = s.frames.find(f => f.id === id);
    return f.stack.map((loc, i) => ({ ...loc, frameId: id, wall: i === 0 && f.barrier,
      sessionName: i === 0 ? f.beginsSession?.name ?? null : null, beginsSession: i === 0 ? f.beginsSession : null }));
  });
  overlays = new Map(s.overlays.map(o => [o.component, o]));
  sharedVariants = new Map(s.componentValues.map(c => [skey(c.module, c.component), c.variant]));
  GATE_TARGETS = s.gateTargets.map(c => ({ ...c, name: c.component }));
  timeline = [];
  let after;
  do {
    const page = SESSION.query({ select: ['history'], history: { limit: 100, ...(after === undefined ? {} : { after }) } }).data.history;
    timeline.push(...page.items.map(i => ({ ...i, screen: locationLabel(i.location) })));
    after = page.nextAfter;
  } while (after !== null);
  cursor = timeline.findIndex(i => i.id === view.summary.cursorObservationId);
}
function locationLabel(loc) { return loc.component + (loc.variant ? ' / ' + loc.variant : ''); }
function currentLocationLabel() { return locationLabel(view.summary.location); }
function command(run) {
  if (scenarioBusy) return;
  scenarioNotice = ''; loadSummary = null;
  scenarioErrorDetails = null;
  try { run(); sessionError = ''; } catch (e) {
    if (!(e instanceof Shitae.SessionError)) throw e;
    sessionError = e.message;
  }
  render();
}
function setInstanceVariant(module, name, variant) { command(() => SESSION.setTestVariant({ module, component: name, variant })); }
function toggleGatePanel() { gatePanelOpen = !gatePanelOpen; render(); }
function toggleShowEvents() { showEvents = !showEvents; render(); }
function toggleShowActions() { showActions = !showActions; render(); }
function toggleShowStates() { showStates = !showStates; render(); }
function resetSession() { command(() => SESSION.reset()); }
function jumpToTimeline(idx) { const entry = timeline[idx]; if (entry) command(() => SESSION.seek(entry.id)); }
function goBack(handle) { command(() => SESSION.dispatch({ handle: handle ?? view.data.actions.controls.back.handle })); }
function asInteraction(op) {
  return { ...op, actionText: op.actionText.replace(/\?\)$/, ')'), targetName: op.action.target?.name ?? null,
    targetMember: op.action.target?.member ?? null, choices: op.branches, prelude: op.prelude };
}
function operations(root, path = []) {
  return view.data.actions.items.filter(op => op.placement.root === root && JSON.stringify(op.placement.path) === JSON.stringify(path))
    .filter(op => op.gate?.kind !== 'host' || op.enabled).map(asInteraction);
}
function gateEnabled(inter) { return inter.enabled; }
function currentInteractions() { return operations('main').filter(i => i.scope !== 'document'); }
function docCommonInteractions() { return operations('main').filter(i => i.scope === 'document'); }
function scopedInteractions(scope) { return operations('main').filter(i => i.scope === scope); }
function overlayInteractions(name) { return operations('overlay:' + name); }
function overlayScopedInteractions(name, scope) { return overlayInteractions(name).filter(i => i.scope === scope); }
function overlayVariant(name) { return overlays.get(name)?.variant ?? null; }
function currentHostGateNames() { return [...new Set(view.data.actions.items.filter(i => i.placement.root === 'main' && i.placement.path.length === 0 && i.gate?.kind === 'host').map(i => i.gate.name))]; }
function itemsFor(interactions) {
  const counts = {};
  return [...interactions.filter(i => i.scope === 'variant'), ...interactions.filter(i => i.scope === 'component'), ...interactions.filter(i => i.scope === 'document')]
    .map(inter => ({ inter, scope: inter.scope, idx: (counts[inter.scope] = (counts[inter.scope] ?? -1) + 1) }));
}
function mainTopLevelItems() { return itemsFor(currentInteractions()); }
function documentEventItems() { return itemsFor(docCommonInteractions()); }
function overlayNameAt(cardIdx) { return [...overlays.keys()][cardIdx] ?? null; }
function overlayTopLevelItems(cardIdx) { const name = overlayNameAt(cardIdx); return name === null ? [] : itemsFor(overlayInteractions(name)); }
function elementsFor(nodes) {
  return nodes.map(node => ({ name: node.name, collection: node.collection, node,
    ...(node.reference ? { ref: { module: node.reference.module, name: node.reference.component } } : {}),
    ...(node.kind === 'inline' ? { children: elementsFor(node.children) } : {}) }));
}
function mainTopLevelElements() { return elementsFor(view.data.state.inclusion.main.children); }
function overlayTopLevelElements(cardIdx) { return elementsFor(view.data.state.inclusion.overlays[cardIdx]?.children ?? []); }
function computeElementContext(el) {
  const node = el.node;
  if (node.kind === 'unresolved') return null;
  return { childEls: elementsFor(node.children), ownItems: node.kind === 'component' ? itemsFor(operations(node.root, node.path)) : [] };
}
function resolveNestedItems(cardIdx, path) { return itemsFor(operations(cardIdx === -1 ? 'main' : 'overlay:' + overlayNameAt(cardIdx), path)); }
function dispatchInteraction(inter, choiceIdx, handle, branch) {
  if (!handle && !inter) return;
  command(() => SESSION.dispatch({ handle: handle ?? inter.handle,
    ...((branch ?? inter?.branches[choiceIdx]?.id) === undefined ? {} : { branch: branch ?? inter.branches[choiceIdx].id }) }));
}
function handleInteraction(scope, idx, choiceIdx, handle, branch) { dispatchInteraction(scopedInteractions(scope)[idx], choiceIdx, handle, branch); }
function handleOverlayInteraction(cardIdx, scope, idx, choiceIdx, handle, branch) { dispatchInteraction(overlayScopedInteractions(overlayNameAt(cardIdx), scope)[idx], choiceIdx, handle, branch); }
function handleNestedInteraction(cardIdx, path, scope, idx, choiceIdx, handle, branch) { dispatchInteraction(resolveNestedItems(cardIdx, path).find(i => i.scope === scope && i.idx === idx)?.inter, choiceIdx, handle, branch); }
function renderedClick(item, choiceIdx, buildOnclick) {
  return buildOnclick(item.scope, item.idx, choiceIdx).replace(/\)$/, ", '" + item.inter.handle + "'" +
    (item.inter.branches[choiceIdx] ? ", '" + item.inter.branches[choiceIdx].id + "'" : '') + ')');
}
function stateLabel(node) {
  if (!showStates || !node.value) return '';
  const v = node.value;
  const ref = node.reference, qualified = componentNameCounts.get(ref.component) > 1;
  const identity = node.name === ref.component ? (qualified ? ' · ' + esc(ref.module) : '')
    : ' → ' + esc((qualified ? ref.module + '::' : '') + ref.component);
  return '<span class="component-state-value">' + identity + ' · ' +
    esc(v.variant === null ? 'variantなし' : '##' + v.variant) + ' · ' + valueDescription(v) + '</span>';
}
function valueDescription(v) {
  const scopes = {'singleton-shared':'共有 (singleton)', 'frame-location':'画面の値', 'overlay-entry':'掲示の値', 'inclusion-initial':'包含の初期値', 'component-test':'部品の試験値'};
  const origins = {initial:'初期', dsl:'DSL', 'manual-test':'手動試験'};
  return '<span title="' + esc(v.scope + ' / ' + v.origin) + '">' + esc(scopes[v.scope]) + ' · ' + esc(origins[v.origin]) + '</span>';
}
function rootStateLabel(root) { return showStates ? '<div class="component-state-value">' + valueDescription(root) + '</div>' : ''; }
function nodeKey(node) { return node.root + ':' + node.source.module + ':' + node.source.span.offset + ':' + node.path.join('.'); }
function operationKey(op) { return op.placement.root + ':' + op.placement.path.join('.') + ':' + op.source.module + ':' + op.source.span.offset; }
function capturePresentation() {
  const details = new Map([...(app.querySelectorAll?.('details[data-state-key]') ?? [])].map(el => [el.dataset.stateKey, el.open]));
  const active = document.activeElement;
  const focus = active && app.contains?.(active) ? active.getAttribute('data-focus-key') ?? active.getAttribute('onchange') : null;
  return { details, focus };
}
function restorePresentation(saved) {
  for (const el of app.querySelectorAll?.('details[data-state-key]') ?? []) {
    if (saved.details.has(el.dataset.stateKey)) el.open = saved.details.get(el.dataset.stateKey);
  }
  if (saved.focus) {
    const el = [...(app.querySelectorAll?.('[data-focus-key],[onchange]') ?? [])].find(el => (el.getAttribute('data-focus-key') ?? el.getAttribute('onchange')) === saved.focus);
    el?.focus();
  }
}
syncView();
