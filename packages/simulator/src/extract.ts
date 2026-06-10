import type { Document, Component, Interaction, Result } from '@shitae/ast';

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

export interface SimResult {
  label: string | null;
  body: SimTransition | SimEffect;
}

export interface SimInteraction {
  actionText: string;
  results: SimResult[];
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

function convertResult(r: Result): SimResult {
  const { label, body } = r;
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
      label,
      body: {
        type: 'transition',
        word: body.word,
        target,
        session: body.session?.name ?? null,
      },
    };
  } else {
    return { label, body: { type: 'effect', text: body.text } };
  }
}

function convertInteraction(i: Interaction): SimInteraction {
  const action = i.action;
  const targetPart = action.target ? `(${action.target.name})` : '';
  return {
    actionText: `${action.text}${targetPart}`,
    results: i.results.map(convertResult),
  };
}

function convertComponent(comp: Component): SimComponent {
  const commonElements = comp.common.elements.map(elementDisplayName);
  const commonInteractions = comp.common.interactions.map(convertInteraction);
  const variations: Record<string, SimVariation> = {};
  for (const v of comp.variations) {
    variations[v.name] = {
      elements: v.body.elements.map(elementDisplayName),
      interactions: v.body.interactions.map(convertInteraction),
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
