import type { Body, Component, Diagnostic, Document, ElementLine, Interaction, Result, Span } from '@shitae/ast';
import { effectiveResults, mergeInteractions, resolveModuleRef } from '@shitae/resolver';
import { activeFrame, activeLocation, initialState, reduce, singletonKey, type Location, type RuntimeState } from '@shitae/runtime';

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
  gate: { kind: 'host' | 'member'; enabled: boolean; unresolved: boolean } | null;
  prelude: ResultRef[];
  branches: Branch[];
}
export interface Actions {
  items: Operation[];
  controls: { back: { handle: string; kind: 'control'; source: null; enabled: boolean; reason: string | null } };
}
export interface Query { revision: number; summary: Summary; data?: { actions: Actions } }
export interface Receipt {
  operationId: number;
  changed: string[];
  observations: { count: number; firstId: number | null; lastId: number | null };
  effects: Array<ResultRef & { text: string }>;
  diagnostics: Array<ResultRef & { diagnostic: Diagnostic }>;
}
interface Entry { operation: Operation; interaction: Interaction; module: string }
interface Observation {
  id: number;
  operationId: number | null;
  result: ResultRef | null;
  kind: 'transition' | 'event';
  label: string;
  state: RuntimeState;
}

export class SessionError extends Error {
  constructor(public readonly code: string, message: string) { super(`${code}: ${message}`); }
}
function fail(code: string, message: string): never { throw new SessionError(code, message); }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (e: ElementLine) => e.alias ?? (e.value.kind === 'ref' ? e.value.name : '{...}');

/** DOM/Node-independent execution. This first slice exposes summary/actions/dispatch.
 * Detailed queries, manual trials and seek will be connected in subsequent slices. */
export class Session {
  private readonly sessionId = globalThis.crypto.randomUUID();
  private readonly documents: Map<string, Document>;
  private readonly files: Map<string, string>;
  private state: RuntimeState;
  private revision = 0;
  private operationId = 0;
  private nextObservationId = 1;
  private observations: Observation[] = [];

  constructor(documents: Map<string, Document>, private readonly entryModule: string, files = new Map<string, string>()) {
    this.documents = structuredClone(documents);
    this.files = new Map(files);
    const entry = this.documents.get(entryModule)?.components[0];
    if (!entry) fail('INVALID_MODEL', 'Entry component is missing');
    this.state = initialState({ module: entryModule, component: entry.name, variant: null },
      [...this.documents].flatMap(([module, doc]) => doc.components.filter((c) => c.singleton).map((c) => ({ module, name: c.name }))));
    this.observe('transition', '起動', null, null);
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
  private location(): Location { return this.display(activeLocation(this.state)); }
  private summary(): Summary {
    const last = this.observations[this.observations.length - 1]!.id;
    return { location: this.location(), cursorObservationId: last, latestObservationId: last, observationCount: this.observations.length };
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
  private gate(module: string, interaction: Interaction, host: Location, includeDocument: boolean): Operation['gate'] {
    const ref = interaction.action.target;
    if (!ref?.existsGated) return null;
    if (ref.member == null) {
      const unresolved = !this.comp(host.module!, host.component);
      return { kind: 'host', unresolved, enabled: unresolved || this.elements(host, includeDocument).some((e) => nameOf(e) === ref.name) };
    }
    const alias = ref.module == null ? this.bodyOf(module, interaction).elements.find((e) => e.alias === ref.name) : undefined;
    if (alias?.value.kind === 'inline') {
      return { kind: 'member', unresolved: false, enabled: alias.value.elements.some((e) => nameOf(e) === ref.member) };
    }
    const target = alias?.value.kind === 'ref' ? alias.value : ref;
    const targetModule = this.normalize(module, target.module);
    const comp = this.comp(targetModule, target.name);
    const variant = comp?.singleton ? this.state.sharedVariants.get(singletonKey(targetModule, target.name)) ?? null : null;
    const loc = this.display({ module: targetModule, component: target.name, variant });
    return { kind: 'member', unresolved: !comp, enabled: !comp || this.elements(loc, false).some((e) => nameOf(e) === ref.member) };
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
  private inventory(): { entries: Entry[]; actions: Actions } {
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
        const gate = this.gate(module, interaction, host, includeDocument);
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
        const variant = child.singleton ? this.state.sharedVariants.get(singletonKey(childModule, child.name)) ?? null : null;
        collect(this.display({ module: childModule, component: child.name, variant }), root, childPath,
          this.source(module, el.span), false, nextVisited,
          effective.filter((i) => this.targetsPlacement(module, i, el)));
      });
      walkElements(this.elements(host, includeDocument), path);
    };
    collect(this.location(), 'main', [], null, true, new Set());
    for (const [name, overlay] of this.state.overlays) {
      const key = singletonKey(overlay.module, name);
      const variant = this.state.singletons.has(key) ? this.state.sharedVariants.get(key) ?? null : overlay.variant;
      collect(this.display({ module: overlay.module, component: name, variant }), `overlay:${name}`, [], null, false, new Set());
    }
    const frame = activeFrame(this.state);
    const enabled = frame.stack.length > 1 || (!frame.barrier && frame.parentId != null);
    return { entries, actions: { items: entries.map((e) => e.operation), controls: { back: {
      handle: this.handle('back'), kind: 'control', source: null, enabled,
      reason: enabled ? null : frame.barrier ? 'barrier' : 'no-return-location',
    } } } };
  }

  query(options: { select?: string[] } = {}): Query {
    const select = options.select ?? [];
    if (!Array.isArray(select) || select.some((s) => s !== 'actions') || new Set(select).size !== select.length) {
      fail('INVALID_REQUEST', 'This slice supports only summary and select:["actions"]');
    }
    return structuredClone({ revision: this.revision, summary: this.summary(),
      ...(select.length ? { data: { actions: this.inventory().actions } } : {}) });
  }

  private observe(kind: Observation['kind'], label: string, operationId: number | null, result: ResultRef | null) {
    this.observations.push({ id: this.nextObservationId++, operationId, result, kind, label, state: structuredClone(this.state) });
  }
  private comparable() {
    return { frames: { frames: this.state.frames, activeFrameId: this.state.activeFrameId, nextFrameId: this.state.nextFrameId },
      overlays: [...this.state.overlays], sharedVariants: [...this.state.sharedVariants] };
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
    const before = this.comparable();
    const observationStart = this.observations.length;
    const operationId = ++this.operationId;
    const receipt: Receipt = { operationId, changed: [], observations: { count: 0, firstId: null, lastId: null }, effects: [], diagnostics: [] };
    const results = back ? [{ result: { body: { kind: 'transition', word: 'back', target: null, session: null,
      span: { offset: 0, length: 0, line: 0, col: 0 } } } as Result, resultIndex: 0, source: null, label: null }]
      : this.indexedResults(entry!.module, entry!.interaction).filter((r) => r.label == null || r.label === branch?.label);
    for (const r of results) {
      const body = r.result.body;
      const ref = r.source == null ? null : { resultIndex: r.resultIndex, source: r.source };
      if (body.kind === 'effect') {
        receipt.effects.push({ ...ref!, text: body.text });
        this.observe('event', `effect: ${body.text}`, operationId, ref);
        continue;
      }
      const prior = this.comparable();
      const result = reduce(this.state, this.normalizeResult(body, entry?.module ?? this.location().module!));
      this.state = result.state;
      const changed = !same(prior, this.comparable());
      if (changed || body.kind !== 'transition') {
        const label = body.kind === 'transition' ? `${body.word} → ${this.location().component}` : `${body.verb}(${body.target.name})`;
        this.observe(body.kind === 'transition' ? 'transition' : 'event', label, operationId, ref);
      }
      for (const diagnostic of result.diagnostics) {
        if (ref) receipt.diagnostics.push({ ...ref, diagnostic });
        this.observe('event', `${diagnostic.code}: ${diagnostic.message}`, operationId, ref);
      }
    }
    const after = this.comparable();
    receipt.changed = (Object.keys(before) as Array<keyof typeof before>).filter((key) => !same(before[key], after[key]));
    const added = this.observations.slice(observationStart);
    receipt.observations = { count: added.length, firstId: added[0]?.id ?? null, lastId: added[added.length - 1]?.id ?? null };
    this.revision++;
    return structuredClone({ revision: this.revision, summary: this.summary(), receipt });
  }
}
