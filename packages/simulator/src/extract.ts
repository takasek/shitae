import type { Document, Component, Interaction, Result } from '@shitae/ast';
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

export interface SimInteraction {
  actionText: string;
  /** 最初のラベルより前の result 群。常に成立（分岐に依らず順に全部起こる） */
  prelude: SimResultBody[];
  /** 条件ラベル付きの選択肢。ラベル継承（effectiveResults）済み */
  choices: SimChoice[];
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

function convertInteraction(i: Interaction): SimInteraction {
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
  const commonInteractions = commonInteractionsAst.map(convertInteraction);
  const docCommonInteractions = survivingDocCommon(documentCommon, commonInteractionsAst).map(
    convertInteraction,
  );
  const variants: Record<string, SimVariant> = {};
  for (const v of comp.variants) {
    // 姿で有効な interaction 一覧 = mergeInteractions(共通, 姿固有)。
    // 同一 (行動, 対象) は姿固有が共通を shadow する
    const effectiveAst = mergeInteractions(commonInteractionsAst, v.body.interactions);
    variants[v.name] = {
      elements: v.body.elements.map(elementDisplayName),
      interactions: effectiveAst.map(convertInteraction),
      docCommonInteractions: survivingDocCommon(documentCommon, effectiveAst).map(convertInteraction),
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

export function extractSimData(
  documents: Map<string, Document>,
  entryModule: string,
): SimulatorData {
  const entryDoc = documents.get(entryModule);
  const entryComponent = entryDoc?.components[0]?.name ?? '';
  const documentCommonAst = entryDoc?.common.interactions ?? [];
  const documentCommon = documentCommonAst.map(convertInteraction);

  const modules: Record<string, SimModuleData> = {};
  for (const [moduleName, doc] of documents) {
    const components: Record<string, SimComponent> = {};
    for (const comp of doc.components) {
      components[comp.name] = convertComponent(comp, documentCommonAst);
    }
    modules[moduleName] = { components };
  }

  const singletonSet = new Set<string>();
  for (const doc of documents.values()) {
    for (const name of singletonNames(doc)) singletonSet.add(name);
  }

  return { modules, entryModule, entryComponent, documentCommon, singletons: [...singletonSet] };
}
