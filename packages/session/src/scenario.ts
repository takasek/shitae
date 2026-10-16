import type { Document, Interaction } from '@shitae/ast';
import type { ActionDetail, Operation, Receipt, Source } from './index.js';
import type { ModelMetadata } from './metadata.js';
import type { StateView, HistoryItem } from './views.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type PortableSource = Omit<Source, 'file'>;
type Result = { resultIndex: number; source: PortableSource };
type Branch = { label: string; results: Result[] };
type InteractionDescriptor = {
  kind: 'interaction'; scope: Operation['scope']; host: Operation['host'];
  placement: { root: string; path: number[]; source: PortableSource | null };
  source: PortableSource; definitionDigest: string;
};
type Descriptor = InteractionDescriptor | { kind: 'control'; name: 'back' };
type RawOperation = Omit<InteractionDescriptor, 'definitionDigest'> & { definition: Interaction };
export type ScenarioCommand =
  | { kind: 'dispatch'; operation: Descriptor; branch: Branch | null }
  | { kind: 'setTestVariant'; module: string; component: string; variant: string }
  | { kind: 'reset' }
  | { kind: 'seek'; target: ObservationRef };
type RawCommand = Exclude<ScenarioCommand, { kind: 'dispatch' }> | { kind: 'dispatch'; operation: RawOperation | Descriptor; branch: Branch | null };
export interface ObservationRef { step: number; observation: number }
type Output = { effects: Array<Result & { text: string }>; diagnostics: Array<Result & { diagnostic: Receipt['diagnostics'][number]['diagnostic'] }>; changed: string[] } | null;
export interface ScenarioStep {
  step: number; command: ScenarioCommand; afterDigest: string;
  observations: Array<{ viewDigest: string }>; output: Output; outputDigest: string;
}
type PortableModel = Omit<ModelMetadata, 'manifest'> & { manifest: Array<{ module: string; sourceSha256: string }> };
export interface Scenario {
  format: 'shitae-scenario'; formatVersion: 1; protocolVersion: 1;
  model: PortableModel; initialDigest: string; steps: ScenarioStep[];
  final: { view: Json; digest: string };
}
export interface PreparedScenarioModel {
  documents: Map<string, Document>; entryModule: string; files?: Map<string, string>; metadata: ModelMetadata | null;
}
/** Read-only diagnostic data; never persisted in the scenario or digest projection. */
export interface IdentityDiagnostic {
  reasons: string[]; nextActions: string[]; modelChecked: boolean;
  expected: PortableModel; actual: PortableModel;
}
export class ScenarioError extends Error {
  constructor(public readonly code: string, message: string, public readonly step: number | null = null,
    public readonly diagnostic?: IdentityDiagnostic) {
    super(`${code}${step === null ? '' : ` at step ${step}`}: ${message}`);
  }
}
function fail(code: string, message: string, step: number | null = null): never { throw new ScenarioError(code, message, step); }

/** No locale, filesystem paths, Session IDs or JS object enumeration order enter hashes. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object' && (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(Object.getPrototypeOf(value)) === null)) {
    const o = value as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
  }
  return fail('SCENARIO_FORMAT', 'Expected finite JSON values');
}
async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hashed = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hashed)].map(n => n.toString(16).padStart(2, '0')).join('');
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const source = (s: Source | null): PortableSource | null => s === null ? null : { module: s.module, span: { ...s.span } };
export const branchDescriptor = (b: Operation['branches'][number]): Branch => ({ label: b.label,
  results: b.results.map(r => ({ resultIndex: r.resultIndex, source: source(r.source)! })) });
export function rawOperation(op: Operation, definition: Interaction): RawOperation {
  return { kind: 'interaction', scope: op.scope, host: { ...op.host }, source: source(op.source)!,
    placement: { root: op.placement.root, path: [...op.placement.path], source: source(op.placement.source) }, definition };
}
const definitions = new WeakMap<Interaction, Promise<string>>();
async function describe(op: RawOperation | Descriptor): Promise<Descriptor> {
  if (!('definition' in op)) return op;
  const { definition, ...rest } = op;
  let hash = definitions.get(definition);
  if (!hash) { hash = digest({ action: definition.action, results: definition.results }); definitions.set(definition, hash); }
  return { ...rest, definitionDigest: await hash };
}
export async function detailDescriptor(detail: ActionDetail): Promise<Descriptor> {
  return 'definition' in detail ? describe(rawOperation(detail, detail.definition)) : { kind: 'control', name: 'back' };
}
// Only Source objects lose file. Other fields (e.g. effect text) are preserved verbatim.
function portable(value: unknown): Json {
  if (Array.isArray(value)) return value.map(portable);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(o).filter(([k]) => !(k === 'file' && 'module' in o && 'span' in o))
      .map(([k, v]) => [k, portable(v)]));
  }
  return value as Json;
}
function sorted<T extends { module: string; component?: string }>(items: T[]): T[] {
  const keys = items.map(x => canonical([x.module, x.component ?? null]));
  if (new Set(keys).size !== keys.length) fail('SCENARIO_FORMAT', 'Duplicate model/state key');
  return [...items].sort((a, b) => a.module < b.module ? -1 : a.module > b.module ? 1 :
    (a.component ?? '') < (b.component ?? '') ? -1 : (a.component ?? '') > (b.component ?? '') ? 1 : 0);
}
export function portableModel(metadata: ModelMetadata | null): PortableModel {
  if (!metadata || metadata.sourceBasis !== 'source-bytes') fail('SCENARIO_UNSUPPORTED', 'Source-byte model metadata is required');
  return { engineVersion: metadata.engineVersion, modelId: metadata.modelId, entryModule: metadata.entryModule,
    sourceBasis: metadata.sourceBasis, manifest: sorted(metadata.manifest.map(({ module, sourceSha256 }) => ({ module, sourceSha256 }))) };
}
export interface RawView {
  location: Operation['host']; state: StateView;
  actions: { items: Array<{ operation: RawOperation; branches: Branch[]; enabled: boolean; gate: Operation['gate'] }>;
    back: { enabled: boolean; reason: string | null } };
}
async function project(view: RawView): Promise<Json> {
  const { state, actions, location } = view;
  return portable({ location, state: { ...state, componentValues: sorted(state.componentValues),
    sharedVariants: sorted(state.sharedVariants), testVariants: sorted(state.testVariants), gateTargets: sorted(state.gateTargets) },
    actions: { items: await Promise.all(actions.items.map(async a => ({ ...a, operation: await describe(a.operation) }))), back: actions.back } });
}
export interface RawCheckpoint {
  view: RawView; timeline: HistoryItem[]; cursor: number;
}

/** Journal is separate from the live timeline. Reset and discarded ghosts remain reproducible.
 * Capture is synchronous; SHA-256 uses WebCrypto without making existing commands asynchronous. */
export class ScenarioJournal {
  private refs = new Map<number, ObservationRef>();
  private pending: Array<Promise<ScenarioStep | null>> = [];
  private initial: Promise<string>;
  private failure: unknown;
  constructor(private metadata: ModelMetadata, initialId: number, checkpoint: RawCheckpoint) {
    this.refs.set(initialId, { step: 0, observation: 0 });
    this.initial = this.checkpoint(checkpoint).then(digest);
    void this.initial.catch(e => { this.failure = e; });
  }
  ref(id: number): ObservationRef {
    const ref = this.refs.get(id);
    if (!ref) return fail('SCENARIO_REFERENCE', 'Observation has no journal address');
    return { ...ref };
  }
  private checkpoint(c: RawCheckpoint): Promise<Json> {
    const timeline = c.timeline.map(({ id, operationId: _operationId, ...rest }) => ({ ...rest, ref: this.ref(id) }));
    const cursor = this.ref(c.cursor);
    return project(c.view).then(view => portable({ view, timeline, cursor }));
  }
  record(command: RawCommand, observations: Array<{ id: number; view: RawView }>, checkpoint: RawCheckpoint, receipt?: Receipt) {
    const step = this.pending.length + 1;
    observations.forEach((o, observation) => this.refs.set(o.id, { step, observation }));
    try {
      // The projections/receipts are already detached from all mutable live state.
      const after = this.checkpoint(checkpoint);
      const views = observations.map(o => project(o.view).then(digest));
      const output = receipt ? portable({ effects: receipt.effects, diagnostics: receipt.diagnostics, changed: receipt.changed }) as Output : null;
      const outputHash = digest(output);
      const recorded = command.kind === 'dispatch' ? describe(command.operation).then(operation => ({ ...command, operation })) : Promise.resolve(command);
      this.pending.push(Promise.all([recorded, after.then(digest), Promise.all(views), outputHash]).then(([cmd, afterDigest, hashes, outputDigest]) => ({
        step, command: cmd, afterDigest, observations: hashes.map(viewDigest => ({ viewDigest })), output, outputDigest,
      })).catch(e => { this.failure = e; return null; }));
    } catch (e) { this.failure = e; this.pending.push(Promise.resolve(null)); }
  }
  async export(checkpoint: RawCheckpoint): Promise<Scenario> {
    // Snapshot the export boundary before awaiting pending hashes; later commands belong to a later export.
    const pending = [...this.pending], finalView = this.checkpoint(checkpoint);
    const [initialDigest, steps, view] = await Promise.all([this.initial, Promise.all(pending), finalView])
      .catch(() => fail('SCENARIO_RECORDING', 'Journal hashing failed; no scenario was exported'));
    if (this.failure || steps.some(s => s === null)) fail('SCENARIO_RECORDING', 'Journal recording failed; reset by creating a new Session');
    return structuredClone({ format: 'shitae-scenario', formatVersion: 1, protocolVersion: 1,
      model: portableModel(this.metadata), initialDigest, steps: steps as ScenarioStep[], final: { view, digest: await digest(view) } });
  }
}

// Closed validation for every executable field. Observation/output/final data never execute;
// they must additionally equal the replayed projection, including every field and array item.
type Obj = Record<string, unknown>;
function object(v: unknown, keys: string[], optional: string[] = []): Obj {
  if (!v || typeof v !== 'object' || Array.isArray(v) ||
    keys.some(k => !Object.prototype.hasOwnProperty.call(v, k)) || Object.keys(v).some(k => !keys.includes(k) && !optional.includes(k))) {
    fail('SCENARIO_FORMAT', `Expected fields: ${keys.join(', ')}`);
  }
  return v as Obj;
}
function string(v: unknown) { if (typeof v !== 'string') fail('SCENARIO_FORMAT', 'Expected string'); }
function integer(v: unknown) { if (!Number.isSafeInteger(v) || (v as number) < 0) fail('SCENARIO_FORMAT', 'Expected nonnegative safe integer'); }
function hash(v: unknown) { if (typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v)) fail('SCENARIO_FORMAT', 'Expected SHA-256'); }
function array(v: unknown): unknown[] { if (!Array.isArray(v)) fail('SCENARIO_FORMAT', 'Expected array'); return v; }
function validateSource(v: unknown) {
  const s = object(v, ['module', 'span']); string(s.module);
  const p = object(s.span, ['offset', 'length', 'line', 'col']); Object.values(p).forEach(integer);
}
function validateBranch(v: unknown) {
  const b = object(v, ['label', 'results']); string(b.label);
  array(b.results).forEach(r => { const x = object(r, ['resultIndex', 'source']); integer(x.resultIndex); validateSource(x.source); });
}
function boolean(v: unknown) { if (typeof v !== 'boolean') fail('SCENARIO_FORMAT', 'Expected boolean'); }
function nullableString(v: unknown) { if (v !== null) string(v); }
function location(v: unknown) {
  const l = object(v, ['module', 'component', 'variant']); string(l.module); string(l.component); nullableString(l.variant);
}
const valueKeys = ['variant', 'singleton', 'scope', 'origin'];
function valueFields(v: Obj) {
  nullableString(v.variant); boolean(v.singleton);
  if (!['frame-location', 'overlay-entry', 'singleton-shared', 'inclusion-initial', 'component-test'].includes(v.scope as string) ||
      !['initial', 'dsl', 'manual-test'].includes(v.origin as string)) fail('SCENARIO_FORMAT', 'Unknown value scope/origin');
}
function componentValue(v: unknown, extra: string[] = []): Obj {
  const c = object(v, ['module', 'component', ...valueKeys, ...extra]); string(c.module); string(c.component); valueFields(c); return c;
}
function reference(v: unknown) { const r = object(v, ['module', 'component']); string(r.module); string(r.component); }
function inclusionNode(v: unknown) {
  const base = ['kind', 'name', 'root', 'path', 'source', 'collection', 'children'];
  const kind = (v as Obj | null)?.kind;
  const n = kind === 'component' ? object(v, [...base, 'reference', 'componentSource', 'value'], ['cycle'])
    : kind === 'unresolved' ? object(v, [...base, 'reference']) : object(v, base);
  if (!['component', 'inline', 'unresolved'].includes(n.kind as string)) fail('SCENARIO_FORMAT', 'Unknown inclusion kind');
  string(n.name); string(n.root); array(n.path).forEach(integer); validateSource(n.source); boolean(n.collection);
  if ('reference' in n) reference(n.reference);
  if ('componentSource' in n) validateSource(n.componentSource);
  if ('value' in n) valueFields(object(n.value, valueKeys));
  if ('cycle' in n && n.cycle !== true) fail('SCENARIO_FORMAT', 'A cycle marker must be true');
  if ((n.kind === 'unresolved' || n.cycle === true) && array(n.children).length !== 0) fail('SCENARIO_FORMAT', 'Unresolved/cyclic inclusion has children');
  array(n.children).forEach(inclusionNode);
}
function inclusionRoot(v: unknown) {
  const r = componentValue(v, ['root', 'source', 'children']); string(r.root); if (r.source !== null) validateSource(r.source);
  array(r.children).forEach(inclusionNode);
}
function validateState(v: unknown) {
  const s = object(v, ['frames', 'activeFrameId', 'nextFrameId', 'activePath', 'overlays', 'sharedVariants', 'testVariants', 'componentValues', 'gateTargets', 'inclusion']);
  integer(s.activeFrameId); integer(s.nextFrameId); array(s.activePath).forEach(integer);
  array(s.frames).forEach(item => {
    const f = object(item, ['id', 'parentId', 'stack', 'barrier', 'beginsSession', 'origin']);
    integer(f.id); if (f.parentId !== null) integer(f.parentId); boolean(f.barrier);
    if (!['root', 'push', 'present', 'switch'].includes(f.origin as string)) fail('SCENARIO_FORMAT', 'Unknown frame origin');
    if (f.beginsSession !== null) nullableString(object(f.beginsSession, ['name']).name);
    array(f.stack).forEach(x => componentValue(x));
  });
  for (const key of ['overlays', 'sharedVariants', 'testVariants', 'componentValues']) array(s[key]).forEach(x => componentValue(x));
  array(s.gateTargets).forEach(x => array(componentValue(x, ['variants']).variants).forEach(string));
  const inclusion = object(s.inclusion, ['main', 'overlays']); inclusionRoot(inclusion.main); array(inclusion.overlays).forEach(inclusionRoot);
}
function gate(v: unknown) {
  if (v === null) return;
  const base = ['kind', 'name', 'enabled', 'unresolved'];
  const candidate = v as Obj;
  const hasTarget = candidate.kind === 'member' && ['module', 'targetComponent', 'value'].some(k => Object.prototype.hasOwnProperty.call(candidate, k));
  const g = object(v, hasTarget ? [...base, 'module', 'targetComponent', 'value'] : base);
  if (!['host', 'member'].includes(g.kind as string)) fail('SCENARIO_FORMAT', 'Unknown gate kind');
  string(g.name); boolean(g.enabled); boolean(g.unresolved);
  if (g.kind === 'member' && !hasTarget && g.unresolved !== false) fail('SCENARIO_FORMAT', 'Inline member gate cannot be unresolved');
  if ('module' in g) string(g.module); if ('targetComponent' in g) string(g.targetComponent);
  if ('value' in g) valueFields(object(g.value, valueKeys));
}
function observationRef(v: unknown) { const r = object(v, ['step', 'observation']); integer(r.step); integer(r.observation); }
function validateCheckpoint(v: unknown) {
  const c = object(v, ['view', 'timeline', 'cursor']); observationRef(c.cursor);
  const view = object(c.view, ['location', 'state', 'actions']); location(view.location); validateState(view.state);
  const actions = object(view.actions, ['items', 'back']);
  array(actions.items).forEach(item => {
    const a = object(item, ['operation', 'branches', 'enabled', 'gate']);
    validateCommand({ kind: 'dispatch', operation: a.operation, branch: null });
    array(a.branches).forEach(validateBranch); boolean(a.enabled); gate(a.gate);
  });
  const back = object(actions.back, ['enabled', 'reason']); boolean(back.enabled); nullableString(back.reason);
  array(c.timeline).forEach(item => {
    const t = object(item, ['resultIndex', 'source', 'kind', 'label', 'location', 'ghost', 'ref']);
    if (t.resultIndex !== null) integer(t.resultIndex); if (t.source !== null) validateSource(t.source);
    if (!['event', 'transition'].includes(t.kind as string)) fail('SCENARIO_FORMAT', 'Unknown observation kind');
    string(t.label); location(t.location); boolean(t.ghost); observationRef(t.ref);
  });
}
function validateCommand(v: unknown) {
  const kind = (v as Obj | null)?.kind;
  if (kind === 'dispatch') {
    const c = object(v, ['kind', 'operation', 'branch']);
    const op = c.operation as Obj | null;
    if (op?.kind === 'control') { const x = object(op, ['kind', 'name']); if (x.name !== 'back') fail('SCENARIO_FORMAT', 'Unknown control'); }
    else {
      const x = object(op, ['kind', 'scope', 'host', 'placement', 'source', 'definitionDigest']);
      if (x.kind !== 'interaction' || !['document', 'component', 'variant'].includes(x.scope as string)) fail('SCENARIO_FORMAT', 'Unknown interaction kind/scope');
      const host = object(x.host, ['module', 'component', 'variant']); string(host.module); string(host.component); if (host.variant !== null) string(host.variant);
      const placement = object(x.placement, ['root', 'path', 'source']); string(placement.root); array(placement.path).forEach(integer);
      if (placement.source !== null) validateSource(placement.source);
      validateSource(x.source); hash(x.definitionDigest);
    }
    if (c.branch !== null) validateBranch(c.branch);
  } else if (kind === 'setTestVariant') {
    const c = object(v, ['kind', 'module', 'component', 'variant']); string(c.module); string(c.component); string(c.variant);
  } else if (kind === 'seek') {
    const c = object(v, ['kind', 'target']), t = object(c.target, ['step', 'observation']); integer(t.step); integer(t.observation);
  } else if (kind === 'reset') object(v, ['kind']);
  else fail('SCENARIO_FORMAT', 'Unknown command');
}
export function validateScenario(value: unknown): Scenario {
  canonical(value); // Reject undefined, nonfinite values, non-JSON objects before any execution.
  const s = object(value, ['format', 'formatVersion', 'protocolVersion', 'model', 'initialDigest', 'steps', 'final']);
  if (s.format !== 'shitae-scenario' || s.formatVersion !== 1 || s.protocolVersion !== 1) fail('SCENARIO_FORMAT', 'Unsupported scenario format/protocol version');
  const m = object(s.model, ['engineVersion', 'modelId', 'entryModule', 'sourceBasis', 'manifest']);
  string(m.engineVersion); hash(m.modelId); string(m.entryModule);
  if (m.sourceBasis !== 'source-bytes') fail('SCENARIO_FORMAT', 'Expected source-byte metadata');
  array(m.manifest).forEach(item => { const x = object(item, ['module', 'sourceSha256']); string(x.module); hash(x.sourceSha256); });
  hash(s.initialDigest);
  array(s.steps).forEach((item, i) => {
    const x = object(item, ['step', 'command', 'afterDigest', 'observations', 'output', 'outputDigest']);
    if (x.step !== i + 1) fail('SCENARIO_FORMAT', 'Nonsequential journal step');
    validateCommand(x.command); hash(x.afterDigest); hash(x.outputDigest);
    array(x.observations).forEach(o => hash(object(o, ['viewDigest']).viewDigest));
    if (x.output !== null) {
      const o = object(x.output, ['effects', 'diagnostics', 'changed']); array(o.changed).forEach(string);
      array(o.effects).forEach(e => { const r = object(e, ['resultIndex', 'source', 'text']); integer(r.resultIndex); validateSource(r.source); string(r.text); });
      array(o.diagnostics).forEach(e => { const r = object(e, ['resultIndex', 'source', 'diagnostic']); integer(r.resultIndex); validateSource(r.source);
        const d = object(r.diagnostic, ['severity', 'code', 'message', 'span']); if (!['error', 'warning'].includes(d.severity as string)) fail('SCENARIO_FORMAT', 'Unknown diagnostic severity');
        string(d.code); string(d.message); Object.values(object(d.span, ['offset', 'length', 'line', 'col'])).forEach(integer); });
    }
  });
  const final = object(s.final, ['view', 'digest']); hash(final.digest); validateCheckpoint(final.view);
  return structuredClone(value as Scenario);
}

export function checkModel(prepared: PreparedScenarioModel, saved: Scenario) {
  const current = portableModel(prepared.metadata);
  if (current.engineVersion !== saved.model.engineVersion) identityMismatch('ENGINE_MISMATCH', saved.model, current);
  if (!same(current, { ...saved.model, manifest: sorted(saved.model.manifest) })) {
    identityMismatch('MODEL_MISMATCH', saved.model, current);
  }
}
function identityMismatch(code: 'ENGINE_MISMATCH' | 'MODEL_MISMATCH', expected: PortableModel, actual: PortableModel): never {
  const reasons: string[] = [];
  const modelChecked = code !== 'ENGINE_MISMATCH';
  if (!modelChecked) reasons.push('処理系が異なります。モデルは未照合です。');
  else {
    if (expected.entryModule !== actual.entryModule) reasons.push(`エントリが異なります: ${expected.entryModule} → ${actual.entryModule}`);
    const before = new Map(expected.manifest.map(m => [m.module, m.sourceSha256]));
    const now = new Map(actual.manifest.map(m => [m.module, m.sourceSha256]));
    const added = [...now.keys()].filter(m => !before.has(m));
    const missing = [...before.keys()].filter(m => !now.has(m));
    const changed = [...before.keys()].filter(m => now.has(m) && before.get(m) !== now.get(m));
    if (added.length) reasons.push('現在のモデルで追加されたmodule: ' + added.join(', '));
    if (missing.length) reasons.push('現在のモデルで不足するmodule: ' + missing.join(', '));
    if (changed.length) reasons.push('source bytesが異なるmodule: ' + changed.join(', ') + '（空白・コメントも照合対象）');
    if (!reasons.length) reasons.push('modelIdが異なります。完全な識別情報を確認してください。');
  }
  const nextActions = [
    '完全一致する保存時のHTMLが残っていれば、そのHTMLとscenarioの組で再開してください。任意の古いHTMLでは再開できません。',
    'CLIでの再開には、対応する元モデル一式と処理系が必要です。engineのhashだけからcommitは特定できません。',
    '変更後のモデル・処理系で検討する場合は新しく記録してください。旧版の検討手順は人が選び直すための参照に使えます。',
  ];
  const diagnostic = structuredClone({ reasons, nextActions, modelChecked, expected, actual });
  throw new ScenarioError(code, reasons.join('\n') + '\n次の行動:\n' + nextActions.join('\n') +
    `\n詳細: Expected ${canonical(expected)}; actual ${canonical(actual)}`, null, diagnostic);
}
export { same as scenarioEqual };

/** Report the first unequal field rather than an unrelated, possibly equal state hash. */
export function scenarioDifference(expected: unknown, actual: unknown, path = ''): string | null {
  if (same(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length: expected ${expected.length}; actual ${actual.length}`;
    for (let i = 0; i < expected.length; i++) { const diff = scenarioDifference(expected[i], actual[i], `${path}[${i}]`); if (diff) return diff; }
  } else if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    const e = expected as Obj, a = actual as Obj;
    for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) {
      const next = path ? `${path}.${k}` : k;
      if (!(k in e) || !(k in a)) return `${next}: expected ${k in e ? canonical(e[k]) : '<absent>'}; actual ${k in a ? canonical(a[k]) : '<absent>'}`;
      const diff = scenarioDifference(e[k], a[k], next); if (diff) return diff;
    }
  }
  return `${path}: expected ${canonical(expected)}; actual ${canonical(actual)}`;
}
