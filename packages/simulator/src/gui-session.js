// Execution, gates, effective operations and snapshots belong to the bundled Session.
let SESSION = new Shitae.Session(new Map(MODEL.documents), MODEL.entryModule, new Map(MODEL.files), MODEL.metadata);
let view, stack, overlays, sharedVariants, GATE_TARGETS, timeline, cursor, componentNameCounts;
let showEvents = true, showActions = true, showStates = false, sessionError = '';
let scenarioBusy = false, scenarioNotice = '', loadSummary = null;
let scenarioErrorDetails = null;
let provenanceOpen = new Set(), reviewOpen = false;
function toggleProvenanceStep(step) { if (provenanceOpen.has(step)) provenanceOpen.delete(step); else provenanceOpen.add(step); render(); }
function toggleReview() { reviewOpen = !reviewOpen; render(); }
let sessionGeneration = 0, historySelection = null, historicalPreview = null, resumeConfirmation = null, historyNotice = '';
let nextPresentationFocus = null, resumeReturnFocus = null;
function retainedObservation(id) {
  try { return SESSION.query({ select: ['observation'], observationId: id }).data.observation; }
  catch (e) { if (!(e instanceof Shitae.SessionError)) throw e; return null; }
}
function previewObservation(id) {
  if (scenarioBusy) return;
  const observation = retainedObservation(id);
  resumeConfirmation = null;
  historySelection = observation ? { generation: sessionGeneration, id } : null;
  historicalPreview = observation;
  historyNotice = observation ? '' : '対象が変わりました。履歴から選び直してください';
  render();
}
function focusCurrentHistory() {
  const current = SESSION.query({select:['provenanceSummary']}).data.provenanceSummary.cursor;
  if (current?.ref.step) { provenanceOpen.add(current.ref.step); render(); }
  const p = app.querySelector?.('[data-current-point]');
  p?.scrollIntoView({block:'nearest'}); p?.querySelector?.('button')?.focus({preventScroll:true});
}
function endHistoryPreview() { nextPresentationFocus = historySelection ? 'preview:' + historySelection.id : 'current-position'; historySelection = null; historicalPreview = null; resumeConfirmation = null; render(); }
function requestResume(id) {
  if (scenarioBusy) return;
  const observation = retainedObservation(id);
  if (!observation || id === SESSION.query().summary.cursorObservationId) return;
  resumeReturnFocus = historySelection ? 'request-resume' : 'resume:' + id;
  nextPresentationFocus = 'confirm-resume';
  resumeConfirmation = { generation: sessionGeneration, revision: SESSION.query().revision, id };
  render();
}
function cancelResume() { nextPresentationFocus = resumeReturnFocus; resumeConfirmation = null; render(); }
function confirmResume() {
  if (scenarioBusy) return;
  const target = resumeConfirmation;
  if (!target || target.generation !== sessionGeneration || target.revision !== SESSION.query().revision || !retainedObservation(target.id)) {
    resumeConfirmation = null; historyNotice = '対象が変わりました。履歴から選び直してください'; render(); return;
  }
  command(() => SESSION.seek(target.id));
  historyNotice = '操作を続ける位置を変更しました'; render();
}
function seekProvenancePoint(id) { previewObservation(id); }
function pointDescription(id, knownStep) {
  const p = timeline.find(p => p.id === id);
  if (!p) return '利用できない地点';
  let after;
  do {
    const page = knownStep === undefined ? SESSION.query({select:['provenance'], provenance:{limit:100,...(after === undefined ? {} : {after})}}).data.provenance : {items:[{step:knownStep}],nextAfter:null};
    for (const item of page.items) {
      const d = SESSION.query({select:['provenanceStep'],step:item.step}).data.provenanceStep;
      const o = d.observations.find(o=>o.id===id);
      if (o) return '記録' + d.step + '「' + d.actionText + '」 / 試した条件：' + (d.branch ?? 'なし') +
        (o.resultPosition === null ? '' : ' / 結果' + (o.resultPosition + 1)) + ' / 状態' + (o.ordinal + 1) + ' / ' + locationLabel(p.location);
    }
    after = page.nextAfter;
  } while (after !== null);
  return (p.id === 1 ? '起動' : '観測' + p.id + '「' + p.label + '」' + (p.resultIndex === null ? '' : ' / 定義内の結果' + (p.resultIndex + 1))) + ' / ' + locationLabel(p.location);
}
function historyPreviewHtml() {
  if (resumeConfirmation) return '<section class="history-preview"><h2>操作を続ける位置の変更</h2><p>変更前: ' + esc(pointDescription(view.summary.cursorObservationId)) +
    '</p><p>変更後: ' + esc(pointDescription(resumeConfirmation.id)) + '</p><p>確定するのは操作を続ける位置の変更だけです。当時の操作や同じ操作の残りの結果は自動では実行しません。</p>' +
    '<p>後の履歴も閲覧・再開できます。新たに再開できる地点を作る操作で、後の画面は閲覧・再開できなくなります。操作・条件・結果の文章は残ります。地点を作らない操作や拒否では後の履歴を保持します。見た目の変化だけでは判断できません。</p>' +
    '<button data-focus-key="confirm-resume" onclick="confirmResume()">この時点から続ける</button> <button data-focus-key="cancel-resume" onclick="cancelResume()">位置の変更をやめる</button></section>';
  if (!historicalPreview) return '';
  const o = historicalPreview, state = o.view.state;
  const nodes = children => '<ul>' + children.map(n => '<li>' + esc((n.collection ? '*' : '') + n.name + (n.reference ? ' / ' + n.reference.module + '::' + n.reference.component + (n.value?.variant ? ' / ' + n.value.variant : '') : '')) + nodes(n.children) + '</li>').join('') + '</ul>';
  const card = r => '<div class="screen"><h3>' + esc(r.module + '::' + locationLabel(r)) + '</h3>' + nodes(r.children) + '</div>';
  return '<section class="history-preview"><h2>見ている履歴の画面: ' + esc(pointDescription(o.id)) + '</h2><p>当時の表示部品と使えた操作を示します。閲覧は表示だけを切り替えます。操作を続ける位置は変わりません。当時の操作は説明として表示し、ここでは実行できません。</p>' +
    '<button data-focus-key="end-preview" onclick="endHistoryPreview()">履歴の閲覧を終える</button> <button data-focus-key="request-resume" onclick="requestResume(' + o.id + ')"' + (o.id === view.summary.cursorObservationId ? ' disabled title="現在の操作位置と同じ地点です"' : '') + '>この時点から続ける…</button>' +
    card(state.inclusion.main) + state.inclusion.overlays.map(card).join('') +
    '<h3>当時の操作（説明のみ）</h3><ul>' + o.view.actions.items.map(a => '<li>' + esc(a.actionText + ' / ' + a.placement.root + ' / ' + (a.enabled ? '有効' : '無効') + ' / 条件: ' + (a.branches.map(b=>b.label ?? 'なし').join('、') || 'なし')) + '</li>').join('') + '</ul></section>';
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
function provenanceCounts(counts) { return '現在まで ' + counts.retained + '地点 / 後の履歴 ' + counts.ghost + '地点 / 文章のみ ' + counts.discarded + '地点'; }
// Resolve source annotations against the embedded model, never against the current
// active screen: an operation may have been defined in an included component.
function definitionAt(source, resultIndex = null) {
  const doc = MODEL.documents.find(([module]) => module === source?.module)?.[1];
  if (!doc) return null;
  const bodies = [{ body: doc.common, component: null, variant: null }];
  for (const c of doc.components) {
    bodies.push({ body: c.common, component: c.name, variant: null });
    for (const v of c.variants) bodies.push({ body: v.body, component: c.name, variant: v.name });
  }
  for (const entry of bodies) for (const inter of entry.body.interactions) {
    if (resultIndex === null && inter.span.offset === source.span.offset) return { ...entry, inter };
    const r = resultIndex === null ? null : inter.results[resultIndex];
    if (r?.span.offset === source.span.offset) return { ...entry, inter, result: r.body };
  }
  return null;
}
function sourceModule(module, alias) {
  if (!alias) return module;
  return MODEL.documents.find(([name]) => name === module)?.[1].imports.find(i => i.alias === alias)?.module ?? alias;
}
function placementNode(placement, state = view.data.state) {
  let node = [state.inclusion.main, ...state.inclusion.overlays].find(r => r.root === placement.root);
  for (const index of placement.path) node = node?.children[index];
  return node;
}
function operationDetails(op, state = view.data.state, context = 'live') {
  const definition = definitionAt(op.source);
  if (!definition) return '';
  const origin = op.source.module + (definition.component ? '::' + definition.component : '（文書共通）') + (definition.variant ? ' / ' + definition.variant : '');
  const placed = placementNode(op.placement, state);
  const pathNames = []; let path = [];
  for (const index of op.placement.path) { path.push(index); pathNames.push(placementNode({ ...op.placement, path }, state)?.name ?? String(index)); }
  let role = op.placement.path.length ? '部品の既定操作' : 'この定義の操作';
  const target = op.action.target;
  if (target?.member) {
    const alias = target.module == null ? definition.body.elements.find(e => e.alias === target.name) : null;
    const child = placed?.children.find(n => alias ? n.source.module === op.source.module && n.source.span.offset === alias.span.offset : n.reference?.component === target.name && n.reference.module === sourceModule(op.source.module, target.module));
    const ref = child?.reference;
    const comp = ref && MODEL.documents.find(([module]) => module === ref.module)?.[1].components.find(c => c.name === ref.component);
    const defaults = comp ? [...comp.common.interactions, ...(comp.variants.find(v => v.name === child.value?.variant)?.body.interactions ?? [])] : [];
    const actionText = text => text.replace(/\s+/g, ' ').trim();
    if (defaults.some(({ action: a }) => a.target?.name === target.member && a.target.module == null && a.target.member == null && a.target.collection === target.collection && actionText(a.text) === actionText(op.action.text))) role = '局所上書き: ' + ref.module + '::' + ref.component + ' の既定操作';
  }
  return '<details class="operation-details" data-state-key="operation:' + esc(context + ':' + operationKey(op)) + '"><summary>操作の詳細</summary>' +
    '<p>' + esc('定義元: ' + origin) + '</p><p>' + esc(role) + '</p><p>' + esc('配置: ' + op.placement.root + (pathNames.length ? ' / ' + pathNames.join(' / ') : '（画面・独立表示の本体）')) + '</p>' +
    '<p>定義元・配置と作用先は別です。goto(##状態) は各結果の適用時点のアクティブ画面を変えます。包含部品自身の局所状態を変える指定ではありません。singleton 化すると共有範囲も変わります。</p>' +
    '<p>' + esc('定義位置: ' + (op.source.file ?? op.source.module) + ':' + op.source.span.line + ':' + op.source.span.col) + '</p></details>';
}
function recordedOperationDetails(detail) {
  if (detail.kind !== 'dispatch') return '';
  const first = detail.results.find(r => r.source);
  const definition = first && definitionAt(first.source, first.resultIndex);
  if (!definition) return '';
  const from = detail.from.step === 0 ? { id: 1 } : SESSION.query({select:['provenanceStep'],step:detail.from.step}).data.provenanceStep.observations.find(p => p.ref.observation === detail.from.observation);
  const before = from && retainedObservation(from.id);
  const operation = before?.view.actions.items.find(op => op.source.module === first.source.module && op.source.span.offset === definition.inter.span.offset && op.placement.root === detail.placement?.root && JSON.stringify(op.placement.path) === JSON.stringify(detail.placement.path));
  if (operation) return operationDetails(operation, before.view.state, 'record:' + detail.step);
  return '<p>' + esc('定義元: ' + first.source.module + (definition.component ? '::' + definition.component : '（文書共通）') + (definition.variant ? ' / ' + definition.variant : '')) + '</p><p>操作前の画面は残っていません。配置と局所上書きの詳細は確認できません。</p>';
}
function resultTargetHtml(result) {
  const body = definitionAt(result.source, result.resultIndex)?.result;
  if (body?.kind === 'effect') return '<p class="result-target">自由文の結果（状態変更の記録ではありません）</p>';
  const warnings = result.observations.filter(p => /^R[0-9]{3}:/.test(p.label));
  const warningHtml = warnings.length ? '<div class="history-diagnostics">警告<ul>' + warnings.map(p => '<li>' + esc(p.label) + '</li>').join('') + '</ul></div>' : '';
  const point = result.observations.find(p => p.kind === 'transition' || !/^R[0-9]{3}:/.test(p.label));
  if (!point) return '<p class="result-target">状態の変更記録なし。作用先の変更は確認できません。</p>' + warningHtml;
  const observation = retainedObservation(point.id);
  if (!observation) return '<p class="result-target">当時の状態は文章のみのため、変更先と共有範囲の詳細は確認できません。</p>' + warningHtml;
  const state = observation.view.state;
  let value, prefix = '変更先: ';
  if (body?.kind === 'state' || body?.kind === 'overlay') {
    // Lexical module aliases are resolved by the same model inventory used by
    // the simulator; do not interpret a set target as the active screen.
    const module = sourceModule(result.source.module, body.target.module);
    const values = body.kind === 'state' ? state.sharedVariants : state.overlays;
    value = values.find(v => v.module === module && v.component === body.target.name);
    if (!value && body.kind === 'overlay' && body.verb === 'hide') return '<p class="result-target">' + esc('独立表示の解除先: ' + module + '::' + body.target.name + ' / 共有状態と画面の作業は別に保持') + '</p>';
  } else if (point.kind === 'transition') {
    value = state.frames.find(f => f.id === state.activeFrameId)?.stack.at(-1);
    prefix = body?.kind === 'transition' && body.word === 'goto' ? '実行後の作用先: ' : '実行後の画面: ';
  }
  if (!value) return '<p class="result-target">変更先を確認できません。結果と警告を確認してください。</p>';
  const scope = value.singleton ? '同じ実行内の同じ定義の全使用箇所（singleton）' : value.scope === 'overlay-entry' ? 'この独立表示の状態' : 'この画面の状態';
  // A resumed switch ignores the navigation target, but its explicit singleton
  // variant is still written. Read both values from this result's observation.
  const sharedTarget = body?.kind === 'transition' && body.word === 'switch' && body.target?.kind === 'component' && body.target.variant != null
    ? state.sharedVariants.find(v => v.module === sourceModule(result.source.module, body.target.module) && v.component === body.target.name) : null;
  const sharedHtml = sharedTarget ? '<p class="result-target">' + esc('共有状態の書換え先: ' + sharedTarget.module + '::' + locationLabel(sharedTarget)) + '<br>共有範囲: 同じ実行内の同じ定義の全使用箇所（singleton）</p>' : '';
  return '<p class="result-target">' + esc(prefix + value.module + '::' + locationLabel(value)) + '<br>' + esc('共有範囲: ' + scope) + (prefix === '実行後の画面: ' ? '<br>戻り先・作業の終了を含む結果です。表示中の画面への書換えを意味するものではありません。' : '') + '</p>' + sharedHtml + warningHtml;
}
function renderProvenance(fallback) {
  const summary = SESSION.query({ select: ['provenanceSummary'] }).data.provenanceSummary;
  if (!summary.available) return '<p>操作来歴を利用できません: ' + esc(summary.reason) + '</p><div class="timeline-log">' + fallback + '</div>';
  const items = []; let after;
  do {
    const page = SESSION.query({ select: ['provenance'], provenance: { limit: 100, ...(after === undefined ? {} : { after }) } }).data.provenance;
    items.push(...page.items); after = page.nextAfter;
  } while (after !== null);
  const pointButton = (p, extra = '') => '<div class="history-point' + (historySelection?.id === p.id ? ' selected' : '') + '"' + (p.current ? ' data-current-point="true"' : '') + ' data-history-key="point:' + p.id + '">' +
    '<p>' + esc(extra + p.label + ' / ' + locationLabel(p.location)) + ' · ' + (p.current ? '現在の操作位置' : p.status === 'ghost' ? '後の履歴・閲覧・再開可' : p.seekable === false ? '文章のみ' : '閲覧・再開可') + (historySelection?.id === p.id ? ' / 見ている履歴の画面' : '') + '</p>' +
    '<button data-focus-key="preview:' + p.id + '" onclick="previewObservation(' + p.id + ')"' + (p.seekable === false ? ' disabled' : '') + '>画面を見る</button> ' +
    '<button data-focus-key="resume:' + p.id + '" onclick="requestResume(' + p.id + ')"' + (p.current || p.seekable === false ? ' disabled title="' + (p.current ? '現在の操作位置と同じ地点です' : 'この時点の画面は残っていません') + '"' : '') + '>この時点から続ける…</button></div>';
  let html = '<p class="pane-desc">記録には位置の変更・reset前・手動試験も含みます。再開できる地点は、一つの結果の途中も含む保存された状態です。</p>';
  html += '<details data-state-key="history-counts"><summary>技術詳細：履歴の保持件数</summary>' + esc(provenanceCounts(summary.observations)) + '</details>';
  html += items.reverse().map(item => {
    const open = provenanceOpen.has(item.step);
    const detail = SESSION.query({ select: ['provenanceStep'], step: item.step }).data.provenanceStep;
    // Session records runtime warnings as `Rnnn: message` event labels. Effects always
    // have the distinct `effect: ` prefix. Use journal points so discarded warnings
    // remain discoverable, independent of the event-visibility toggle.
    const warnings = detail.observations.filter(p => p.kind === 'event' && /^R[0-9]{3}:/.test(p.label));
    const warningBadge = warnings.length ? ' <span class="history-warning">要確認 ' + warnings.length + '件</span>' : '';
    const c = item.counts, available = c.retained + c.ghost;
    const status = c.discarded ? (available ? '一部の結果は文章のみ' : '文章のみ') : available ? '閲覧・再開可' : '再開できる地点なし';
    const kind = {dispatch:'操作',seek:'操作を続ける位置の変更',reset:'初期化',setTestVariant:'手動試験'}[item.kind];
    const action = item.kind === 'seek' ? '' : ' · ' + esc(item.actionText);
    let body = '<div class="provenance-step" data-history-key="step:' + item.step + '"><button data-focus-key="step:' + item.step + '" class="provenance-heading" aria-expanded="' + open + '" onclick="toggleProvenanceStep(' + item.step + ')">記録' + item.step + ' · ' + kind + action + warningBadge + '</button>';
    body += '<p>試した条件：' + esc(item.branch ?? 'なし') + ' / 結果 ' + item.resultCount + '件 / ' + status + '</p>';
    if (item.discarded.length) body += '<p>この記録で文章のみになった地点: ' + item.discarded.length + '件</p>';
    if (item.target) body += '<p>変更先: ' + esc(item.target.actionText + ' / ' + pointRef(item.target.ref)) + '</p>';
    if (item.completionObservationId !== null) {
      const p = timeline.find(p => p.id === item.completionObservationId);
      if (p && (showEvents || p.kind !== 'event' || p.id === view.summary.cursorObservationId)) body += '<button data-focus-key="last:' + item.step + '" onclick="previewObservation(' + p.id + ')">この操作の最後に保存された状態を見る: ' + esc(pointDescription(p.id, item.step)) + '</button>';
    }
    if (open) {
      body += recordedOperationDetails(detail);
      body += '<p>この操作で起きたことを順に表示します。</p>';
      const d = detail;
      if (warnings.length) body += '<div class="history-diagnostics"><strong>実行時の警告</strong><ul>' + warnings.map(p => '<li>' + esc(p.label) + '</li>').join('') + '</ul></div>';
      for (const r of d.results) {
        body += '<p>結果' + (r.position + 1) + ': ' + esc(r.label) + (r.observations.length ? '' : ' / 再開できる地点なし') + '</p>';
        body += resultTargetHtml(r);
        for (const p of r.observations) if (showEvents || p.kind !== 'event' || p.current) body += pointButton(p, '結果' + (r.position + 1) + ' / 状態' + (p.ordinal + 1) + ': ');
      }
      for (const p of d.observations.filter(p=>p.resultPosition === null)) if (showEvents || p.kind !== 'event' || p.current) body += pointButton(p);
      body += '<details data-state-key="technical:' + item.step + '"><summary>技術詳細</summary><pre>' + esc(JSON.stringify({host:item.host, placement:item.placement, observations:d.observations, discarded:item.discarded},null,2)) + '</pre></details>';
    }
    return body + '</div>';
  }).join('');
  const initial = timeline.find(p => p.id === 1);
  if (initial) html += pointButton({ ...initial, current: initial.id === view.summary.cursorObservationId, status: initial.ghost ? 'ghost' : 'retained' }, '起点: ');
  html += '<p class="pane-desc">検討手順は、修正版を人が試し直すための文章です。自動移行や初回入門用ではありません。</p><p><button onclick="toggleReview()" aria-expanded="' + reviewOpen + '">検討手順を表示</button> <button onclick="saveReview()">検討手順を書出し</button></p>';
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
// Singletons one placement root depends on, once per (module, component): those its inclusion tree shows (the root itself and every
// component node below it), then the targets of member gates on operations placed in the root (their state decides what is operable).
function rootSingletons(root, gates) {
  const found = new Map();
  const add = (module, component, variant) => { const key = skey(module, component); if (!found.has(key)) found.set(key, { module, component, variant }); };
  if (root.singleton) add(root.module, root.component, root.variant);
  const walk = nodes => { for (const n of nodes) { if (n.kind === 'component' && n.value.singleton) add(n.reference.module, n.reference.component, n.value.variant); walk(n.children); } };
  walk(root.children);
  for (const g of gates) if (g.kind === 'member' && g.value?.singleton) add(g.module, g.targetComponent, g.value.variant);
  return [...found.values()];
}
// Read once from the replayed Session at the load point; nothing here is kept in or written to the Session.
function summarizeLoadSingletons(session) {
  const state = session.query({ select: ['state'] }).data.state, counts = nameCounts(state.componentValues);
  const gatesByRoot = new Map();
  for (const item of session.query({ select: ['actions'] }).data.actions.items) {
    const gate = session.query({ select: ['action'], handle: item.handle }).data.action.gate;
    if (gate) gatesByRoot.set(item.placement.root, [...(gatesByRoot.get(item.placement.root) ?? []), gate]);
  }
  const name = e => (counts.get(e.component) > 1 ? e.module + '::' : '') + e.component;
  const label = e => name(e) + ' ' + (e.variant === null ? 'variantなし' : '##' + e.variant);
  return [{ label: '本体', root: state.inclusion.main }, ...state.inclusion.overlays.map(o => ({ label: 'overlay ' + name(o), root: o }))]
    .map(g => ({ label: g.label, entries: rootSingletons(g.root, gatesByRoot.get(g.root.root) ?? []).map(label) })).filter(g => g.entries.length > 0);
}
const LOAD_SUMMARY_INLINE_LIMIT = 5;
function stateQueryGuide(key = "state-query") {
  return '<details data-state-key="' + key + '"><summary>画面外も含めて状態を確認する方法</summary>' +
    '<p>部品の共有状態は、同じ部品を別の場所で使うときも共通になる状態です。全業務データを意味しません。</p>' +
    '<p>読み込んだ時点を調べるには元の読込ファイル、現在の操作位置を調べるには「操作の再生ファイルを保存」で作ったファイルを使います。履歴の閲覧中も保存するのは操作を続ける位置です。</p>' +
    '<p>「定義と実行プログラムの版・再現用の資料」の完全なmodelId/engineVersionを照合し、対応する画面と操作の定義（モデル）の入口・import一式と実行プログラム（shitae）を用意します。このHTMLからモデル本文は取り出せません。なければ作成者から対応する定義・実行プログラムを受け取ってください。</p>' +
    '<p>次のパスを手元のファイルに置き換えて起動し、同じprocessへJSONを1行送信します。</p>' +
    '<pre>node packages/cli/dist/index.js session &lt;定義ファイルの入口&gt; --replay &lt;対象の再生ファイル&gt;</pre>' +
    '<pre>{"id":"shared","command":"query","select":["state"]}</pre>' +
    '<p>応答の data.state.sharedVariants が画面外を含む全singletonのvariant一覧です。module（所属）とcomponent（部品）の組で識別し、variant（選ばれている状態）を読みます。componentValuesは通常部品も含む別の一覧です。照合に失敗したら元の組合せを用意し、ファイル編集で回避しないでください。</p></details>';
}
function loadSummaryHtml() {
  if (!loadSummary) return '';
  const total = loadSummary.reduce((n, g) => n + g.entries.length, 0);
  const prefix = '読み込んだ時点の状態（一部）: ';
  const note = '<p>読み込んだ時点の状態の一部です。画面外も含む全ての部品の共有状態の一覧ではありません。</p>' + stateQueryGuide('load-state-query');
  if (total === 0) return '<p role="status">' + prefix + '画面・操作条件に関係する部品の共有状態はありません。画面外の部品の共有状態がないという意味ではありません。</p>' + note;
  if (total <= LOAD_SUMMARY_INLINE_LIMIT) return '<p role="status">' + prefix + '画面・操作条件に関係する部品の共有状態: ' + esc(loadSummary.map(g => g.label + ': ' + g.entries.join(', ')).join(' / ')) + '</p>' + note;
  return '<p role="status">' + prefix + '関係する部品の共有状態（表示箇所別 ' + total + '件）</p>' +
    '<details data-state-key="load-singletons"><summary>部品の共有状態を開く</summary><ul>' + loadSummary.flatMap(g => g.entries.map(e => '<li>' + esc(g.label + ': ' + e) + '</li>')).join('') + '</ul></details>' + note;
}
async function saveScenario() {
  if (scenarioBusy) return;
  try {
    const text = await buildScenarioJson();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = scenarioFileName(); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sessionError = ''; scenarioErrorDetails = null; scenarioNotice = '操作の再生ファイルを作成しました'; loadSummary = null;
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
    const notice = '操作の再生ファイルを読み込みました（' + scenarioCounts(next) + 'を照合）', summary = summarizeLoadSingletons(next);
    SESSION = next; sessionGeneration++; nextPresentationFocus = 'current-position'; historySelection = null; historicalPreview = null; resumeConfirmation = null; historyNotice = '再生ファイルを読み込み、現在の操作位置を表示しました';
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
    '<button data-focus-key="save-scenario" onclick="saveScenario()"' + (scenarioBusy ? ' disabled' : '') + '>操作の再生ファイルを保存</button> ' +
    '<label>操作の再生ファイルを読み込む <input data-focus-key="load-scenario" type="file" accept=".scenario.json,application/json" onchange="loadScenarioFile(this)"' + (scenarioBusy ? ' disabled' : '') + '></label>' +
    '<details data-state-key="scenario-details"><summary>保存範囲・版・再開方法</summary><p>再読込すると初期状態になります。残したい試行は操作の再生ファイルに保存し、このHTMLと組にして保管してください。修正版を試すときは、検討手順を参考に新しく操作します。</p>' +
    '<p class="artifact-identity">このHTML: ' + esc(m.entryModule) + ' · model ' + esc(m.modelId.slice(0, 12)) + ' · engine ' + esc(m.engineVersion.slice(0, 12)) + '</p>' +
    '<details class="identity-details"><summary>定義と実行プログラムの版・再現用の資料</summary><p>短縮IDは対応付けの補助です。読込時は完全な識別情報で厳密に照合します。</p><pre>' + esc(JSON.stringify(identity, null, 2)) + '</pre>' +
    '<p>再開には、このHTMLと完全一致するscenarioの組を渡してください。編集・再生成やCLIでの再開には全モデル・参照moduleと対応する処理系が必要です。遷移マップの分割設定も渡すならsimconfigを添えてください。</p></details>' + stateQueryGuide() +
    '<p class="scenario-scope">保存範囲: ' + esc(scenarioCounts()) + '。条件選択はdispatchの内訳として操作来歴に表示します。破棄経路・reset前・ghost・手動試験も含む全記録を保存します。モデル本文・DOM・表示設定は含みません。読込後も現在の表示設定を使います。</p>' +
    '</details>' +
    (scenarioBusy ? '<p role="status">操作の再生ファイルを照合しています</p>' : scenarioNotice ? '<p role="status">' + esc(scenarioNotice) + '</p>' + loadSummaryHtml() : '') + '</div>';
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
  if (historySelection) {
    historicalPreview = historySelection.generation === sessionGeneration ? retainedObservation(historySelection.id) : null;
    if (!historicalPreview) { historySelection = null; resumeConfirmation = null; historyNotice = '対象が変わりました。履歴から選び直してください'; }
  }
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
  try {
    const previewId = historySelection?.id;
    const readingHistory = (app.querySelector?.('.pane-trace')?.scrollTop ?? 0) > 0;
    run(); sessionError = '';
    if (historySelection || resumeConfirmation) nextPresentationFocus = 'current-position';
    historySelection = null; historicalPreview = null; resumeConfirmation = null;
    historyNotice = previewId && !retainedObservation(previewId) ? '見ていた履歴の画面は閲覧・再開できなくなりました。記録の文章は引き続き読めます' : readingHistory ? '新しい記録1件。履歴の読取位置を保持しています' : '';
  } catch (e) {
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
function requestReset() {
  if (scenarioBusy) return;
  if (confirm('初期状態から新しく試しますか？\n今までの操作・条件・結果の文章は残りますが、過去の画面は再表示・再開できなくなります。必要なら先に保存してください。')) resetSession();
}
function resetSession() { command(() => { SESSION.reset(); sessionGeneration++; }); }
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
  const scopes = {'singleton-shared':'同じ実行内で共有する状態 (singleton)', 'frame-location':'この画面の状態', 'overlay-entry':'この独立表示の状態', 'inclusion-initial':'この配置の初期状態', 'component-test':'参照先部品の検討用の状態'};
  const origins = {initial:'定義の初期値', dsl:'定義した操作で設定', 'manual-test':'検討用に手動設定'};
  return '<span title="' + esc(v.scope + ' / ' + v.origin) + '">' + esc(scopes[v.scope]) + ' · ' + esc(origins[v.origin]) + '</span>';
}
function rootStateLabel(root) { return showStates ? '<div class="component-state-value">' + valueDescription(root) + '</div>' : ''; }
function nodeKey(node) { return node.root + ':' + node.source.module + ':' + node.source.span.offset + ':' + node.path.join('.'); }
function operationKey(op) { return op.placement.root + ':' + op.placement.path.join('.') + ':' + op.source.module + ':' + op.source.span.offset; }
const screenScroll = new Map();
function screenViewKey() { return sessionGeneration + ':' + (resumeConfirmation ? 'confirm:' + resumeConfirmation.id : historySelection ? 'preview:' + historySelection.id : 'live'); }
function capturePresentation() {
  const details = new Map([...(app.querySelectorAll?.('details[data-state-key]') ?? [])].map(el => [el.dataset.stateKey, el.open]));
  const active = document.activeElement;
  const focus = active && app.contains?.(active) ? active.getAttribute('data-focus-key') ?? active.getAttribute('onchange') : null;
  const trace = app.querySelector?.('.pane-trace'), center = app.querySelector?.('.screen-section');
  const rows = [...(app.querySelectorAll?.('[data-history-key]') ?? [])];
  const anchor = (active?.closest?.('[data-history-key]')) ?? rows.find(el => el.getBoundingClientRect().top >= (trace?.getBoundingClientRect().top ?? 0));
  const parent = anchor?.closest?.('.provenance-step');
  const key = center?.getAttribute?.('data-view-key') ?? screenViewKey();
  if (center) screenScroll.set(key, center.scrollTop);
  return { details, focus, parent: parent?.dataset.historyKey, parentOffset: parent ? parent.getBoundingClientRect().top : 0, anchor: anchor?.dataset.historyKey,
    offset: anchor ? anchor.getBoundingClientRect().top : 0,
    traceTop: trace?.scrollTop ?? 0, generation: trace?.getAttribute?.('data-generation') ?? String(sessionGeneration), key };
}
function restorePresentation(saved) {
  for (const el of app.querySelectorAll?.('details[data-state-key]') ?? []) {
    if (saved.details.has(el.dataset.stateKey)) el.open = saved.details.get(el.dataset.stateKey);
  }
  const trace = app.querySelector?.('.pane-trace'), center = app.querySelector?.('.screen-section');
  const rows = [...(app.querySelectorAll?.('[data-history-key]') ?? [])];
  const sameGeneration = saved.generation === String(sessionGeneration);
  const anchor = rows.find(el => el.dataset.historyKey === saved.anchor) ?? rows.find(el => el.dataset.historyKey === saved.parent) ?? rows[0];
  if (trace) {
    trace.scrollTop = sameGeneration ? saved.traceTop : 0;
    if (sameGeneration && saved.traceTop > 0 && anchor) trace.scrollTop += anchor.getBoundingClientRect().top - (anchor.dataset.historyKey === saved.anchor ? saved.offset : saved.parentOffset);
  }
  if (center) center.scrollTop = screenScroll.get(screenViewKey()) ?? 0;
  if (nextPresentationFocus || saved.focus) {
    const controls = [...(app.querySelectorAll?.('[data-focus-key],[onchange]') ?? [])];
    const el = controls.find(el => el.getAttribute('data-focus-key') === nextPresentationFocus && nextPresentationFocus !== null) ?? controls.find(el => (el.getAttribute('data-focus-key') ?? el.getAttribute('onchange')) === saved.focus) ?? controls.find(el => el.getAttribute('data-focus-key') === saved.parent) ?? controls.find(el=>el.getAttribute('data-focus-key') === 'current-position');
    el?.focus({preventScroll:true});
  }
  nextPresentationFocus = null;
}
syncView();


function renderRemainingWork() {
  const state = view.data.state, active = new Set(state.activePath);
  const outside = state.frames.filter(f => !active.has(f.id)).length;
  const location = v => esc(v.module + '::' + locationLabel(v));
  const values = items => items.length ? '<ul>' + items.map(v => '<li>' + location(v) + ' · ' + valueDescription(v) + '</li>').join('') + '</ul>' : '<p>なし</p>';
  return '<details class="remaining-work" data-state-key="remaining-work"><summary class="pane-title">残っている作業（画面外 ' + outside + '件）</summary>' +
    '<p>現在の操作位置に対応する全ての作業です。履歴の閲覧中も現在の状態を示します。開閉は閲覧だけで、画面移動や履歴からの再開はしません。</p>' +
    state.frames.map(f => {
      const status = f.id === state.activeFrameId ? '操作中' : active.has(f.id) ? '現在の経路' : '画面外で保持';
      const name = f.beginsSession ? (f.beginsSession.name ? '@' + f.beginsSession.name : '無名の作業区切り') : '起点';
      return '<details data-state-key="work:' + sessionGeneration + ':' + f.id + '"><summary>#' + f.id + ' · ' + esc(name) + ' · ' + status + ' · ' + location(f.stack.at(-1)) + '</summary>' +
        '<p>親: ' + (f.parentId === null ? 'なし' : '#' + f.parentId) + ' / back の境界: ' + (f.barrier ? 'あり' : 'なし') + '</p>' +
        '<p>この作業内の画面（下から上の順）</p>' + values(f.stack) + '</details>';
    }).join('') +
    '<h3>独立表示</h3><p>画面の作業とは別に残ります。exit だけでは消えず、hide で閉じます。</p>' + values(state.overlays) +
    '<h3>共有状態</h3><p>同じ実行内の全使用箇所で共有します。画面の作業を閉じても残ります。</p>' + values(state.sharedVariants) + '</details>';
}
