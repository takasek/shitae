import type { Action, Document, Component, Interaction, Result } from '@shitae/ast';
import { effectiveResults, mergeInteractions } from '@shitae/resolver';
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

export type SimResultBody = SimTransition | SimEffect | SimOverlay;

/** 同一有効ラベルの result 群 ＝ 1 つの選択肢（選ぶと results が順に全部起こる） */
export interface SimChoice {
  label: string;
  results: SimResultBody[];
}

/**
 * presence gate（`行動(対象?)`）の構造的 presence 判定に要る情報（SPEC「2種類のガード的なもの」・ADR-0002）。
 * - host: 裸参照。host component（この interaction が書かれている component）の現在 variant で判定
 * - member: `対象.要素` 参照。対象インスタンス（targetComponent）の現在 variant で判定
 * - indeterminate: host が存在しない（document common の裸参照。ADR-0012 B7a）等、判定不能 → always-on
 */
export interface SimGate {
  /** 実効 body の alias/ref 名との照合に使う名前 */
  name: string;
  kind: 'host' | 'member' | 'indeterminate';
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
}

export interface SimulatorData {
  modules: Record<string, SimModuleData>;
  entryModule: string;
  entryComponent: string;
  /** document common（最初の # より前）のインタラクション。どの画面でも常に有効（SPEC「document common」） */
  documentCommon: SimInteraction[];
  /** singleton（`#!`）component 名の集合（全モジュール横断。SPEC「singleton component」ADR-0011） */
  singletons: string[];
  /**
   * member gate（`対象.要素?`）の対象 component 名（重複除去。全モジュール横断）。
   * host gate・indeterminate は含めない——手動トグル UI（ADR-0002 Consequence）が
   * 「今どの画面にも表示されていない対象インスタンスの variant」を模擬するための一覧。
   */
  gateTargets: string[];
}

function elementDisplayName(el: import('@shitae/ast').ElementLine): string {
  if (el.alias) return el.alias;
  if (el.value.kind === 'ref') return el.value.name;
  return '{...}';
}

function convertResultBody(r: Result): SimResultBody {
  const { body } = r;
  if (body.kind === 'transition') {
    let target: SimTransition['target'] = null;
    if (body.target) {
      if (body.target.kind === 'variant') {
        target = { kind: 'variant', variant: body.target.name };
      } else {
        target = {
          kind: 'full',
          module: body.target.module ?? null,
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
      module: body.target.module ?? null,
      variant: body.target.variant ?? null,
    };
  } else {
    return { type: 'effect', text: body.text };
  }
}

/**
 * action.target の existsGated から SimGate を組み立てる（SPEC「presence gate」・ADR-0002）。
 * hasHost=false は host component が存在しない文脈（document common。ADR-0012 B7a）— 裸参照は判定不能。
 */
function buildGate(action: Action, hasHost: boolean): SimGate | null {
  const ref = action.target;
  if (!ref || !ref.existsGated) return null;
  if (ref.member === null) {
    return hasHost ? { name: ref.name, kind: 'host' } : { name: ref.name, kind: 'indeterminate' };
  }
  return { name: ref.member, kind: 'member', targetComponent: ref.name, module: ref.module ?? null };
}

function convertInteraction(i: Interaction, hasHost: boolean): SimInteraction {
  const action = i.action;
  const targetPart = action.target ? `(${action.target.name})` : '';
  const prelude: SimResultBody[] = [];
  const choices: SimChoice[] = [];
  for (const { label, result } of effectiveResults(i)) {
    const body = convertResultBody(result);
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
    gate: buildGate(action, hasHost),
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

function convertComponent(comp: Component, documentCommon: Interaction[]): SimComponent {
  const commonElements = comp.common.elements.map(elementDisplayName);
  const commonInteractionsAst = comp.common.interactions;
  const commonInteractions = commonInteractionsAst.map((it) => convertInteraction(it, true));
  const docCommonInteractions = survivingDocCommon(documentCommon, commonInteractionsAst).map(
    (it) => convertInteraction(it, false),
  );
  const variants: Record<string, SimVariant> = {};
  for (const v of comp.variants) {
    // 姿で有効な interaction 一覧 = mergeInteractions(共通, 姿固有)。
    // 同一 (行動, 対象) は姿固有が共通を shadow する
    const effectiveAst = mergeInteractions(commonInteractionsAst, v.body.interactions);
    variants[v.name] = {
      elements: v.body.elements.map(elementDisplayName),
      interactions: effectiveAst.map((it) => convertInteraction(it, true)),
      docCommonInteractions: survivingDocCommon(documentCommon, effectiveAst).map(
        (it) => convertInteraction(it, false),
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

function collectGateTargets(interactions: SimInteraction[], out: Set<string>): void {
  for (const it of interactions) {
    if (it.gate?.kind === 'member' && it.gate.targetComponent) out.add(it.gate.targetComponent);
  }
}

export function extractSimData(
  documents: Map<string, Document>,
  entryModule: string,
): SimulatorData {
  const entryDoc = documents.get(entryModule);
  const entryComponent = entryDoc?.components[0]?.name ?? '';
  const documentCommonAst = entryDoc?.common.interactions ?? [];
  const documentCommon = documentCommonAst.map((it) => convertInteraction(it, false));

  const modules: Record<string, SimModuleData> = {};
  for (const [moduleName, doc] of documents) {
    const components: Record<string, SimComponent> = {};
    for (const comp of doc.components) {
      // SPEC「document common」: 実行時に有効な document common はその component が
      // 定義されているファイル自身のもの（entry ファイルのものではない）
      components[comp.name] = convertComponent(comp, doc.common.interactions);
    }
    modules[moduleName] = { components };
  }

  const singletonSet = new Set<string>();
  for (const doc of documents.values()) {
    for (const name of singletonNames(doc)) singletonSet.add(name);
  }

  const gateTargetSet = new Set<string>();
  collectGateTargets(documentCommon, gateTargetSet);
  for (const mod of Object.values(modules)) {
    for (const comp of Object.values(mod.components)) {
      collectGateTargets(comp.commonInteractions, gateTargetSet);
      collectGateTargets(comp.docCommonInteractions, gateTargetSet);
      for (const v of Object.values(comp.variants)) {
        collectGateTargets(v.interactions, gateTargetSet);
        collectGateTargets(v.docCommonInteractions, gateTargetSet);
      }
    }
  }

  return {
    modules,
    entryModule,
    entryComponent,
    documentCommon,
    singletons: [...singletonSet],
    gateTargets: [...gateTargetSet],
  };
}
