import type { Body, Component, Diagnostic, Document, ElementLine, Interaction, Result, Span } from '@shitae/ast';
import { effectiveResults, mergeInteractions, resolveModuleRef } from '@shitae/resolver';
import { activeFrame, activeLocation, initialState, reduce, singletonKey, type Location, type RuntimeState } from '@shitae/runtime';
import type { ComponentValue, HistoryItem, InclusionNode, InclusionRoot, ObservationView, QueryOptions, StateView, ValueOrigin, VariantValue } from './views.js';
export type * from './views.js';
import type { ModelMetadata } from './metadata.js';
import { Provenance, provenanceAvailability, pointCounts, resultLabel, type StepRecord, type ProvenanceSummary, type ProvenancePage, type ProvenanceStep, type ReviewText } from './provenance.js';
export type * from './provenance.js';
export type { ModelMetadata } from './metadata.js';
import { ScenarioJournal, ScenarioError, branchDescriptor, rawOperation, detailDescriptor, validateScenario, checkModel, scenarioEqual, scenarioDifference,
  type Scenario, type PreparedScenarioModel, type RawView, type RawCheckpoint, type ScenarioCommand } from './scenario.js';
export { ScenarioError } from './scenario.js';
export type { Scenario, ScenarioStep, ScenarioCommand, PreparedScenarioModel } from './scenario.js';

export interface Source { module: string; file: string | null; span: Span }
export interface Summary {
  location: Location;
  cursorObservationId: number;
  latestObservationId: number;
  observationCount: number;
}
export interface ResultRef { resultIndex: number; source: Source }
export interface Branch { id: string; label: string; results: ResultRef[] }
export interface Operation {
  handle: string;
  action: Interaction['action'];
  actionText: string;
  scope: 'document' | 'component' | 'variant';
  source: Source;
  placement: { root: string; path: number[]; source: Source | null };
  host: Location;
  enabled: boolean;
  gate: { kind: 'host' | 'member'; name: string; enabled: boolean; unresolved: boolean; module?: string; targetComponent?: string; value?: VariantValue } | null;
  prelude: ResultRef[];
  branches: Branch[];
}
export interface ActionItem {
  handle: string;
  actionText: string;
  scope: Operation['scope'];
  placement: Pick<Operation['placement'], 'root' | 'path'>;
  host: Location;
  enabled: boolean;
  branches: Array<Pick<Branch, 'id' | 'label'>>;
}
export interface BackControl { handle: string; kind: 'control'; source: null; enabled: boolean; reason: string | null }
export type ActionDetail = (Operation & { definition: Interaction }) | BackControl;
export interface DetailedActions {
  items: Operation[];
  controls: { back: BackControl };
}
export interface Actions {
  items: ActionItem[];
  controls: { back: Pick<BackControl, 'handle' | 'enabled'> };
}
export interface Query { revision: number; summary: Summary; data?: {
  actions?: Actions; action?: ActionDetail; state?: StateView; history?: { items: HistoryItem[]; nextAfter: number | null }; observation?: ObservationView; metadata?: ModelMetadata | null;
  provenanceSummary?: ProvenanceSummary; provenance?: ProvenancePage; provenanceStep?: ProvenanceStep; review?: ReviewText;
} }
export interface Receipt {
  operationId: number;
  changed: string[];
  observations: { count: number; firstId: number | null; lastId: number | null };
  effects: Array<ResultRef & { text: string }>;
  diagnostics: Array<ResultRef & { diagnostic: Diagnostic }>;
}
interface Entry { operation: Operation; interaction: Interaction; module: string }
interface Inventory { entries: Entry[]; actions: DetailedActions; byHandle: Map<string, Entry> }
interface Observation {
  id: number;
  operationId: number | null;
  result: ResultRef | null;
  kind: 'transition' | 'event';
  label: string;
  context: Context;
}
interface Context { runtime: RuntimeState; tests: Map<string, string>; origins: Map<string, ValueOrigin> }

export class SessionError extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`); }
}
function fail(code: string, message: string): never { throw new SessionError(code, message); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (e: ElementLine) => e.alias ?? (e.value.kind === 'ref' ? e.value.name : '{...}');

/** DOM/Node-independent execution and observation. */
export class Session {
  private readonly sessionId = globalThis.crypto.randomUUID();
  private readonly documents: Map<string, Document>;
  private readonly files: Map<string, string>;
  private readonly metadata: ModelMetadata | null;
  private context: Context;
  private cursor = -1;
  private get state() { return this.context.runtime; }
  private set state(state: RuntimeState) { this.context.runtime = state; }
  private revision = 0;
  private operationId = 0;
  private nextObservationId = 1;
  private observations: Observation[] = [];
  private currentInventory: { revision: number; context: Context; value: Inventory } | undefined;
  private journal: ScenarioJournal | undefined;
  private provenance: Provenance | undefined;
  private provenanceDraft: { record: Omit<StepRecord, 'observations' | 'discarded'>; priorIds: number[] } | undefined;

  constructor(documents: Map<string, Document>, private readonly entryModule: string, files = new Map<string, string>(), metadata: ModelMetadata | null = null) {
    this.documents = structuredClone(documents);
    this.files = new Map(files);
    this.metadata = structuredClone(metadata);
    const entry = this.documents.get(entryModule)?.components[0];
    if (!entry) fail('INVALID_MODEL', 'Entry component is missing');
    this.context = this.initialContext();
    this.observe('transition', '起動', null, null);
    if (this.metadata?.sourceBasis === 'source-bytes') {
      this.journal = new ScenarioJournal(this.metadata, this.observations[0]!.id, this.scenarioCheckpoint());
      const o = this.observations[0]!;
      this.provenance = new Provenance({ id: o.id, ref: { step: 0, observation: 0 }, resultPosition: null, ordinal: 0, kind: o.kind, label: o.label, location: this.location(o.context) });
    }
  }
  private scenarioView(context = this.context): RawView {
    const inventory = this.inventory(context);
    return { location: this.location(context), state: this.projectState(context), actions: {
      items: inventory.entries.map(e => ({ operation: rawOperation(e.operation, e.interaction),
        branches: e.operation.branches.map(branchDescriptor), enabled: e.operation.enabled, gate: e.operation.gate })),
      back: { enabled: inventory.actions.controls.back.enabled, reason: inventory.actions.controls.back.reason },
    } };
  }
  private scenarioCheckpoint(): RawCheckpoint {
    return { view: this.scenarioView(), timeline: this.observations.map((_, i) => this.historyItem(i)),
      cursor: this.observations[this.cursor]!.id };
  }
  private recordScenario(command: Parameters<ScenarioJournal['record']>[0], start: number, receipt?: Receipt) {
    if (!this.journal) return;
    const draft = this.provenanceDraft;
    if (draft) {
      const { record, priorIds } = draft;
      const observations = this.observations.filter(o => o.id >= start).map((o, observation) => {
        const result = record.results.find(r => r.observationIds.includes(o.id));
        return { id: o.id, ref: { step: record.step, observation }, resultPosition: result?.position ?? null,
          ordinal: result ? result.observationIds.indexOf(o.id) : observation, kind: o.kind, label: o.label, location: this.location(o.context) };
      });
      this.provenance!.record({ ...record, operationId: receipt?.operationId ?? null, observations,
        discarded: priorIds.filter(id => !this.observations.some(o => o.id === id)).map(id => this.provenance!.locate(id).ref) });
      this.provenanceDraft = undefined;
    }
    this.journal.record(command, this.observations.filter(o => o.id >= start).map(o => ({ id: o.id, view: this.scenarioView(o.context) })),
      this.scenarioCheckpoint(), receipt);
  }
  private beginProvenance(kind: StepRecord['kind'], actionText: string, operation?: Operation, branch: string | null = null, targetId?: number) {
    if (!this.provenance) return;
    this.provenanceDraft = { priorIds: this.observations.map(o => o.id), record: {
      step: this.provenance.steps.length + 1, kind, operationId: null, actionText, branch,
      host: structuredClone(operation?.host ?? this.location()),
      placement: operation ? { root: operation.placement.root, path: [...operation.placement.path] } : null,
      from: this.provenance.locate(this.observations[this.cursor]!.id).ref,
      target: targetId === undefined ? null : this.provenance.locate(targetId), results: [],
    } };
  }
  private retainedPoints() { return new Map(this.observations.map((o, i) => [o.id, i > this.cursor])); }
  async exportScenario(): Promise<Scenario> {
    if (!this.journal) throw new ScenarioError('SCENARIO_UNSUPPORTED', 'Source-byte model metadata is required');
    return this.journal.export(this.scenarioCheckpoint());
  }
  private initialContext(): Context {
    const entry = this.documents.get(this.entryModule)!.components[0]!;
    return { runtime: initialState({ module: this.entryModule, component: entry.name, variant: null },
      [...this.documents].flatMap(([module, doc]) => doc.components.filter((c) => c.singleton).map((c) => ({ module, name: c.name })))), tests: new Map(), origins: new Map() };
  }

  private source(module: string, span: Span): Source {
    return { module, file: this.files.get(module) ?? null, span };
  }
  private comp(module: string, name: string): Component | undefined {
    return this.documents.get(module)?.components.find((c) => c.name === name);
  }
  private normalize(module: string, ref: string | null): string {
    return ref == null ? module : resolveModuleRef(ref, this.documents.get(module)!) ?? ref;
  }
  private display(loc: Location): Location {
    const module = loc.module ?? this.entryModule;
    return { ...loc, module, variant: loc.variant ?? this.comp(module, loc.component)?.variants[0]?.name ?? null };
  }
  private location(context = this.context): Location { return this.display(activeLocation(context.runtime)); }
  private summary(): Summary {
    const last = this.observations[this.observations.length - 1]!.id;
    return { location: this.location(), cursorObservationId: this.observations[this.cursor]!.id, latestObservationId: last, observationCount: this.observations.length };
  }
  private handle(index: number | 'back') { return `${this.sessionId}:${this.revision}:${index}`; }
  private elements(loc: Location, includeDocument: boolean): ElementLine[] {
    const module = loc.module!;
    const comp = this.comp(module, loc.component);
    return [...(includeDocument ? this.documents.get(module)?.common.elements ?? [] : []),
      ...comp?.common.elements ?? [], ...comp?.variants.find((v) => v.name === loc.variant)?.body.elements ?? []];
  }
  private bodyOf(module: string, interaction: Interaction): Body {
    const doc = this.documents.get(module)!;
    if (doc.common.interactions.includes(interaction)) return doc.common;
    for (const c of doc.components) {
      if (c.common.interactions.includes(interaction)) return c.common;
      for (const v of c.variants) if (v.body.interactions.includes(interaction)) return v.body;
    }
    throw new Error('Interaction is not part of the fixed model');
  }
  private gate(module: string, interaction: Interaction, host: Location, includeDocument: boolean, context: Context): Operation['gate'] {
    const ref = interaction.action.target;
    if (!ref?.existsGated) return null;
    if (ref.member == null) {
      const unresolved = !this.comp(host.module!, host.component);
      return { kind: 'host', name: ref.name, unresolved, enabled: unresolved || this.elements(host, includeDocument).some((e) => nameOf(e) === ref.name) };
    }
    const alias = ref.module == null ? this.bodyOf(module, interaction).elements.find((e) => e.alias === ref.name) : undefined;
    if (alias?.value.kind === 'inline') {
      return { kind: 'member', name: ref.member, unresolved: false, enabled: alias.value.elements.some((e) => nameOf(e) === ref.member) };
    }
    const target = alias?.value.kind === 'ref' ? alias.value : ref;
    const targetModule = this.normalize(module, target.module);
    const comp = this.comp(targetModule, target.name);
    const value = this.value(targetModule, target.name, null, 'inclusion-initial', context);
    const loc = { module: targetModule, component: target.name, variant: value.variant };
    return { kind: 'member', name: ref.member, module: targetModule, targetComponent: target.name, value,
      unresolved: !comp, enabled: !comp || this.elements(loc, false).some((e) => nameOf(e) === ref.member) };
  }
  private indexedResults(module: string, interaction: Interaction) {
    return effectiveResults(interaction).map(({ label, result }) => ({ label, result,
      resultIndex: interaction.results.indexOf(result), source: this.source(module, result.span) }));
  }
  private targetsPlacement(module: string, interaction: Interaction, element: ElementLine): boolean {
    const target = interaction.action.target;
    if (!target || target.member == null) return false;
    // Alias identity belongs to the declaring single-body, not the flattened display.
    const alias = target.module == null ? this.bodyOf(module, interaction).elements.find((e) => e.alias === target.name) : undefined;
    if (alias) return alias === element;
    return element.value.kind === 'ref' && element.value.name === target.name &&
      this.normalize(module, element.value.module) === this.normalize(module, target.module);
  }
  private inventory(context = this.context): Inventory {
    if (context === this.context && this.currentInventory?.revision === this.revision && this.currentInventory.context === context) return this.currentInventory.value;
    const entries: Entry[] = [];
    const collect = (host: Location, root: string, path: number[], placementSource: Source | null,
      includeDocument: boolean, visited: Set<string>, overrides: Interaction[] = []) => {
      const module = host.module!;
      const key = singletonKey(module, host.component);
      if (visited.has(key)) return;
      const nextVisited = new Set(visited).add(key);
      const doc = this.documents.get(module);
      const comp = this.comp(module, host.component);
      const variant = comp?.variants.find((v) => v.name === host.variant);
      const own = mergeInteractions(comp?.common.interactions ?? [], variant?.body.interactions ?? []);
      const list = includeDocument ? mergeInteractions(doc?.common.interactions ?? [], own) : own;
      const effective = list.filter((i) => !overrides.some((o) => {
        const a = i.action, outer = o.action;
        return a.target != null && outer.target?.member === a.target.name && a.target.module == null &&
          a.target.member == null && a.target.collection === outer.target.collection &&
          a.text.replace(/\s+/g, ' ').trim() === outer.text.replace(/\s+/g, ' ').trim();
      }));
      for (const interaction of effective) {
        const resultRefs = this.indexedResults(module, interaction);
        const branches: Branch[] = [];
        for (const r of resultRefs) if (r.label != null) {
          let b = branches.find((b) => b.label === r.label);
          if (!b) { b = { id: `b${branches.length}`, label: r.label, results: [] }; branches.push(b); }
          b.results.push({ resultIndex: r.resultIndex, source: r.source });
        }
        const gate = this.gate(module, interaction, host, includeDocument, context);
        const a = interaction.action, target = a.target;
        const actionText = a.text + (target ? `(${target.collection ? '*' : ''}${target.module ? target.module + '::' : ''}${target.name}${target.member ? '.' + target.member : ''}${target.existsGated ? '?' : ''})` : '');
        entries.push({ interaction, module, operation: {
          handle: this.handle(entries.length), action: a, actionText,
          scope: doc?.common.interactions.includes(interaction) ? 'document' : variant?.body.interactions.includes(interaction) ? 'variant' : 'component',
          source: this.source(module, interaction.span), placement: { root, path, source: placementSource }, host,
          enabled: gate?.enabled ?? true, gate,
          prelude: resultRefs.filter((r) => r.label == null).map(({ resultIndex, source }) => ({ resultIndex, source })), branches,
        } });
      }
      const walkElements = (els: ElementLine[], basePath: number[]) => els.forEach((el, index) => {
        const childPath = [...basePath, index];
        if (el.value.kind === 'inline') { walkElements(el.value.elements, childPath); return; }
        const childModule = this.normalize(module, el.value.module);
        const child = this.comp(childModule, el.value.name);
        if (!child) return;
        const variant = this.value(childModule, child.name, null, 'inclusion-initial', context).variant;
        collect(this.display({ module: childModule, component: child.name, variant }), root, childPath,
          this.source(module, el.span), false, nextVisited,
          effective.filter((i) => this.targetsPlacement(module, i, el)));
      });
      walkElements(this.elements(host, includeDocument), path);
    };
    collect(this.location(context), 'main', [], null, true, new Set());
    for (const [name, overlay] of context.runtime.overlays) {
      const key = singletonKey(overlay.module, name);
      const variant = context.runtime.singletons.has(key) ? context.runtime.sharedVariants.get(key) ?? null : overlay.variant;
      collect(this.display({ module: overlay.module, component: name, variant }), `overlay:${name}`, [], null, false, new Set());
    }
    const frame = activeFrame(context.runtime);
    const enabled = frame.stack.length > 1 || (!frame.barrier && frame.parentId != null);
    const value: Inventory = { entries, byHandle: new Map(entries.map(e => [e.operation.handle, e])), actions: { items: entries.map((e) => e.operation), controls: { back: {
      handle: this.handle('back'), kind: 'control', source: null, enabled,
      reason: enabled ? null : frame.barrier ? 'barrier' : 'no-return-location',
    } } } };
    if (context === this.context) this.currentInventory = { revision: this.revision, context, value };
    return value;
  }

  private actionDetail(handle: string): ActionDetail {
    if (!handle.startsWith(this.sessionId + ':')) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    const parts = handle.split(':');
    if (!/^\d+$/.test(parts[1] ?? '') || parts.length !== 3 || (parts[2] !== 'back' && !/^\d+$/.test(parts[2] ?? ''))) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    if (Number(parts[1]) !== this.revision) fail('STALE_HANDLE', 'Query actions again');
    const { byHandle, actions } = this.inventory();
    if (handle === actions.controls.back.handle) return actions.controls.back;
    const entry = byHandle.get(handle);
    if (!entry) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    return { ...entry.operation, definition: entry.interaction };
  }

  query(options: QueryOptions = {}): Query {
    const select = options.select ?? [];
    if (!Array.isArray(select) || select.some((s) => !['actions', 'action', 'state', 'history', 'observation', 'metadata', 'provenanceSummary', 'provenance', 'provenanceStep', 'review'].includes(s)) || new Set(select).size !== select.length ||
      Object.keys(options).some((k) => !['select', 'history', 'observationId', 'handle', 'provenance', 'step'].includes(k)) ||
      (options.provenance !== undefined && !select.includes('provenance')) ||
      (select.includes('provenanceStep') ? !Number.isSafeInteger(options.step) || options.step! < 1 : options.step !== undefined) ||
      (options.history !== undefined && !select.includes('history')) || (options.observationId !== undefined && !select.includes('observation')) ||
      (select.includes('action') ? typeof options.handle !== 'string' : options.handle !== undefined)) {
      fail('INVALID_REQUEST', 'Invalid query selection/options');
    }
    const data: NonNullable<Query['data']> = {};
    for (const s of select) {
      if (s === 'provenanceSummary') data.provenanceSummary = this.provenance?.summary(this.retainedPoints(), this.summary().cursorObservationId) ?? {
        ...provenanceAvailability(false), steps: { dispatch: 0, seek: 0, reset: 0, setTestVariant: 0 }, resultCount: 0, observations: pointCounts(), cursor: null,
      };
      if (s === 'provenance') {
        const p = options.provenance === undefined ? {} : options.provenance, total = this.provenance?.steps.length ?? 0;
        if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => !['after', 'limit'].includes(k)) ||
          (p.after !== undefined && (!Number.isSafeInteger(p.after) || p.after < 0 || p.after > total)) ||
          (p.limit !== undefined && (!Number.isSafeInteger(p.limit) || p.limit < 1 || p.limit > 100))) fail('INVALID_REQUEST', 'Invalid provenance page');
        const after = p.after ?? 0, end = Math.min(total, after + (p.limit ?? 20));
        data.provenance = { ...provenanceAvailability(!!this.provenance), items: Array.from({ length: end - after }, (_, i) => this.provenance!.item(after + i + 1, this.retainedPoints(), this.summary().cursorObservationId)), nextAfter: end < total ? end : null };
      }
      if (s === 'provenanceStep') {
        if (!this.provenance) fail('SCENARIO_UNSUPPORTED', 'Source-byte model metadata is required');
        if (options.step! > this.provenance.steps.length) fail('INVALID_REQUEST', 'Unknown provenance step');
        data.provenanceStep = this.provenance.detail(options.step!, this.retainedPoints(), this.summary().cursorObservationId);
      }
      if (s === 'review') data.review = this.provenance?.review(this.retainedPoints(), this.summary().cursorObservationId) ?? { ...provenanceAvailability(false), text: '' };
      if (s === 'metadata') data.metadata = this.metadata;
      if (s === 'actions') {
        const { actions } = this.inventory();
        data.actions = { items: actions.items.map(({ handle, actionText, scope, placement, host, enabled, branches }) => ({
          handle, actionText, scope, placement: { root: placement.root, path: placement.path }, host, enabled,
          branches: branches.map(({ id, label }) => ({ id, label })),
        })), controls: { back: { handle: actions.controls.back.handle, enabled: actions.controls.back.enabled } } };
      }
      if (s === 'action') data.action = this.actionDetail(options.handle!);
      if (s === 'state') data.state = this.projectState(this.context);
      if (s === 'history') data.history = this.historyPage(options.history);
      if (s === 'observation') {
        const index = this.observationIndex(options.observationId);
        const observation = this.observations[index]!;
        const actions = this.inventory(observation.context).actions;
        data.observation = { ...this.historyItem(index), view: { location: this.location(observation.context),
          state: this.projectState(observation.context), actions: {
            items: actions.items.map(({ handle, ...a }) => a),
            controls: { back: (({ handle, ...back }) => back)(actions.controls.back) },
          } } };
      }
    }
    return structuredClone({ revision: this.revision, summary: this.summary(), ...(select.length ? { data } : {}) });
  }

  private observe(kind: Observation['kind'], label: string, operationId: number | null, result: ResultRef | null) {
    this.observations = this.observations.slice(0, this.cursor + 1);
    this.observations.push({ id: this.nextObservationId++, operationId, result, kind, label, context: structuredClone(this.context) });
    this.cursor = this.observations.length - 1;
    const draft = this.provenanceDraft?.record;
    if (draft?.kind === 'dispatch') draft.results.at(-1)?.observationIds.push(this.observations[this.cursor]!.id);
  }
  private comparable() {
    return { frames: { frames: this.state.frames, activeFrameId: this.state.activeFrameId, nextFrameId: this.state.nextFrameId },
      overlays: [...this.state.overlays], sharedVariants: [...this.state.sharedVariants], testVariants: [...this.context.tests], origins: [...this.context.origins] };
  }
  private value(module: string, component: string, storedVariant: string | null, scope: VariantValue['scope'], context: Context): VariantValue {
    const key = singletonKey(module, component);
    const singleton = context.runtime.singletons.has(key);
    let variant = storedVariant;
    let origin: ValueOrigin = storedVariant == null ? 'initial' : 'dsl';
    if (singleton) {
      variant = context.runtime.sharedVariants.get(key) ?? null;
      scope = 'singleton-shared';
      origin = context.origins.get(key) ?? (context.runtime.sharedVariants.has(key) ? 'dsl' : 'initial');
    } else if (scope === 'inclusion-initial' && context.tests.has(key)) {
      variant = context.tests.get(key)!; scope = 'component-test'; origin = 'manual-test';
    }
    return { variant: variant ?? this.comp(module, component)?.variants[0]?.name ?? null, singleton, scope, origin };
  }
  private allComponentValues(context: Context): ComponentValue[] {
    return [...this.documents].flatMap(([module, doc]) => doc.components.map((c) => ({ module, component: c.name,
      ...this.value(module, c.name, null, 'inclusion-initial', context) })));
  }
  private gateTargets(context = this.context): Array<ComponentValue & { variants: string[] }> {
    const keys = new Set<string>();
    for (const [module, doc] of this.documents) {
      const bodies = [doc.common, ...doc.components.flatMap((c) => [c.common, ...c.variants.map((v) => v.body)])];
      for (const body of bodies) for (const i of body.interactions) {
        const t = i.action.target;
        if (!t?.existsGated || t.member == null) continue;
        const alias = t.module == null ? body.elements.find((e) => e.alias === t.name) : undefined;
        if (alias?.value.kind === 'inline') continue;
        const ref = alias?.value.kind === 'ref' ? alias.value : t;
        const mod = this.normalize(module, ref.module);
        if (this.comp(mod, ref.name)) keys.add(singletonKey(mod, ref.name));
      }
    }
    return this.allComponentValues(context).filter((c) => keys.has(singletonKey(c.module, c.component))).map((c) => ({ ...c, variants: this.comp(c.module, c.component)!.variants.map((v) => v.name) }));
  }
  private projectState(context: Context): StateView {
    const rt = context.runtime;
    const frames = rt.frames.map((f) => ({ ...f, stack: f.stack.map((loc) => ({ module: loc.module!, component: loc.component,
      ...this.value(loc.module!, loc.component, loc.variant, 'frame-location', context) })) }));
    const activePath: number[] = [];
    for (let id: number | null = rt.activeFrameId; id != null;) {
      activePath.unshift(id); id = rt.frames.find((f) => f.id === id)!.parentId;
    }
    const overlays = [...rt.overlays].map(([component, o]) => ({ module: o.module!, component,
      ...this.value(o.module!, component, o.variant, 'overlay-entry', context) }));
    const root = (loc: Location, root: string, scope: VariantValue['scope']): InclusionRoot => ({
      module: loc.module!, component: loc.component, root,
      ...this.value(loc.module!, loc.component, loc.variant, scope, context),
      source: this.comp(loc.module!, loc.component) ? this.source(loc.module!, this.comp(loc.module!, loc.component)!.span) : null,
      children: nodes(this.elements({ ...loc, variant: this.value(loc.module!, loc.component, loc.variant, scope, context).variant }, root === 'main'), loc.module!, root, [], new Set([singletonKey(loc.module, loc.component)])),
    });
    const nodes = (elements: ElementLine[], module: string, root: string, base: number[], seen: Set<string>): InclusionNode[] => elements.map((el, i) => {
      const path = [...base, i];
      const node = { name: nameOf(el), root, path, source: this.source(module, el.span), collection: el.collection };
      if (el.value.kind === 'inline') return { ...node, kind: 'inline', children: nodes(el.value.elements, module, root, path, seen) };
      const mod = this.normalize(module, el.value.module), comp = this.comp(mod, el.value.name);
      const reference = { module: mod, component: el.value.name };
      if (!comp) return { ...node, reference, kind: 'unresolved', children: [] };
      const key = singletonKey(mod, comp.name), cycle = seen.has(key);
      const value = this.value(mod, comp.name, null, 'inclusion-initial', context);
      return { ...node, reference, kind: 'component', value, componentSource: this.source(mod, comp.span),
        ...(cycle ? { cycle: true } : {}), children: cycle ? [] : nodes(this.elements({ module: mod, component: comp.name, variant: value.variant }, false), mod, root, path, new Set(seen).add(key)) };
    });
    const all = this.allComponentValues(context);
    return { frames, activeFrameId: rt.activeFrameId, nextFrameId: rt.nextFrameId, activePath, overlays,
      sharedVariants: all.filter((c) => c.singleton), testVariants: all.filter((c) => c.scope === 'component-test'), componentValues: all,
      gateTargets: this.gateTargets(context), inclusion: { main: root(activeLocation(rt), 'main', 'frame-location'),
        overlays: [...rt.overlays].map(([component, o]) => root({ module: o.module, component, variant: o.variant }, `overlay:${component}`, 'overlay-entry')) } };
  }
  private observationIndex(id: number | undefined): number {
    if (!Number.isSafeInteger(id) || id! < 1) fail('INVALID_REQUEST', 'observationId must be a positive integer');
    const index = this.observations.findIndex((o) => o.id === id);
    if (index < 0) fail('UNKNOWN_OBSERVATION', 'Observation is not retained');
    return index;
  }
  private historyItem(index: number): HistoryItem {
    const o = this.observations[index]!;
    return { id: o.id, operationId: o.operationId, resultIndex: o.result?.resultIndex ?? null, source: o.result?.source ?? null,
      kind: o.kind, label: o.label, location: this.location(o.context), ghost: index > this.cursor };
  }
  private historyPage(options: QueryOptions['history'] = {}) {
    if (options == null || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some((k) => !['after', 'limit', 'operationId'].includes(k))) fail('INVALID_REQUEST', 'Invalid history options');
    const limit = options.limit === undefined ? 20 : options.limit;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (options.operationId !== undefined && (!Number.isSafeInteger(options.operationId) || options.operationId < 1))) fail('INVALID_REQUEST', 'Invalid history limit/operationId');
    const start = options.after === undefined ? -1 : this.observationIndex(options.after);
    if (start >= 0 && options.operationId !== undefined && this.observations[start]!.operationId !== options.operationId) fail('INVALID_REQUEST', 'after belongs to another operation');
    const filtered = this.observations.map((_, i) => i).filter((i) => i > start && (options.operationId === undefined || this.observations[i]!.operationId === options.operationId));
    const items = filtered.slice(0, limit).map((i) => this.historyItem(i));
    return { items, nextAfter: filtered.length > limit ? items.at(-1)!.id : null };
  }
  seek(observationId: number): Query {
    const index = this.observationIndex(observationId);
    this.beginProvenance('seek', '巻戻し/やり直し', undefined, null, observationId);
    const target = this.journal?.ref(observationId);
    this.context = structuredClone(this.observations[index]!.context); this.cursor = index; this.revision++;
    if (target) this.recordScenario({ kind: 'seek', target }, this.nextObservationId);
    return this.query();
  }
  reset(): Query {
    this.beginProvenance('reset', '初期状態へ');
    const start = this.nextObservationId;
    this.context = this.initialContext(); this.observations = []; this.cursor = -1; this.revision++;
    this.observe('transition', '起動', null, null);
    this.recordScenario({ kind: 'reset' }, start);
    return this.query();
  }
  setTestVariant(request: { module: string; component: string; variant: string }): Query & { receipt: Receipt } {
    const target = this.gateTargets().find((c) => c.module === request.module && c.component === request.component);
    if (!target || !target.variants.includes(request.variant)) fail('INVALID_REQUEST', 'Unknown trial target or variant');
    this.beginProvenance('setTestVariant', `手動試験 ${request.module}::${request.component}##${request.variant}`);
    const start = this.nextObservationId;
    const before = this.comparable(); const operationId = ++this.operationId;
    const key = singletonKey(request.module, request.component);
    if (target.singleton) {
      const values = new Map(this.state.sharedVariants).set(key, request.variant);
      this.state = { ...this.state, sharedVariants: values }; this.context.origins.set(key, 'manual-test');
    } else { this.context.tests.set(key, request.variant); }
    this.observe('event', `manual-test(${request.component}##${request.variant})`, operationId, null);
    this.revision++;
    const after = this.comparable();
    const receipt: Receipt = { operationId, changed: (Object.keys(before) as Array<keyof typeof before>).filter((k) => !same(before[k], after[k])),
      observations: { count: 1, firstId: this.observations[this.cursor]!.id, lastId: this.observations[this.cursor]!.id }, effects: [], diagnostics: [] };
    this.recordScenario({ kind: 'setTestVariant', module: request.module, component: request.component, variant: request.variant }, start, receipt);
    return { ...this.query(), receipt };
  }
  private markDslOrigin(body: Exclude<Result['body'], { kind: 'effect' }>, module: string) {
    let target: Location | null = null;
    if (body.kind === 'state' || (body.kind === 'overlay' && body.verb === 'show' && body.target.variant != null)) {
      target = { module: this.normalize(module, body.target.module), component: body.target.name, variant: body.target.variant ?? null };
    } else if (body.kind === 'transition' && body.target && ['push', 'present', 'goto', 'switch'].includes(body.word)) {
      target = body.target.kind === 'variant' ? { ...activeLocation(this.state), variant: body.target.name } : {
        module: this.normalize(module, body.target.module), component: body.target.name, variant: body.target.variant };
    }
    if (target?.variant != null && this.state.singletons.has(singletonKey(target.module, target.component))) this.context.origins.set(singletonKey(target.module, target.component), 'dsl');
  }
  private normalizeResult(body: Exclude<Result['body'], { kind: 'effect' }>, module: string) {
    if (body.kind === 'transition') {
      return { ...body, target: body.target?.kind === 'component' ? {
        ...body.target, module: this.normalize(module, body.target.module),
      } : body.target };
    }
    if (body.kind === 'state') return { ...body, target: { ...body.target, module: this.normalize(module, body.target.module) } };
    return { ...body, target: { ...body.target, module: this.normalize(module, body.target.module) } };
  }
  dispatch(request: { handle: string; branch?: string }): Query & { receipt: Receipt } {
    if (typeof request.handle !== 'string' || !request.handle.startsWith(this.sessionId + ':')) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    const parts = request.handle.split(':');
    if (!/^\d+$/.test(parts[1] ?? '') || parts.length !== 3 || (parts[2] !== 'back' && !/^\d+$/.test(parts[2] ?? ''))) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    if (Number(parts[1]) !== this.revision) fail('STALE_HANDLE', 'Query actions again');
    const { entries, actions } = this.inventory();
    const back = request.handle === actions.controls.back.handle;
    const entry = entries.find((e) => e.operation.handle === request.handle);
    if (!entry && !back) fail('UNKNOWN_HANDLE', 'Unknown operation handle');
    const enabled = back ? actions.controls.back.enabled : entry!.operation.enabled;
    if (!enabled) fail('DISABLED_ACTION', 'Operation is disabled');
    const branches = back ? [] : entry!.operation.branches;
    if (branches.length && request.branch === undefined) fail('BRANCH_REQUIRED', 'Select a branch from the action query');
    const branch = branches.find((b) => b.id === request.branch);
    if (request.branch !== undefined && !branch) fail('INVALID_BRANCH', 'Unknown branch for this operation');
    this.beginProvenance('dispatch', back ? '組込み back' : entry!.operation.actionText, entry?.operation, branch?.label ?? null);
    const before = this.comparable();
    const observationStart = this.nextObservationId;
    const operationId = ++this.operationId;
    const receipt: Receipt = { operationId, changed: [], observations: { count: 0, firstId: null, lastId: null }, effects: [], diagnostics: [] };
    const results = back ? [{ result: { body: { kind: 'transition', word: 'back', target: null, session: null,
      span: { offset: 0, length: 0, line: 0, col: 0 } } } as Result, resultIndex: 0, source: null, label: null }]
      : this.indexedResults(entry!.module, entry!.interaction).filter((r) => r.label == null || r.label === branch?.label);
    for (const r of results) {
      const body = r.result.body;
      if (this.provenanceDraft) {
        const list = this.provenanceDraft.record.results;
        list.push({ position: list.length, resultIndex: r.resultIndex, source: r.source, label: resultLabel(body), observationIds: [] });
      }
      const ref = r.source == null ? null : { resultIndex: r.resultIndex, source: r.source };
      if (body.kind === 'effect') {
        receipt.effects.push({ ...ref!, text: body.text });
        this.observe('event', `effect: ${body.text}`, operationId, ref);
        continue;
      }
      const prior = this.comparable();
      const result = reduce(this.state, this.normalizeResult(body, entry?.module ?? this.location().module!));
      this.markDslOrigin(body, entry?.module ?? this.location().module!);
      this.state = result.state;
      const changed = !same(prior, this.comparable());
      if (changed || body.kind !== 'transition') {
        const destination = this.location();
        const label = body.kind === 'transition'
          ? `${body.word} → ${destination.component}${destination.variant ? ` / ${destination.variant}` : ''}`
          : `${body.verb}(${body.target.name})`;
        this.observe(body.kind === 'transition' ? 'transition' : 'event', label, operationId, ref);
      }
      for (const diagnostic of result.diagnostics) {
        if (ref) receipt.diagnostics.push({ ...ref, diagnostic });
        this.observe('event', `${diagnostic.code}: ${diagnostic.message}`, operationId, ref);
      }
    }
    const after = this.comparable();
    receipt.changed = (Object.keys(before) as Array<keyof typeof before>).filter((key) => !same(before[key], after[key]));
    const added = this.observations.filter((o) => o.id >= observationStart);
    receipt.observations = { count: added.length, firstId: added[0]?.id ?? null, lastId: added[added.length - 1]?.id ?? null };
    this.revision++;
    this.recordScenario({ kind: 'dispatch', operation: back ? { kind: 'control', name: 'back' } : rawOperation(entry!.operation, entry!.interaction),
      branch: branch ? branchDescriptor(branch) : null }, observationStart, receipt);
    return structuredClone({ revision: this.revision, summary: this.summary(), receipt });
  }
}

/** Replay into a private new Session. No caller-owned Session is mutated or exposed on failure. */
export async function replayScenario(prepared: PreparedScenarioModel, value: unknown): Promise<Session> {
  const saved = validateScenario(value);
  checkModel(prepared, saved);
  const session = new Session(prepared.documents, prepared.entryModule, prepared.files, prepared.metadata);
  const initial = await session.exportScenario();
  if (initial.initialDigest !== saved.initialDigest) throw new ScenarioError('SCENARIO_RESULT_MISMATCH', `Initial digest expected ${saved.initialDigest}; actual ${initial.initialDigest}`, 0);
  const observations = new Map<string, number>([[JSON.stringify({ step: 0, observation: 0 }), session.query().summary.cursorObservationId]]);
  for (const step of saved.steps) {
    const command: ScenarioCommand = step.command;
    const priorIds = new Set<number>();
    let after: number | undefined;
    do {
      const page = session.query({ select: ['history'], history: { limit: 100, ...(after === undefined ? {} : { after }) } }).data!.history!;
      page.items.forEach(o => priorIds.add(o.id)); after = page.nextAfter ?? undefined;
    } while (after !== undefined);
    try {
      if (command.kind === 'dispatch') {
        const actions = session.query({ select: ['actions'] }).data!.actions!;
        const details = [...actions.items.map(a => a.handle), actions.controls.back.handle].map(handle => session.query({ select: ['action'], handle }).data!.action!);
        const matches = [];
        for (const detail of details) if (scenarioEqual(await detailDescriptor(detail), command.operation)) matches.push(detail);
        if (matches.length !== 1) throw new ScenarioError('ACTION_MISMATCH', `Expected one candidate; actual ${matches.length}`, step.step);
        const detail = matches[0]!;
        if (!detail.enabled) throw new ScenarioError('DISABLED_ACTION', 'Saved operation is disabled', step.step);
        const branches = 'branches' in detail ? detail.branches : [];
        const branch = command.branch === null ? undefined : branches.find(b => scenarioEqual(branchDescriptor(b), command.branch));
        if ((branches.length > 0 && !branch) || (command.branch !== null && !branch)) throw new ScenarioError('BRANCH_MISMATCH', 'Saved branch does not match', step.step);
        session.dispatch({ handle: detail.handle, ...(branch ? { branch: branch.id } : {}) });
      } else if (command.kind === 'setTestVariant') session.setTestVariant(command);
      else if (command.kind === 'reset') session.reset();
      else {
        const id = observations.get(JSON.stringify(command.target));
        if (command.target.step >= step.step || id === undefined || !priorIds.has(id)) throw new ScenarioError('SCENARIO_REFERENCE', 'Observation is forward, absent or no longer retained', step.step);
        session.seek(id);
      }
    } catch (e) {
      if (e instanceof ScenarioError) throw e;
      if (e instanceof SessionError) throw new ScenarioError(e.code, e.message, step.step);
      throw e;
    }
    // Map newly generated observations in actual timeline order, not by resultIndex.
    let cursor: number | undefined, ordinal = 0;
    do {
      const page = session.query({ select: ['history'], history: { limit: 100, ...(cursor === undefined ? {} : { after: cursor }) } }).data!.history!;
      for (const item of page.items) if (!priorIds.has(item.id)) observations.set(JSON.stringify({ step: step.step, observation: ordinal++ }), item.id);
      cursor = page.nextAfter ?? undefined;
    } while (cursor !== undefined);
    const actual = (await session.exportScenario()).steps.at(-1)!;
    const difference = scenarioDifference(step, actual);
    if (difference) throw new ScenarioError('SCENARIO_RESULT_MISMATCH', difference, step.step);
  }
  const actual = await session.exportScenario();
  const difference = scenarioDifference(saved.final, actual.final, 'final');
  if (difference) throw new ScenarioError('SCENARIO_FINAL_MISMATCH', difference, saved.steps.length);
  return session;
}
