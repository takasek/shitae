import type { Document, Component, Variation, ElementLine, Interaction, Result, Reference, Action } from '@shitae/ast';

export interface ProjectResolveResult {
  modules: Map<string, ResolveResult>;
  getModule(moduleName: string): ResolveResult | undefined;
  getByAlias(importingModule: string, alias: string): ResolveResult | undefined;
}

export interface ResolveResult {
  /** component name → Component ノード */
  componentIndex: Map<string, Component>;
  /** component name → (variation name → Variation ノード) */
  variationIndex: Map<string, Map<string, Variation>>;
  /** component name → (alias → ElementLine ノード)。common優先・重複はcommonが勝つ */
  elementIndex: Map<string, Map<string, ElementLine>>;
  /**
   * component name → (body key → (alias → ElementLine))
   * body key: null = common body、string = variation name
   * common と variation で同名 alias があっても両方独立して参照できる
   */
  bodyElementIndex: Map<string, Map<string | null, Map<string, ElementLine>>>;
}

export function resolve(document: Document): ResolveResult {
  const componentIndex = new Map<string, Component>();
  const variationIndex = new Map<string, Map<string, Variation>>();
  const elementIndex = new Map<string, Map<string, ElementLine>>();
  const bodyElementIndex = new Map<string, Map<string | null, Map<string, ElementLine>>>();

  for (const comp of document.components) {
    // 重複定義は最初のものを使う（パーサが E005 を出している）
    if (!componentIndex.has(comp.name)) {
      componentIndex.set(comp.name, comp);
    }

    const varMap = new Map<string, Variation>();
    for (const v of comp.variations) {
      if (!varMap.has(v.name)) varMap.set(v.name, v);
    }
    variationIndex.set(comp.name, varMap);

    // elementIndex: flat map、common 優先
    const elemMap = new Map<string, ElementLine>();
    for (const el of comp.common.elements) {
      if (el.alias) elemMap.set(el.alias, el);
    }
    for (const v of comp.variations) {
      for (const el of v.body.elements) {
        if (el.alias && !elemMap.has(el.alias)) elemMap.set(el.alias, el);
      }
    }
    elementIndex.set(comp.name, elemMap);

    // bodyElementIndex: per-body、同名 alias も独立して保持
    const bodyMap = new Map<string | null, Map<string, ElementLine>>();
    const commonElemMap = new Map<string, ElementLine>();
    for (const el of comp.common.elements) {
      if (el.alias) commonElemMap.set(el.alias, el);
    }
    bodyMap.set(null, commonElemMap);
    for (const v of comp.variations) {
      const varElemMap = new Map<string, ElementLine>();
      for (const el of v.body.elements) {
        if (el.alias) varElemMap.set(el.alias, el);
      }
      bodyMap.set(v.name, varElemMap);
    }
    bodyElementIndex.set(comp.name, bodyMap);
  }

  return { componentIndex, variationIndex, elementIndex, bodyElementIndex };
}

export function resolveProject(documents: Map<string, Document>): ProjectResolveResult {
  const modules = new Map<string, ResolveResult>();
  for (const [moduleName, doc] of documents) {
    modules.set(moduleName, resolve(doc));
  }

  return {
    modules,
    getModule(moduleName: string): ResolveResult | undefined {
      return modules.get(moduleName);
    },
    getByAlias(importingModule: string, alias: string): ResolveResult | undefined {
      const imp = documents.get(importingModule)?.imports.find(i => i.alias === alias);
      if (!imp) return undefined;
      return modules.get(imp.module);
    },
  };
}

/**
 * Compute effective labels for results in an interaction by carrying forward
 * the most recent explicit label through subsequent unlabeled results.
 *
 * According to SPEC ("未定・分岐"), a [label] applies to itself and all
 * subsequent results until a different label appears. This function propagates
 * that semantic forward.
 */
export function effectiveResults(
  interaction: Interaction,
): Array<{ label: string | null; result: Result }> {
  let currentLabel: string | null = null;
  const effective: Array<{ label: string | null; result: Result }> = [];

  for (const result of interaction.results) {
    if (result.label !== null) {
      currentLabel = result.label;
    }
    effective.push({
      label: currentLabel,
      result,
    });
  }

  return effective;
}

/**
 * Merge common interactions with variation-specific interactions,
 * respecting the shadowing rule: when an interaction's (action.text, target)
 * exactly match between common and specific, the specific one shadows the common.
 *
 * Returns: all specific interactions + all common interactions not shadowed.
 * Order: survived common first, then all specific.
 */
export function mergeInteractions(
  common: Interaction[],
  specific: Interaction[],
): Interaction[] {
  // Helper: check if two references are equal (ignoring existsGated)
  const referencesEqual = (a: Reference | null, b: Reference | null): boolean => {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    return a.module === b.module && a.name === b.name && a.member === b.member;
  };

  // Helper: check if two interactions shadow each other
  const actionMatches = (act1: Action, act2: Action): boolean => {
    return (
      act1.text === act2.text &&
      referencesEqual(act1.target, act2.target)
    );
  };

  // Find which common interactions are shadowed
  const shadowedIndices = new Set<number>();
  for (let i = 0; i < common.length; i++) {
    for (const spec of specific) {
      if (actionMatches(common[i].action, spec.action)) {
        shadowedIndices.add(i);
        break;
      }
    }
  }

  // Collect survived common + all specific
  const result: Interaction[] = [];
  for (let i = 0; i < common.length; i++) {
    if (!shadowedIndices.has(i)) {
      result.push(common[i]);
    }
  }
  result.push(...specific);

  return result;
}
