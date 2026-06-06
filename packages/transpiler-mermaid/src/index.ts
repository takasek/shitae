import type { Document, Body, Interaction, Action, NavTarget, Result } from '@shitae/ast';

export function toMermaid(document: Document): string {
  const lines: string[] = ['flowchart LR'];

  // ノード定義
  for (const comp of document.components) {
    if (comp.variations.length === 0) {
      lines.push(`  ${sanitizeId(comp.name)}["# ${comp.name}"]`);
    } else {
      const groupId = sanitizeId(comp.name) + '_group';
      lines.push(`  subgraph ${groupId}["# ${comp.name}"]`);
      for (const v of comp.variations) {
        lines.push(`    ${nodeId(comp.name, v.name)}["## ${v.name}"]`);
      }
      lines.push('  end');
    }
  }

  lines.push('');

  // エッジ定義
  for (const comp of document.components) {
    // common body のエッジ
    emitEdges(comp.common, comp.name, null, comp.name, document, lines);

    // 各 variation のエッジ
    for (const v of comp.variations) {
      emitEdges(v.body, comp.name, v.name, comp.name, document, lines);
    }
  }

  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[\s#()/:\.@\[\]";,{}]/g, '_');
}

function nodeId(componentName: string, variationName?: string): string {
  const base = sanitizeId(componentName);
  return variationName ? `${base}_${sanitizeId(variationName)}` : base;
}

function navTargetToNodeId(
  target: NavTarget,
  currentComponentName: string,
  document: Document
): string {
  if (target.kind === 'variation') {
    return nodeId(currentComponentName, target.name);
  }
  // kind === 'component'
  if (target.variation) {
    return nodeId(target.name, target.variation);
  }
  // variation 指定なしでも、対象コンポーネントが variation を持つなら最初の variation へ
  const comp = document.components.find(c => c.name === target.name);
  if (comp && comp.variations.length > 0) {
    return nodeId(target.name, comp.variations[0].name);
  }
  return nodeId(target.name);
}

function actionLabel(action: Action): string {
  const targetPart = action.target ? `(${action.target.name})` : '';
  return `${action.text}${targetPart}`;
}

function emitEdges(
  body: Body,
  componentName: string,
  variationName: string | null,
  currentComponentName: string,
  document: Document,
  lines: string[]
): void {
  const fromId = variationName
    ? nodeId(componentName, variationName)
    : sanitizeId(componentName);

  for (const interaction of body.interactions) {
    const baseLabel = actionLabel(interaction.action);

    for (const result of interaction.results) {
      if (result.body.kind !== 'transition') continue;
      const tr = result.body;
      if (!tr.target) continue;
      const toId = navTargetToNodeId(tr.target, currentComponentName, document);
      const label = result.label ? `[${result.label}]${baseLabel}` : baseLabel;
      const safeLabel = label.replace(/"/g, '#quot;');
      lines.push(`  ${fromId} -->|"${safeLabel}"| ${toId}`);
    }
  }
}
