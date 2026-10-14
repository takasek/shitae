// Execution, gates, effective operations and snapshots belong to the bundled Session.
const SESSION = new Shitae.Session(new Map(MODEL.documents), MODEL.entryModule, new Map(MODEL.files), MODEL.metadata);
let view, stack, overlays, sharedVariants, GATE_TARGETS, timeline, cursor;
let showEvents = true, showActions = true, showStates = false, sessionError = '';
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
  const s = view.data.state;
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
  return '<span class="component-state-value"> → ' + esc(node.reference.component) + ' · ' +
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
