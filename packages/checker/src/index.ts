import type { Document, Component, Body, Diagnostic, Span, Interaction } from '@shitae/ast';
import type { ResolveResult } from '@shitae/resolver';

export function check(document: Document, resolved: ResolveResult): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // singleton 名の集合（同一ファイル内。cross-module 参照はローカルに判定できないので対象外）
  const singletons = new Set(
    document.components.filter((c) => c.singleton).map((c) => c.name)
  );

  // document common: set は対象 component を明示するので host なしでも判定できる。
  // 裸 goto(##X) は host が実行時にしか決まらないため対象外（SPEC「variant の参照は必ず ##」）。
  for (const it of document.common.interactions) {
    checkStateWrites(it, document, resolved, diags);
    checkSingletonCollectionTarget(it, singletons, diags);
  }
  checkSingletonCollectionElements(document.common, singletons, diags);

  for (const comp of document.components) {
    // W103: empty body
    const totalElements =
      comp.common.elements.length +
      comp.variants.reduce((n, v) => n + v.body.elements.length, 0);
    const totalInteractions =
      comp.common.interactions.length +
      comp.variants.reduce((n, v) => n + v.body.interactions.length, 0);
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
    for (const v of comp.variants) {
      checkDuplicateAlias(v.body, `${comp.name}##${v.name}`, diags);
    }

    // W102: variant-as-component in nav targets
    checkVariantAsComponent(comp.common, resolved, diags);
    for (const v of comp.variants) {
      checkVariantAsComponent(v.body, resolved, diags);
    }

    // E028: singleton × collection（宣言側要素行・参照側行動対象。ADR-0016）
    checkSingletonCollectionElements(comp.common, singletons, diags);
    for (const v of comp.variants) {
      checkSingletonCollectionElements(v.body, singletons, diags);
    }
    for (const it of interactionsOf(comp)) {
      checkSingletonCollectionTarget(it, singletons, diags);
    }

    // W105（goto(##X) の未定義 variant）・W105/E030（set）
    for (const it of interactionsOf(comp)) {
      checkBareVariantGoto(it, comp, diags);
      checkStateWrites(it, document, resolved, diags);
    }
  }

  return diags;
}

function* interactionsOf(comp: Component): Generator<Interaction> {
  yield* comp.common.interactions;
  for (const v of comp.variants) yield* v.body.interactions;
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

function checkVariantAsComponent(
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
      // variant として存在するか
      for (const [, varMap] of resolved.variantIndex) {
        if (varMap.has(name)) {
          diags.push({
            severity: 'warning',
            code: 'W102',
            message: `'${name}' は component ではなく variant 名。goto(##${name}) を意図していませんか？`,
            span: result.body.span,
          });
          break;
        }
      }
    }
  }
}

/** W105（goto(##X) — 裸 variant が host component に定義されていない。SPEC「診断コード」） */
function checkBareVariantGoto(
  interaction: Interaction,
  host: Component,
  diags: Diagnostic[]
): void {
  const variantNames = new Set(host.variants.map((v) => v.name));
  for (const result of interaction.results) {
    if (result.body.kind !== 'transition') continue;
    if (result.body.word !== 'goto') continue;
    const target = result.body.target;
    if (!target || target.kind !== 'variant') continue;
    if (!variantNames.has(target.name)) {
      diags.push({
        severity: 'warning',
        code: 'W105',
        message: `goto(##${target.name}) の '${target.name}' は '${host.name}' に定義されていない variant`,
        span: result.body.span,
      });
    }
  }
}

/** set（state verb）の対象チェック — E030（非 singleton）・W105（未定義 variant）。ADR-0014 */
function checkStateWrites(
  interaction: Interaction,
  document: Document,
  resolved: ResolveResult,
  diags: Diagnostic[]
): void {
  for (const result of interaction.results) {
    if (result.body.kind !== 'state') continue;
    const { module, name, variant } = result.body.target;
    if (module !== null) continue; // cross-module refs are not locally checkable
    // set(X)（##variant なし）等、parser がすでに E029 を発報した復帰ノードは
    // variant が必ず空文字になる（正常な set() は name/variant とも必須。
    // parseStateWrite 参照）。E029 発報済みのノードに checker が E030/W105 を
    // 重ねて出すのはノイズなので対象外にする（ADR-0021 A5。findings A5）。
    if (variant === '') continue;
    const comp = resolved.componentIndex.get(name);
    if (!comp) continue; // 未定義 component への set は素通り（ラフさ優先）
    if (!comp.singleton) {
      diags.push({
        severity: 'error',
        code: 'E030',
        message: `set(${name}##${variant}) の '${name}' は singleton ではない（インスタンス独立のため書き込み先が定まらない。#! にするか遷移で書き換える。「singleton component」参照）`,
        span: result.body.span,
      });
      continue;
    }
    if (!comp.variants.some((v) => v.name === variant)) {
      diags.push({
        severity: 'warning',
        code: 'W105',
        message: `set(${name}##${variant}) の '${variant}' は '${name}' に定義されていない variant`,
        span: result.body.span,
      });
    }
  }
}

/** E028: singleton を collection 宣言した要素行（*バッジ / *手札: バッジ）。ADR-0016 */
function checkSingletonCollectionElements(
  body: Body,
  singletons: Set<string>,
  diags: Diagnostic[]
): void {
  for (const el of body.elements) {
    if (!el.collection) continue;
    if (el.value.kind !== 'ref') continue;
    if (singletons.has(el.value.name)) {
      diags.push({
        severity: 'error',
        code: 'E028',
        message: `singleton '${el.value.name}' に collection の * は付けられない（単一インスタンス。「singleton component」参照）`,
        span: el.span,
      });
    }
  }
}

/** E028: singleton への collection 参照（行動対象 *バッジ）。ADR-0016 */
function checkSingletonCollectionTarget(
  interaction: Interaction,
  singletons: Set<string>,
  diags: Diagnostic[]
): void {
  const ref = interaction.action.target;
  if (!ref || !ref.collection || ref.module !== null) return;
  if (singletons.has(ref.name)) {
    diags.push({
      severity: 'error',
      code: 'E028',
      message: `singleton '${ref.name}' に collection の * は付けられない（単一インスタンス。「singleton component」参照）`,
      span: ref.span,
    });
  }
}
