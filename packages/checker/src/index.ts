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

  const scope: ModuleScope = {
    resolved,
    imported(alias) {
      const canonical = resolveModuleRef(alias, document);
      return canonical ? importedScope(canonical, projectCtx) : undefined;
    },
  };

  // すべての single-body に同じ検査を適用する。component ごとの診断順は保つ。
  // document common は字句 host を持たないので、裸 goto の対象だけ推定しない。
  function checkBodies(bodies: Array<{ body: Body; label: string }>, host?: Component): void {
    for (const { body, label } of bodies) checkDuplicateAlias(body, label, diags);
    for (const { body } of bodies) checkVariantAsComponent(body, scope, diags);
    for (const { body } of bodies) checkSingletonCollections(body, scope, diags);
    for (const { body } of bodies) {
      for (const interaction of body.interactions) {
        if (host) checkBareVariantGoto(interaction, host, scope, diags);
        checkStateWrites(interaction, scope, diags);
      }
    }
    for (const { body } of bodies) {
      for (const interaction of body.interactions) {
        checkSingletonExplicitShow(interaction, scope, diags);
      }
    }
  }

  checkBodies([{ body: document.common, label: 'document common' }]);

  for (const comp of document.components) {
    const bodies = [
      { body: comp.common, label: comp.name },
      ...comp.variants.map(v => ({ body: v.body, label: `${comp.name}##${v.name}` })),
    ];
    if (bodies.every(({ body }) => body.elements.length === 0 && body.interactions.length === 0)) {
      diags.push({
        severity: 'warning',
        code: 'W103',
        message: `component '${comp.name}' は要素もインタラクションも持たない`,
        span: comp.span,
      });
    }

    checkBodies(bodies, comp);
  }

  return diags;
}

/**
 * W106: singleton への show(X##v)（明示 variant）は共有状態の書き換えを伴う
 * （ADR-0021 B4）。show(X)（省略形）・非 singleton への show(X##v) には出さない。
 */
function checkSingletonExplicitShow(
  interaction: Interaction,
  scope: ModuleScope,
  diags: Diagnostic[]
): void {
  for (const result of interaction.results) {
    if (result.body.kind !== 'overlay') continue;
    if (result.body.verb !== 'show') continue;
    const { name, variant } = result.body.target;
    if (variant === null) continue;

    if (!componentDefinition(result.body.target, scope)?.component.singleton) continue;
    diags.push({
      severity: 'warning',
      code: 'W106',
      message: `show(${name}##${variant}) は singleton の共有状態を書き換える（表示だけなら show(${name})、遷移せず書き換えるなら set(${name}##${variant}) ; show(${name}) に分解できる。「オーバーレイ」参照）`,
      span: result.body.span,
    });
  }
}

function checkDuplicateAlias(body: Body, label: string, diags: Diagnostic[]): void {
  const seen = new Set<string>();
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
      seen.add(el.alias);
    }
  }
}

function checkVariantAsComponent(
  body: Body,
  scope: ModuleScope,
  diags: Diagnostic[]
): void {
  for (const interaction of body.interactions) {
    for (const result of interaction.results) {
      if (result.body.kind !== 'transition') continue;
      const target = result.body.target;
      if (!target || target.kind !== 'component') continue;
      const targetResolved = scopeFor(target.module, scope)?.resolved;
      const name = target.name;
      if (!targetResolved || targetResolved.componentIndex.has(name)) continue;
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
  scope: ModuleScope,
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
      active = componentDefinition(target, scope)?.component;
    }
    targets.set(label, active);
  }
}

/** set（state verb）の対象チェック — E030（非 singleton）・W105（未定義 variant）。ADR-0014 */
function checkStateWrites(
  interaction: Interaction,
  scope: ModuleScope,
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

    const comp = componentDefinition(result.body.target, scope)?.component;
    if (!comp) continue; // 未定義 component への set は素通り（ラフさ優先）
    const label = module === null ? name : `${module}::${name}`;
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

/** import alias は参照を書いた定義ファイルで解決する。 */
interface ModuleScope {
  resolved: ResolveResult;
  imported(alias: string): ModuleScope | undefined;
}

function importedScope(
  canonical: string,
  projectCtx: ProjectCheckContext | undefined
): ModuleScope | undefined {
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
      return name === undefined ? undefined : importedScope(name, projectCtx);
    },
  };
}

function scopeFor(module: string | null, scope: ModuleScope): ModuleScope | undefined {
  return module === null ? scope : scope.imported(module);
}

function componentDefinition(ref: Pick<Ref, 'module' | 'name'>, scope: ModuleScope) {
  const targetScope = scopeFor(ref.module, scope);
  if (!targetScope) return undefined;
  const component = targetScope.resolved.componentIndex.get(ref.name);
  return component ? { component, scope: targetScope } : undefined;
}

/** 要素宣言と行動対象の * を、名前の一致ではなく参照先の定義で検査する。 */
function checkSingletonCollections(body: Body, scope: ModuleScope, diags: Diagnostic[]): void {
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
        report(componentDefinition(el.value, scope)?.component, el.span);
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
      if (target.kind !== 'inline') report(componentDefinition(target, scope)?.component, ref.span);
      continue;
    }

    if (target.kind === 'inline') {
      const member = target.elements.find(el => el.alias === ref.member);
      if (member?.value.kind === 'ref') report(componentDefinition(member.value, scope)?.component, ref.span);
      continue;
    }

    const owner = componentDefinition(target, scope);
    if (!owner) continue;
    // member は参照先の現在 variant の実効 body で解決される。静的検査では各 variant を
    // 調べ、singleton を指す経路があれば元の行動対象に一度だけ報告する。
    const { component, scope: ownerScope } = owner;
    const bodies = component.variants.length ? component.variants.map(v => v.body) : [component.common];
    for (const variantBody of bodies) {
      const member = variantBody.elements.find(el => el.alias === ref.member)
        ?? component.common.elements.find(el => el.alias === ref.member);
      const definition = member?.value.kind === 'ref'
        ? componentDefinition(member.value, ownerScope)?.component : undefined;
      if (definition?.singleton) {
        report(definition, ref.span);
        break;
      }
    }
  }
}
