import type { Document, Component, Variation, ElementLine } from '@shitae/ast';

export interface ProjectResolveResult {
  modules: Map<string, ResolveResult>;
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
  // documentModule → (alias → targetModule)
  const aliasMap = new Map<string, Map<string, string>>();

  for (const [moduleName, doc] of documents) {
    modules.set(moduleName, resolve(doc));
    const aliases = new Map<string, string>();
    for (const imp of doc.imports) {
      aliases.set(imp.alias, imp.module);
    }
    aliasMap.set(moduleName, aliases);
  }

  return {
    modules,
    getByAlias(importingModule: string, alias: string): ResolveResult | undefined {
      const targetModule = aliasMap.get(importingModule)?.get(alias);
      if (!targetModule) return undefined;
      return modules.get(targetModule);
    },
  };
}
