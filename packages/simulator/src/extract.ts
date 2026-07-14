import type { Action, Document, Component, Interaction, Result } from '@shitae/ast';
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
  /** show(X::name) 等の明示モジュール。省略時は null（実行時にアクティブフレームの module で解決） */
  module: string | null;
  /** show(X##v) の表示 variant。省略時（initial の含意）は null。hide は常に null（SPEC「オーバーレイ」） */
  variant: string | null;
}

/** state verb（set）。遷移を伴わない singleton の共有 variant 書き換え（ADR-0014） */
export interface SimStateWrite {
  type: 'state';
  component: string;
  /** set(mod::X##v) の明示モジュール。省略時は null（実行時にアクティブフレームの module で解決） */
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
  /** kind==='member' のときの明示モジュール。省略時は null（実行時にアクティブフレームの module で解決） */
  module?: string | null;
}

export interface SimInteraction {
  actionText: string;
  /** 最初のラベルより前の result 群。常に成立（分岐に依らず順に全部起こる） */
  prelude: SimResultBody[];
  /** 条件ラベル付きの選択肢。ラベル継承（effectiveResults）済み */
  choices: SimChoice[];
  /** `?` 無しの行動は null（always-on）。SPEC「presence gate」 */
  gate: SimGate | null;
}

export interface SimVariant {
  elements: string[];
  interactions: SimInteraction[];
  /** この姿の実効 interactions に shadow されず生き残った document common（SPEC「document common」3階層shadow） */
  docCommonInteractions: SimInteraction[];
}

export interface SimComponent {
  commonElements: string[];
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
  docCommonElements: string[];
}

/** module 付き component 参照（singleton・gate 対象の一意識別。ADR-0013） */
export interface SimComponentRef {
  module: string;
  name: string;
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
}

function elementDisplayName(el: import('@shitae/ast').ElementLine): string {
  if (el.alias) return el.alias;
  if (el.value.kind === 'ref') return el.value.name;
  return '{...}';
}

/** alias を正準モジュール名へ解決する関数（ADR-0017）。未解決 alias はそのまま返す */
type ModuleNormalizer = (module: string | null) => string | null;

function convertResultBody(r: Result, norm: ModuleNormalizer): SimResultBody {
  const { body } = r;
  if (body.kind === 'transition') {
    let target: SimTransition['target'] = null;
    if (body.target) {
      if (body.target.kind === 'variant') {
        target = { kind: 'variant', variant: body.target.name };
      } else {
        target = {
          kind: 'full',
          module: norm(body.target.module ?? null),
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
      module: norm(body.target.module ?? null),
      variant: body.target.variant ?? null,
    };
  } else if (body.kind === 'state') {
    // set（ADR-0014）: 遷移なしの共有 variant 書き換え。掲示もしない。
    return {
      type: 'state',
      component: body.target.name,
      module: norm(body.target.module ?? null),
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
 */
function buildGate(action: Action, norm: ModuleNormalizer): SimGate | null {
  const ref = action.target;
  if (!ref || !ref.existsGated) return null;
  if (ref.member === null) {
    return { name: ref.name, kind: 'host' };
  }
  return { name: ref.member, kind: 'member', targetComponent: ref.name, module: norm(ref.module ?? null) };
}

function convertInteraction(i: Interaction, norm: ModuleNormalizer): SimInteraction {
  const action = i.action;
  const targetPart = action.target ? `(${action.target.name})` : '';
  const prelude: SimResultBody[] = [];
  const choices: SimChoice[] = [];
  for (const { label, result } of effectiveResults(i)) {
    const body = convertResultBody(result, norm);
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
    prelude,
    choices,
    gate: buildGate(action, norm),
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

function convertComponent(comp: Component, documentCommon: Interaction[], norm: ModuleNormalizer): SimComponent {
  const commonElements = comp.common.elements.map(elementDisplayName);
  const commonInteractionsAst = comp.common.interactions;
  const commonInteractions = commonInteractionsAst.map((it) => convertInteraction(it, norm));
  const docCommonInteractions = survivingDocCommon(documentCommon, commonInteractionsAst).map(
    (it) => convertInteraction(it, norm),
  );
  const variants: Record<string, SimVariant> = {};
  for (const v of comp.variants) {
    // 姿で有効な interaction 一覧 = mergeInteractions(共通, 姿固有)。
    // 同一 (行動, 対象) は姿固有が共通を shadow する
    const effectiveAst = mergeInteractions(commonInteractionsAst, v.body.interactions);
    variants[v.name] = {
      elements: v.body.elements.map(elementDisplayName),
      interactions: effectiveAst.map((it) => convertInteraction(it, norm)),
      docCommonInteractions: survivingDocCommon(documentCommon, effectiveAst).map(
        (it) => convertInteraction(it, norm),
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

export function extractSimData(
  documents: Map<string, Document>,
  entryModule: string,
): SimulatorData {
  const entryDoc = documents.get(entryModule);
  const entryComponent = entryDoc?.components[0]?.name ?? '';
  const documentCommonAst = entryDoc?.common.interactions ?? [];
  const normFor = (doc: Document | undefined): ModuleNormalizer => (module) => {
    if (module == null || doc == null) return module;
    return resolveModuleRef(module, doc) ?? module;
  };
  const documentCommon = documentCommonAst.map((it) => convertInteraction(it, normFor(entryDoc)));

  const modules: Record<string, SimModuleData> = {};
  for (const [moduleName, doc] of documents) {
    const components: Record<string, SimComponent> = {};
    const norm = normFor(doc);
    for (const comp of doc.components) {
      // SPEC「document common」: 実行時に有効な document common はその component が
      // 定義されているファイル自身のもの（entry ファイルのものではない）
      components[comp.name] = convertComponent(comp, doc.common.interactions, norm);
    }
    modules[moduleName] = {
      components,
      docCommonElements: doc.common.elements.map(elementDisplayName),
    };
  }

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

  return {
    modules,
    entryModule,
    entryComponent,
    documentCommon,
    singletons,
    gateTargets: [...gateTargetMap.values()],
  };
}
