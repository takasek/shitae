import type { Document, Component, Interaction, Result } from '@shitae/ast';
import { effectiveResults, mergeInteractions } from '@shitae/resolver';

export interface SimTransition {
  type: 'transition';
  word: string;
  target:
    | { kind: 'full'; module: string | null; component: string; variation: string | null }
    | { kind: 'variation'; variation: string }
    | null;
  session: string | null;
}

export interface SimEffect {
  type: 'effect';
  text: string;
}

export type SimResultBody = SimTransition | SimEffect;

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

export interface SimVariation {
  elements: string[];
  interactions: SimInteraction[];
}

export interface SimComponent {
  commonElements: string[];
  commonInteractions: SimInteraction[];
  variations: Record<string, SimVariation>;
}

export interface SimModuleData {
  components: Record<string, SimComponent>;
}

export interface SimulatorData {
  modules: Record<string, SimModuleData>;
  entryModule: string;
  entryComponent: string;
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
      if (body.target.kind === 'variation') {
        target = { kind: 'variation', variation: body.target.name };
      } else {
        target = {
          kind: 'full',
          module: body.target.module ?? null,
          component: body.target.name,
          variation: body.target.variation ?? null,
        };
      }
    }
    return {
      type: 'transition',
      word: body.word,
      target,
      session: body.session?.name ?? null,
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
      const last = choices[choices.length - 1];
      if (last && last.label === label) {
        last.results.push(body);
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

function convertComponent(comp: Component): SimComponent {
  const commonElements = comp.common.elements.map(elementDisplayName);
  const commonInteractions = comp.common.interactions.map(convertInteraction);
  const variations: Record<string, SimVariation> = {};
  for (const v of comp.variations) {
    variations[v.name] = {
      elements: v.body.elements.map(elementDisplayName),
      // 姿で有効な interaction 一覧 = mergeInteractions(共通, 姿固有)。
      // 同一 (行動, 対象) は姿固有が共通を shadow する
      interactions: mergeInteractions(comp.common.interactions, v.body.interactions).map(
        convertInteraction,
      ),
    };
  }
  return { commonElements, commonInteractions, variations };
}

export function extractSimData(
  documents: Map<string, Document>,
  entryModule: string,
): SimulatorData {
  const modules: Record<string, SimModuleData> = {};
  for (const [moduleName, doc] of documents) {
    const components: Record<string, SimComponent> = {};
    for (const comp of doc.components) {
      components[comp.name] = convertComponent(comp);
    }
    modules[moduleName] = { components };
  }

  const entryDoc = documents.get(entryModule);
  const entryComponent = entryDoc?.components[0]?.name ?? '';

  return { modules, entryModule, entryComponent };
}
