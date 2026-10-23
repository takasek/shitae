import type { Document, Component, Body, Diagnostic, Span, Interaction, ElementLine, Ref } from '@shitae/ast';
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
  const collectionScope: CollectionScope = {
    resolved,
    imported(alias) {
      const canonical = resolveModuleRef(alias, document);
      return canonical ? importedCollectionScope(canonical, projectCtx) : undefined;
    },
  };

  // すべての single-body に同じ検査を適用する。component ごとの診断順は保つ。
  // document common は字句 host を持たないので、裸 goto の対象だけ推定しない。
  function checkBodies(bodies: Array<{ body: Body; label: string }>, host?: Component): void {
    for (const { body, label } of bodies) checkDuplicateAlias(body, label, diags);
    for (const { body } of bodies) checkVariantAsComponent(body, document, resolved, projectCtx, diags);
    for (const { body } of bodies) checkSingletonCollections(body, collectionScope, diags);
    for (const { body } of bodies) {
      for (const interaction of body.interactions) {
        if (host) checkBareVariantGoto(interaction, host, document, resolved, projectCtx, diags);
        checkStateWrites(interaction, document, resolved, projectCtx, diags);
      }
    }
    for (const { body } of bodies) {
      for (const interaction of body.interactions) {
        checkSingletonExplicitShow(interaction, document, singletons, projectCtx, diags);
      }
    }
  }

  checkBodies([{ body: document.common, label: 'document common' }]);

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

    checkBodies([
      { body: comp.common, label: comp.name },
      ...comp.variants.map(v => ({ body: v.body, label: `${comp.name}##${v.name}` })),
    ], comp);
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
        message: `goto(##${target.name}) の '${target.name}' は '${active.name}' に定義されていない variant（静的検査: 操作開始時は定義元を作用先と仮定し、結果列を逐次追跡。包含部品・overlay の呼出元は解析しない）`,
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

/** E028 の参照元。import alias は参照を書いた定義ファイルで解決する。 */
interface CollectionScope {
  resolved: ResolveResult;
  imported(alias: string): CollectionScope | undefined;
}

function importedCollectionScope(
  canonical: string,
  projectCtx: ProjectCheckContext | undefined
): CollectionScope | undefined {
  const project = projectCtx?.project;
  const resolved = project?.getModule(canonical);
  if (!project || !resolved) return undefined;
  return {
    resolved,
    imported(alias) {
      const target = project.getByAlias(canonical, alias);
      if (!target) return undefined;
      // ProjectResolveResult が保持する正準名を使い、参照元側の import 表を混ぜない。
      const name = [...project.modules].find(([, module]) => module === target)?.[0];
      return name === undefined ? undefined : importedCollectionScope(name, projectCtx);
    },
  };
}

function collectionDefinition(ref: Pick<Ref, 'module' | 'name'>, scope: CollectionScope) {
  const targetScope = ref.module === null ? scope : scope.imported(ref.module);
  const component = targetScope?.resolved.componentIndex.get(ref.name);
  return component && targetScope ? { component, scope: targetScope } : undefined;
}

/** 要素宣言と行動対象の * を、名前の一致ではなく参照先の定義で検査する。 */
function checkSingletonCollections(body: Body, scope: CollectionScope, diags: Diagnostic[]): void {
  function report(component: Component | undefined, span: Span): void {
    if (!component?.singleton) return;
    diags.push({
      severity: 'error',
      code: 'E028',
      message: `singleton '${component.name}' に collection の * は付けられない（単一インスタンス。「singleton component」参照）`,
      span,
    });
  }

  function elements(lines: ElementLine[]): void {
    for (const el of lines) {
      if (el.value.kind === 'inline') {
        // 外側の * は入れ物だけに掛かる。子は各自の宣言を検査する。
        elements(el.value.elements);
      } else if (el.collection) {
        report(collectionDefinition(el.value, scope)?.component, el.span);
      }
    }
  }
  elements(body.elements);

  for (const interaction of body.interactions) {
    const ref = interaction.action.target;
    if (!ref?.collection) continue;
    // alias は interaction の single-body 内だけ。alias の参照先を再び alias として引かない。
    const alias = ref.module === null ? body.elements.find(el => el.alias === ref.name) : undefined;
    const target = alias?.value ?? { kind: 'ref' as const, module: ref.module, name: ref.name, span: ref.span };
    if (ref.member === null) {
      if (target.kind !== 'inline') report(collectionDefinition(target, scope)?.component, ref.span);
      continue;
    }

    if (target.kind === 'inline') {
      const member = target.elements.find(el => el.alias === ref.member);
      if (member?.value.kind === 'ref') report(collectionDefinition(member.value, scope)?.component, ref.span);
      continue;
    }

    const owner = collectionDefinition(target, scope);
    if (!owner) continue;
    // member は参照先の現在 variant の実効 body で解決される。静的検査では各 variant を
    // 調べ、singleton を指す経路があれば元の行動対象に一度だけ報告する。
    const { component, scope: ownerScope } = owner;
    const bodies = component.variants.length ? component.variants.map(v => v.body) : [component.common];
    for (const variantBody of bodies) {
      const member = variantBody.elements.find(el => el.alias === ref.member)
        ?? component.common.elements.find(el => el.alias === ref.member);
      const definition = member?.value.kind === 'ref'
        ? collectionDefinition(member.value, ownerScope)?.component : undefined;
      if (definition?.singleton) {
        report(definition, ref.span);
        break;
      }
    }
  }
}
