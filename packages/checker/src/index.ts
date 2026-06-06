import type { Document, Body, Diagnostic, Span } from '@shitae/ast';
import type { ResolveResult } from '@shitae/resolver';

export function check(document: Document, resolved: ResolveResult): Diagnostic[] {
  const diags: Diagnostic[] = [];

  for (const comp of document.components) {
    // W103: empty body
    const totalElements =
      comp.common.elements.length +
      comp.variations.reduce((n, v) => n + v.body.elements.length, 0);
    const totalInteractions =
      comp.common.interactions.length +
      comp.variations.reduce((n, v) => n + v.body.interactions.length, 0);
    if (totalElements === 0 && totalInteractions === 0) {
      diags.push({
        severity: 'warning',
        code: 'W103',
        message: `component '${comp.name}' は要素もインタラクションも持たない`,
        span: comp.span,
      });
    }

    // W101: duplicate alias in each body
    checkDuplicateAlias(comp.common, comp.name, diags);
    for (const v of comp.variations) {
      checkDuplicateAlias(v.body, `${comp.name}##${v.name}`, diags);
    }

    // W102: variation-as-component in nav targets
    checkVariationAsComponent(comp.common, resolved, diags);
    for (const v of comp.variations) {
      checkVariationAsComponent(v.body, resolved, diags);
    }
  }

  return diags;
}

function checkDuplicateAlias(body: Body, label: string, diags: Diagnostic[]): void {
  const seen = new Map<string, Span>();
  for (const el of body.elements) {
    if (!el.alias) continue;
    if (seen.has(el.alias)) {
      diags.push({
        severity: 'warning',
        code: 'W101',
        message: `alias '${el.alias}' が '${label}' 内で重複している`,
        span: el.span,
      });
    } else {
      seen.set(el.alias, el.span);
    }
  }
}

function checkVariationAsComponent(
  body: Body,
  resolved: ResolveResult,
  diags: Diagnostic[]
): void {
  for (const interaction of body.interactions) {
    for (const result of interaction.results) {
      if (result.body.kind !== 'transition') continue;
      const target = result.body.target;
      if (!target || target.kind !== 'component') continue;
      if (target.module !== null) continue; // cross-module refs are not locally checkable
      const name = target.name;
      if (resolved.componentIndex.has(name)) continue;
      // variation として存在するか
      for (const [, varMap] of resolved.variationIndex) {
        if (varMap.has(name)) {
          diags.push({
            severity: 'warning',
            code: 'W102',
            message: `'${name}' は component ではなく variation 名。goto(##${name}) を意図していませんか？`,
            span: result.body.span,
          });
          break;
        }
      }
    }
  }
}
