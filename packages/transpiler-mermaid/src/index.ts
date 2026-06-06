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
    emitEdges(comp.common, comp.name, null, comp.name, lines);

    // 各 variation のエッジ
    for (const v of comp.variations) {
      emitEdges(v.body, comp.name, v.name, comp.name, lines);
    }
  }

  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[\s#()/:\.@\[\]]/g, '_');
}

function nodeId(componentName: string, variationName?: string): string {
  const base = sanitizeId(componentName);
  return variationName ? `${base}_${sanitizeId(variationName)}` : base;
}

function navTargetToNodeId(target: NavTarget, currentComponentName: string): string {
  if (target.kind === 'variation') {
    return nodeId(currentComponentName, target.name);
  }
  // kind === 'component'
  return target.variation
    ? nodeId(target.name, target.variation)
    : nodeId(target.name);
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
      const toId = navTargetToNodeId(tr.target, currentComponentName);
      const label = result.label ? `[${result.label}]${baseLabel}` : baseLabel;
      // Mermaid の edge ラベル内の " はエスケープ
      const safeLabel = label.replace(/"/g, '#quot;');
      lines.push(`  ${fromId} -->|"${safeLabel}"| ${toId}`);
    }
  }
}
