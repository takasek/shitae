import type { Document, Component, Variation, ElementLine } from '@shitae/ast';

export interface ResolveResult {
  /** component name → Component ノード */
  componentIndex: Map<string, Component>;
  /** component name → (variation name → Variation ノード) */
  variationIndex: Map<string, Map<string, Variation>>;
  /** component name → (alias → ElementLine ノード) */
  elementIndex: Map<string, Map<string, ElementLine>>;
}

export function resolve(document: Document): ResolveResult {
  const componentIndex = new Map<string, Component>();
  const variationIndex = new Map<string, Map<string, Variation>>();
  const elementIndex = new Map<string, Map<string, ElementLine>>();

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
  }

  return { componentIndex, variationIndex, elementIndex };
}
