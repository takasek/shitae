import type { Action, Document, Component, ElementLine, Interaction, Result } from '@shitae/ast';
import { effectiveResults, mergeInteractions, resolveModuleRef } from '@shitae/resolver';
import { singletonNames } from '@shitae/runtime';

export interface SimTransition {
  type: 'transition';
  word: string;
  target:
    | { kind: 'full'; module: string | null; component: string; variant: string | null }
    | { kind: 'variant'; variant: string }
    | null;
  session: string | null;
}

export interface SimEffect {
  type: 'effect';
  text: string;
}

/** オーバーレイ（show / hide）。掲示中 component 集合を更新する（SPEC「オーバーレイ」） */
export interface SimOverlay {
  type: 'overlay';
  op: 'show' | 'hide';
  component: string;
  /** show(X::name) 等の明示モジュール。省略時は interaction が書かれたファイルの module（レキシカル解決。ADR-0018） */
  module: string | null;
  /** show(X##v) の表示 variant。省略時（initial の含意）は null。hide は常に null（SPEC「オーバーレイ」） */
  variant: string | null;
}

/** state verb（set）。遷移を伴わない singleton の共有 variant 書き換え（ADR-0014） */
export interface SimStateWrite {
  type: 'state';
  component: string;
  /** set(mod::X##v) の明示モジュール。省略時は interaction が書かれたファイルの module（レキシカル解決。ADR-0018） */
  module: string | null;
  variant: string;
}

export type SimResultBody = SimTransition | SimEffect | SimOverlay | SimStateWrite;

/** 同一有効ラベルの result 群 ＝ 1 つの選択肢（選ぶと results が順に全部起こる） */
export interface SimChoice {
  label: string;
  results: SimResultBody[];
}

/**
 * presence gate（`行動(対象?)`）の構造的 presence 判定に要る情報（SPEC「2種類のガード的なもの」・ADR-0002）。
 * - host: 裸参照。host component の現在 variant で判定。document common の裸参照も host 扱い——
 *   発火時のアクティブ component で判定する（裸 ##variant の動的解決と同じ原理。ADR-0015）
 * - member: `対象.要素` 参照。対象インスタンス（targetComponent）の現在 variant で判定
 */
export interface SimGate {
  /** 実効 body の alias/ref 名との照合に使う名前 */
  name: string;
  kind: 'host' | 'member';
  /** kind==='member' のときの対象 component 名 */
  targetComponent?: string;
  /** kind==='member' のときの明示モジュール。省略時は interaction が書かれたファイルの module（レキシカル解決。ADR-0018） */
  module?: string | null;
}

/**
 * interaction の有効範囲。document common / docCommonInteractions 由来は 'document'、
 * component common 由来（shadow 合成で姿へ生き残ったものも含む）は 'component'、
 * 姿固有（v.body.interactions に由来するもの）は 'variant'。
 */
export type SimInteractionScope = 'document' | 'component' | 'variant';

export interface SimInteraction {
  actionText: string;
  /** action.target の参照名（対象なしは null）。操作の対象紐付け（Task 8）に使う——表示中の
   * トップレベル要素の表示名（alias 優先）とここを名前一致で照合する */
  targetName: string | null;
  /** action.target.member（`対象.member` 参照の member 部分。対象なし・member 無しは null）。
   * actionText の member 復元と、埋め込み部品の外側上書きマッチング（Task 13）に使う */
  targetMember: string | null;
  /** 最初のラベルより前の result 群。常に成立（分岐に依らず順に全部起こる） */
  prelude: SimResultBody[];
  /** 条件ラベル付きの選択肢。ラベル継承（effectiveResults）済み */
  choices: SimChoice[];
  /** `?` 無しの行動は null（always-on）。SPEC「presence gate」 */
  gate: SimGate | null;
  /** この interaction の由来（document/component/variant）。SPEC「document common」3階層 */
  scope: SimInteractionScope;
}

/** 要素行1件の参照先 component（module はレキシカル解決済みの正準名。Task 8） */
export interface SimElementRef {
  module: string;
  name: string;
}

/**
 * 要素行1件（表示名 + 定義済み component への参照）。Task 8「要素の階層表示」。
 * ref は要素行の参照が project 内で定義済み component に解決する場合のみ設定する。
 * collection（`{...}`）や未定義参照は ref: null——階層展開できるのは単一 component 参照のみ。
 */
export interface SimElement {
  /** 表示名（alias があればそれ、なければ ref 名 or '{...}'） */
  name: string;
  ref: SimElementRef | null;
}

export interface SimVariant {
  elements: SimElement[];
  interactions: SimInteraction[];
  /** この姿の実効 interactions に shadow されず生き残った document common（SPEC「document common」3階層shadow） */
  docCommonInteractions: SimInteraction[];
}

export interface SimComponent {
  commonElements: SimElement[];
  commonInteractions: SimInteraction[];
  /** component common の実効 interactions に shadow されず生き残った document common（姿を持たない component 用） */
  docCommonInteractions: SimInteraction[];
  variants: Record<string, SimVariant>;
  /** 最初に定義された姿。姿指定なしで入ったときの初期姿。姿を持たなければ null */
  initialVariant: string | null;
}

export interface SimModuleData {
  components: Record<string, SimComponent>;
  /** document common の要素行（全 component の表示に共通要素として乗る。SPEC「document common」） */
  docCommonElements: SimElement[];
}

/** module 付き component 参照（singleton・gate 対象の一意識別。ADR-0013） */
export interface SimComponentRef {
  module: string;
  name: string;
}

/**
 * 遷移グラフのエッジ端点（最細粒度 = variant 単位。Task 11）。
 * from.variant はその interaction が属する姿——姿を持つ component では common 由来も merged interactions として各姿から出る実態があるため、その variant を from に持つ。
 * 姿を持たない component の common 由来だけが null。to.variant は明示 variant（省略は null のまま。初期姿への解決はブラウザ側集約が行う）。
 */
export interface SimGraphEndpoint {
  module: string;
  component: string;
  variant: string | null;
}

/**
 * 遷移グラフ（simulator の遷移マップ描画用）。ノードは全 module の全 component（定義順）。
 * エッジは push/present/goto/switch の静的 target（target.kind === 'full'、定義済み component）
 * を (from, to) 全体キーで重複除去したもの（variant 粒度。Task 11）。back/exit/dismiss と
 * ##variant のみの goto はエッジにしない。documentCommon 由来の遷移は発火元 component が
 * 静的に定まらないためエッジにしない。各 component の variants 一覧は modules データから引ける。
 */
export interface SimGraph {
  nodes: SimComponentRef[];
  edges: { from: SimGraphEndpoint; to: SimGraphEndpoint }[];
}

/** 遷移マップで variant 分割表示する component の指定 1 件（Task 11） */
export interface SimGraphSplitEntry {
  module: string;
  component: string;
}

/**
 * simulator の外部 config（`<basename>.simconfig.json` の中身。Task 11）。
 * 読むのは graph.split のみ——未知キーは無視する（前方互換）。
 */
export interface SimulatorConfig {
  graph?: { split?: SimGraphSplitEntry[] };
}

export interface SimulatorData {
  modules: Record<string, SimModuleData>;
  entryModule: string;
  entryComponent: string;
  /** document common（最初の # より前）のインタラクション。どの画面でも常に有効（SPEC「document common」） */
  documentCommon: SimInteraction[];
  /** singleton（`#!`）component の参照（定義ファイル単位。素名合流はしない——ADR-0013） */
  singletons: SimComponentRef[];
  /**
   * member gate（`対象.要素?`）の対象 component（重複除去。定義 module へ解決済み。未定義は含めない）。
   * host gate は含めない——手動トグル UI（ADR-0002 Consequence）が
   * 「今どの画面にも表示されていない対象インスタンスの variant」を模擬するための一覧。
   */
  gateTargets: SimComponentRef[];
  /** 遷移グラフ（simulator の遷移マップ描画用） */
  graph: SimGraph;
  /** 遷移マップ粒度の初期値（simconfig 由来。ブラウザ側 graphSplit の初期集合。Task 11） */
  graphConfig: { split: SimGraphSplitEntry[] };
}

/** alias を正準モジュール名へ解決する関数（ADR-0017）。未解決 alias はそのまま返す */
type ModuleNormalizer = (module: string | null) => string | null;

/**
 * 要素行1件を SimElement へ変換する（Task 8）。collection（`{...}`）は ref を持てない
 * ため常に null。ref 参照は module をレキシカル解決（ADR-0018）した上でひとまず候補として
 * 保持し、project 内で定義済み component に解決するかは全 module 構築後の
 * pruneUnresolvedElementRefs で確定させる（この時点では他 module が未構築のことがある）。
 */
function convertElementLine(el: ElementLine, norm: ModuleNormalizer, sourceModule: string): SimElement {
  if (el.value.kind === 'inline') {
    return { name: el.alias ?? '{...}', ref: null };
  }
  const module = norm(el.value.module ?? sourceModule) ?? sourceModule;
  return { name: el.alias ?? el.value.name, ref: { module, name: el.value.name } };
}

/**
 * 全 module 構築後、要素行の ref 候補が実在の定義に解決するか検証し、未定義は ref: null へ
 * 落とす（extractSimData 内で 2 パス目として呼ぶ。convertComponent 単体では他 module が
 * 未構築の可能性があり判定できないため）。
 */
function pruneUnresolvedElementRefs(modules: Record<string, SimModuleData>): void {
  const isDefined = (ref: SimElementRef) => Boolean(modules[ref.module]?.components[ref.name]);
  const prune = (elements: SimElement[]): void => {
    for (const el of elements) {
      if (el.ref && !isDefined(el.ref)) el.ref = null;
    }
  };
  for (const mod of Object.values(modules)) {
    prune(mod.docCommonElements);
    for (const comp of Object.values(mod.components)) {
      prune(comp.commonElements);
      for (const v of Object.values(comp.variants)) prune(v.elements);
    }
  }
}

function convertResultBody(r: Result, norm: ModuleNormalizer, sourceModule: string): SimResultBody {
  const { body } = r;
  if (body.kind === 'transition') {
    let target: SimTransition['target'] = null;
    if (body.target) {
      if (body.target.kind === 'variant') {
        target = { kind: 'variant', variant: body.target.name };
      } else {
        target = {
          kind: 'full',
          module: norm(body.target.module ?? sourceModule),
          component: body.target.name,
          variant: body.target.variant ?? null,
        };
      }
    }
    return {
      type: 'transition',
      word: body.word,
      target,
      session: body.session?.name ?? null,
    };
  } else if (body.kind === 'overlay') {
    // 掲示中 component 集合を更新する（ブラウザ側で常駐オーバーレイ帯に表示）。
    // variant は掲示時の姿だが simulator の帯表示は component 名だけを扱う。
    return {
      type: 'overlay',
      op: body.verb,
      component: body.target.name,
      module: norm(body.target.module ?? sourceModule),
      variant: body.target.variant ?? null,
    };
  } else if (body.kind === 'state') {
    // set（ADR-0014）: 遷移なしの共有 variant 書き換え。掲示もしない。
    return {
      type: 'state',
      component: body.target.name,
      module: norm(body.target.module ?? sourceModule),
      variant: body.target.variant,
    };
  } else {
    return { type: 'effect', text: body.text };
  }
}

/**
 * action.target の existsGated から SimGate を組み立てる（SPEC「presence gate」・ADR-0002）。
 * 裸参照は document common（字句上の host なし）でも host 扱い——発火時のアクティブ component の
 * 実効 body で判定する（ADR-0015。ADR-0012 B7a の always-on を置き換え）。
 * member gate の module 帰属は無修飾参照と同じくレキシカル——sourceModule で解決する（ADR-0018）。
 */
function buildGate(action: Action, norm: ModuleNormalizer, sourceModule: string): SimGate | null {
  const ref = action.target;
  if (!ref || !ref.existsGated) return null;
  if (ref.member === null) {
    return { name: ref.name, kind: 'host' };
  }
  return { name: ref.member, kind: 'member', targetComponent: ref.name, module: norm(ref.module ?? sourceModule) };
}

function convertInteraction(
  i: Interaction,
  norm: ModuleNormalizer,
  sourceModule: string,
  scope: SimInteractionScope,
): SimInteraction {
  const action = i.action;
  const member = action.target?.member ?? null;
  // member 参照（対象.member）は表示・マッチング用に member を残す——落とすと部品要素配下の
  // どの操作への上書きかが読み取れなくなる（UX評価3.4、Task 13）
  const targetPart = action.target ? `(${action.target.name}${member ? `.${member}` : ''})` : '';
  const prelude: SimResultBody[] = [];
  const choices: SimChoice[] = [];
  for (const { label, result } of effectiveResults(i)) {
    const body = convertResultBody(result, norm, sourceModule);
    if (label === null) {
      // effectiveResults はラベルを前方に引き継ぐため、null は最初のラベルより前だけ
      prelude.push(body);
    } else {
      // SPEC「未定・分岐」— 同一ラベルの再出現は同じ条件への合流（隣接に限らない）
      const existing = choices.find((c) => c.label === label);
      if (existing) {
        existing.results.push(body);
      } else {
        choices.push({ label, results: [body] });
      }
    }
  }
  return {
    actionText: `${action.text}${targetPart}`,
    targetName: action.target?.name ?? null,
    targetMember: member,
    prelude,
    choices,
    gate: buildGate(action, norm, sourceModule),
    scope,
  };
}

/**
 * documentCommon のうち、effective（component common または姿の実効 interactions）に
 * shadow されず生き残るものだけを返す（SPEC「document common」3階層shadow: 特化が一般に勝つ）。
 * mergeInteractions(documentCommon, effective) は [生存 documentCommon, ...effective] の順で
 * 返すため、末尾から effective.length 件を落とせば生存分だけが残る。
 */
function survivingDocCommon(documentCommon: Interaction[], effective: Interaction[]): Interaction[] {
  if (effective.length === 0) return mergeInteractions(documentCommon, effective);
  const merged = mergeInteractions(documentCommon, effective);
  return merged.slice(0, merged.length - effective.length);
}

function convertComponent(
  comp: Component,
  documentCommon: Interaction[],
  norm: ModuleNormalizer,
  sourceModule: string,
): SimComponent {
  const commonElements = comp.common.elements.map((el) => convertElementLine(el, norm, sourceModule));
  const commonInteractionsAst = comp.common.interactions;
  const commonInteractions = commonInteractionsAst.map((it) => convertInteraction(it, norm, sourceModule, 'component'));
  const docCommonInteractions = survivingDocCommon(documentCommon, commonInteractionsAst).map(
    (it) => convertInteraction(it, norm, sourceModule, 'document'),
  );
  const variants: Record<string, SimVariant> = {};
  for (const v of comp.variants) {
    // 姿で有効な interaction 一覧 = mergeInteractions(共通, 姿固有)。
    // 同一 (行動, 対象) は姿固有が共通を shadow する
    const effectiveAst = mergeInteractions(commonInteractionsAst, v.body.interactions);
    // mergeInteractions は AST ノードをそのまま並べ替える（identity 比較で由来判定できる）。
    // v.body.interactions に含まれるものが姿固有、それ以外は shadow を生き延びた共通由来
    const specificAst = new Set(v.body.interactions);
    variants[v.name] = {
      elements: v.body.elements.map((el) => convertElementLine(el, norm, sourceModule)),
      interactions: effectiveAst.map((it) =>
        convertInteraction(it, norm, sourceModule, specificAst.has(it) ? 'variant' : 'component'),
      ),
      docCommonInteractions: survivingDocCommon(documentCommon, effectiveAst).map(
        (it) => convertInteraction(it, norm, sourceModule, 'document'),
      ),
    };
  }
  return {
    commonElements,
    commonInteractions,
    docCommonInteractions,
    variants,
    initialVariant: comp.variants[0]?.name ?? null,
  };
}

/** 遷移グラフのエッジ対象となる遷移語（SPEC「遷移語」のうち画面移動を伴うもの） */
const GRAPH_EDGE_WORDS = new Set(['push', 'present', 'goto', 'switch']);

/**
 * component 1 件分の interactions（component common または姿の merged interactions）から
 * 静的な遷移エッジを集める。target.kind === 'full' かつ定義済み component のものだけを
 * (from, to) 全体キーで重複除去して out に積む（variant 粒度。Task 11）。to.variant は
 * 明示指定をそのまま保持し、省略は null のまま。back/exit/dismiss と ##variant のみの goto は対象外。
 */
function collectGraphEdges(
  interactions: SimInteraction[],
  from: SimGraphEndpoint,
  modules: Record<string, SimModuleData>,
  out: Map<string, { from: SimGraphEndpoint; to: SimGraphEndpoint }>,
): void {
  for (const it of interactions) {
    const bodies = [...it.prelude, ...it.choices.flatMap((c) => c.results)];
    for (const body of bodies) {
      if (body.type !== 'transition' || !GRAPH_EDGE_WORDS.has(body.word)) continue;
      const target = body.target;
      if (!target || target.kind !== 'full' || target.module == null) continue;
      if (!modules[target.module]?.components[target.component]) continue; // 未定義 component はエッジにしない
      const to: SimGraphEndpoint = { module: target.module, component: target.component, variant: target.variant };
      out.set(JSON.stringify([from, to]), { from, to });
    }
  }
}

/** member gate 対象を集める。module は「明示指定 > 収集元 module」で解決し、定義が実在するものだけ残す。 */
function collectGateTargets(
  interactions: SimInteraction[],
  sourceModule: string,
  modules: Record<string, SimModuleData>,
  out: Map<string, SimComponentRef>,
): void {
  for (const it of interactions) {
    if (it.gate?.kind !== 'member' || !it.gate.targetComponent) continue;
    const module = it.gate.module ?? sourceModule;
    const name = it.gate.targetComponent;
    if (!modules[module]?.components[name]) continue; // 未定義対象は always-on（トグル不要）
    out.set(JSON.stringify([module, name]), { module, name });
  }
}

/**
 * config.graph.split を検証して正規化する（Task 11）。JSON 由来の任意値が来るため、
 * module/component が文字列のエントリだけを {module, component} の形へ絞って残す
 * （余分なキーは落とす）。未知キー・不正エントリは黙って無視する（CLI 側は不正 JSON のみ警告）。
 */
function sanitizeGraphConfig(config: SimulatorConfig | undefined): { split: SimGraphSplitEntry[] } {
  const raw = config?.graph?.split;
  if (!Array.isArray(raw)) return { split: [] };
  const split: SimGraphSplitEntry[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof entry.module === 'string' && typeof entry.component === 'string') {
      split.push({ module: entry.module, component: entry.component });
    }
  }
  return { split };
}

export function extractSimData(
  documents: Map<string, Document>,
  entryModule: string,
  config?: SimulatorConfig,
): SimulatorData {
  const entryDoc = documents.get(entryModule);
  const entryComponent = entryDoc?.components[0]?.name ?? '';
  const documentCommonAst = entryDoc?.common.interactions ?? [];
  const normFor = (doc: Document | undefined): ModuleNormalizer => (module) => {
    if (module == null || doc == null) return module;
    return resolveModuleRef(module, doc) ?? module;
  };
  // document common（entry ファイル）の無修飾参照は entryModule をレキシカル基準とする（ADR-0018）
  const documentCommon = documentCommonAst.map((it) =>
    convertInteraction(it, normFor(entryDoc), entryModule, 'document'),
  );

  const modules: Record<string, SimModuleData> = {};
  const graphNodes: SimComponentRef[] = [];
  for (const [moduleName, doc] of documents) {
    const components: Record<string, SimComponent> = {};
    const norm = normFor(doc);
    for (const comp of doc.components) {
      // SPEC「document common」: 実行時に有効な document common はその component が
      // 定義されているファイル自身のもの（entry ファイルのものではない）。
      // 無修飾参照の module 帰属はこの component が定義されているファイル（moduleName）自身（ADR-0018）
      components[comp.name] = convertComponent(comp, doc.common.interactions, norm, moduleName);
      graphNodes.push({ module: moduleName, name: comp.name });
    }
    modules[moduleName] = {
      components,
      docCommonElements: doc.common.elements.map((el) => convertElementLine(el, norm, moduleName)),
    };
  }

  // 全 module 構築後に要素行の ref 候補を検証し、未定義参照を ref: null へ落とす（Task 8）
  pruneUnresolvedElementRefs(modules);

  // singleton は定義ファイル単位（素名合流はしない。ADR-0013）
  const singletons: SimComponentRef[] = [];
  for (const [moduleName, doc] of documents) {
    for (const name of singletonNames(doc)) singletons.push({ module: moduleName, name });
  }

  const gateTargetMap = new Map<string, SimComponentRef>();
  collectGateTargets(documentCommon, entryModule, modules, gateTargetMap);
  for (const [moduleName, mod] of Object.entries(modules)) {
    for (const comp of Object.values(mod.components)) {
      collectGateTargets(comp.commonInteractions, moduleName, modules, gateTargetMap);
      collectGateTargets(comp.docCommonInteractions, moduleName, modules, gateTargetMap);
      for (const v of Object.values(comp.variants)) {
        collectGateTargets(v.interactions, moduleName, modules, gateTargetMap);
        collectGateTargets(v.docCommonInteractions, moduleName, modules, gateTargetMap);
      }
    }
  }

  // 遷移グラフ: documentCommon 由来は発火元 component が静的に定まらないため対象外（brief 明記）。
  // 最細粒度（variant 単位。Task 11）: 姿を持つ component は各 variant の merged interactions
  // だけを走査する——common 由来もそこに合成済みで「その variant から出る」実態があるため
  // from はその variant とし、common を別走査すると重複するので走査しない。
  // 姿を持たない component だけ common を from.variant = null で走査する。
  const graphEdgeMap = new Map<string, { from: SimGraphEndpoint; to: SimGraphEndpoint }>();
  for (const [moduleName, mod] of Object.entries(modules)) {
    for (const [compName, comp] of Object.entries(mod.components)) {
      const variantEntries = Object.entries(comp.variants);
      if (variantEntries.length === 0) {
        const from: SimGraphEndpoint = { module: moduleName, component: compName, variant: null };
        collectGraphEdges(comp.commonInteractions, from, modules, graphEdgeMap);
      } else {
        for (const [vName, v] of variantEntries) {
          const from: SimGraphEndpoint = { module: moduleName, component: compName, variant: vName };
          collectGraphEdges(v.interactions, from, modules, graphEdgeMap);
        }
      }
    }
  }

  return {
    modules,
    entryModule,
    entryComponent,
    documentCommon,
    singletons,
    gateTargets: [...gateTargetMap.values()],
    graph: { nodes: graphNodes, edges: [...graphEdgeMap.values()] },
    graphConfig: sanitizeGraphConfig(config),
  };
}
