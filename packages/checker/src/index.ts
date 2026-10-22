import type { Document, Component, Body, Diagnostic, Span, Interaction } from '@shitae/ast';
import type { ResolveResult, ProjectResolveResult } from '@shitae/resolver';
import { effectiveResults, resolveModuleRef } from '@shitae/resolver';

/**
 * プロジェクト単位の検査に要る情報（ADR-0021 A2+B2）。渡されたときだけ module 修飾つき参照の
 * cross-module 解決を行う。渡されなければ従来どおり cross-module 参照は skip する（後方互換）。
 */
export interface ProjectCheckContext {
  project: ProjectResolveResult;
}

export function check(
  document: Document,
  resolved: ResolveResult,
  projectCtx?: ProjectCheckContext
): Diagnostic[] {
  const diags: Diagnostic[] = [];

  // singleton 名の集合（同一ファイル内）
  const singletons = singletonNamesOf(resolved);

  // document common: set は対象 component を明示するので host なしでも判定できる。
  // 裸 goto(##X) は host が実行時にしか決まらないため対象外（SPEC「variant の参照は必ず ##」）。
  for (const it of document.common.interactions) {
    checkStateWrites(it, document, resolved, projectCtx, diags);
    checkSingletonCollectionTarget(it, document, singletons, projectCtx, diags);
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
    checkVariantAsComponent(comp.common, document, resolved, projectCtx, diags);
    for (const v of comp.variants) {
      checkVariantAsComponent(v.body, document, resolved, projectCtx, diags);
    }

    // E028: singleton × collection（宣言側要素行・参照側行動対象。ADR-0016）
    checkSingletonCollectionElements(comp.common, singletons, diags);
    for (const v of comp.variants) {
      checkSingletonCollectionElements(v.body, singletons, diags);
    }
    for (const it of interactionsOf(comp)) {
      checkSingletonCollectionTarget(it, document, singletons, projectCtx, diags);
    }

    // W105（goto(##X) の未定義 variant）・W105/E030（set）
    for (const it of interactionsOf(comp)) {
      checkBareVariantGoto(it, comp, document, resolved, projectCtx, diags);
      checkStateWrites(it, document, resolved, projectCtx, diags);
    }

    // W106: singleton への show(X##v)（明示 variant）。ADR-0021 B4
    for (const it of interactionsOf(comp)) {
      checkSingletonExplicitShow(it, document, singletons, projectCtx, diags);
    }
  }

  return diags;
}

/**
 * W106: singleton への show(X##v)（明示 variant）は共有状態の書き換えを伴う
 * （ADR-0021 B4）。show(X)（省略形）・非 singleton への show(X##v) には出さない。
 */
function checkSingletonExplicitShow(
  interaction: Interaction,
  document: Document,
  singletons: Set<string>,
  projectCtx: ProjectCheckContext | undefined,
  diags: Diagnostic[]
): void {
  for (const result of interaction.results) {
    if (result.body.kind !== 'overlay') continue;
    if (result.body.verb !== 'show') continue;
    const { module, name, variant } = result.body.target;
    if (variant === null) continue;

    let targetSingletons: Set<string>;
    if (module === null) {
      targetSingletons = singletons;
    } else {
      const cross = resolveCrossModule(module, document, projectCtx);
      if (!cross) continue; // projectCtx なし・alias/module 未解決なら従来どおり skip
      targetSingletons = singletonNamesOf(cross);
    }

    if (!targetSingletons.has(name)) continue;
    diags.push({
      severity: 'warning',
      code: 'W106',
      message: `show(${name}##${variant}) は singleton の共有状態を書き換える（表示だけなら show(${name})、遷移せず書き換えるなら set(${name}##${variant}) ; show(${name}) に分解できる。「オーバーレイ」参照）`,
      span: result.body.span,
    });
  }
}

/** resolved（ResolveResult）から singleton component 名の集合を作る。 */
function singletonNamesOf(resolved: ResolveResult): Set<string> {
  const names = new Set<string>();
  for (const [name, comp] of resolved.componentIndex) {
    if (comp.singleton) names.add(name);
  }
  return names;
}

/**
 * module 修飾つき参照（alias）を projectCtx 経由で対象モジュールの ResolveResult に解決する。
 * projectCtx が無い・alias が import 表に無い・対象モジュールが存在しない、のいずれかなら
 * undefined（呼び出し側は従来どおり skip する。「判定不能なら素通り」の既定に揃える）。
 */
function resolveCrossModule(
  moduleAlias: string,
  document: Document,
  projectCtx: ProjectCheckContext | undefined
): ResolveResult | undefined {
  if (!projectCtx) return undefined;
  const canonical = resolveModuleRef(moduleAlias, document);
  if (!canonical) return undefined;
  return projectCtx.project.getModule(canonical);
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
  document: Document,
  resolved: ResolveResult,
  projectCtx: ProjectCheckContext | undefined,
  diags: Diagnostic[]
): void {
  for (const interaction of body.interactions) {
    for (const result of interaction.results) {
      if (result.body.kind !== 'transition') continue;
      const target = result.body.target;
      if (!target || target.kind !== 'component') continue;
      let targetResolved: ResolveResult;
      if (target.module === null) {
        targetResolved = resolved;
      } else {
        const cross = resolveCrossModule(target.module, document, projectCtx);
        if (!cross) continue; // projectCtx なし・alias/module 未解決なら従来どおり skip
        targetResolved = cross;
      }
      const name = target.name;
      if (targetResolved.componentIndex.has(name)) continue;
      // variant として存在するか
      for (const [, varMap] of targetResolved.variantIndex) {
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

/**
 * W105: 裸 goto の作用先を結果列の逐次適用に沿って追跡する。
 * back/exit/dismiss/switch の後は履歴依存なので保留し、明示的な遷移で再開する。
 * interaction 開始時は従来の host を使う（包含部品・overlay の呼出元解析は行わない）。
 */
function checkBareVariantGoto(
  interaction: Interaction,
  host: Component,
  document: Document,
  resolved: ResolveResult,
  projectCtx: ProjectCheckContext | undefined,
  diags: Diagnostic[]
): void {
  // null は共通の先行結果。同じラベルが再登場した場合もその経路の続きを適用する。
  const targets = new Map<string | null, Component | undefined>([[null, host]]);
  for (const { label, result } of effectiveResults(interaction)) {
    let active = targets.has(label) ? targets.get(label) : targets.get(null);
    const body = result.body;
    if (body.kind !== 'transition') continue;
    const target = body.target;
    if (body.word === 'goto' && target?.kind === 'variant' && active &&
        !active.variants.some(v => v.name === target.name)) {
      diags.push({
        severity: 'warning',
        code: 'W105',
        message: `goto(##${target.name}) の '${target.name}' は '${active.name}' に定義されていない variant`,
        span: body.span,
      });
    }

    if (body.word === 'back' || body.word === 'exit' ||
        body.word === 'dismiss' || body.word === 'switch') {
      active = undefined;
    } else if (target?.kind === 'component') {
      const targetResolved = target.module === null
        ? resolved : resolveCrossModule(target.module, document, projectCtx);
      active = targetResolved?.componentIndex.get(target.name);
    }
    targets.set(label, active);
  }
}

/** set（state verb）の対象チェック — E030（非 singleton）・W105（未定義 variant）。ADR-0014 */
function checkStateWrites(
  interaction: Interaction,
  document: Document,
  resolved: ResolveResult,
  projectCtx: ProjectCheckContext | undefined,
  diags: Diagnostic[]
): void {
  for (const result of interaction.results) {
    if (result.body.kind !== 'state') continue;
    const { module, name, variant } = result.body.target;
    // set(X)（##variant なし）等、parser がすでに E029 を発報した復帰ノードは
    // variant が必ず空文字になる（正常な set() は name/variant とも必須。
    // parseStateWrite 参照）。E029 発報済みのノードに checker が E030/W105 を
    // 重ねて出すのはノイズなので対象外にする（ADR-0021 A5。findings A5）。
    if (variant === '') continue;

    let targetResolved: ResolveResult;
    let label: string;
    if (module === null) {
      targetResolved = resolved;
      label = name;
    } else {
      const cross = resolveCrossModule(module, document, projectCtx);
      if (!cross) continue; // projectCtx なし・alias/module 未解決なら従来どおり skip
      targetResolved = cross;
      label = `${module}::${name}`;
    }

    const comp = targetResolved.componentIndex.get(name);
    if (!comp) continue; // 未定義 component への set は素通り（ラフさ優先）
    if (!comp.singleton) {
      diags.push({
        severity: 'error',
        code: 'E030',
        message: `set(${label}##${variant}) の '${name}' は singleton ではない（インスタンス独立のため書き込み先が定まらない。#! にするか遷移で書き換える。「singleton component」参照）`,
        span: result.body.span,
      });
      continue;
    }
    if (!comp.variants.some((v) => v.name === variant)) {
      diags.push({
        severity: 'warning',
        code: 'W105',
        message: `set(${label}##${variant}) の '${variant}' は '${name}' に定義されていない variant`,
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
  document: Document,
  singletons: Set<string>,
  projectCtx: ProjectCheckContext | undefined,
  diags: Diagnostic[]
): void {
  const ref = interaction.action.target;
  if (!ref || !ref.collection) return;

  let targetSingletons: Set<string>;
  if (ref.module === null) {
    targetSingletons = singletons;
  } else {
    const cross = resolveCrossModule(ref.module, document, projectCtx);
    if (!cross) return; // projectCtx なし・alias/module 未解決なら従来どおり skip
    targetSingletons = singletonNamesOf(cross);
  }

  if (targetSingletons.has(ref.name)) {
    diags.push({
      severity: 'error',
      code: 'E028',
      message: `singleton '${ref.name}' に collection の * は付けられない（単一インスタンス。「singleton component」参照）`,
      span: ref.span,
    });
  }
}
