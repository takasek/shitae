import type { Document, Action, Interaction, NavTarget } from '@shitae/ast';
import { effectiveResults, mergeInteractions } from '@shitae/resolver';

export function toMermaid(document: Document): string {
  const lines: string[] = ['flowchart LR'];
  const idMap = buildIdMap(document);

  // ノード定義
  for (const comp of document.components) {
    const baseId = idMap.get(comp.name)!;
    if (comp.variations.length === 0) {
      lines.push(`  ${baseId}["# ${comp.name}"]`);
    } else {
      const groupId = baseId + '_group';
      lines.push(`  subgraph ${groupId}["# ${comp.name}"]`);
      for (const v of comp.variations) {
        lines.push(`    ${nodeId(idMap, comp.name, v.name)}["## ${v.name}"]`);
      }
      lines.push('  end');
    }
  }

  lines.push('');

  // エッジ定義。姿を持つ component は、共通と姿固有を shadow 合成した
  // interaction 群を各姿ノードから出す（共通だけのベースノードは存在しない）
  for (const comp of document.components) {
    if (comp.variations.length === 0) {
      emitEdges(comp.common.interactions, comp.name, null, comp.name, document, idMap, lines);
    } else {
      for (const v of comp.variations) {
        const merged = mergeInteractions(comp.common.interactions, v.body.interactions);
        emitEdges(merged, comp.name, v.name, comp.name, document, idMap, lines);
      }
    }
  }

  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[\s#()/:\.@\[\]";,{}]/g, '_');
}

function buildIdMap(document: Document): Map<string, string> {
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();

  for (const comp of document.components) {
    const base = sanitizeId(comp.name);
    let id = base;
    let counter = 2;
    while (usedIds.has(id)) {
      id = base + '_' + counter++;
    }
    usedIds.add(id);
    idMap.set(comp.name, id);
  }
  return idMap;
}

function nodeId(idMap: Map<string, string>, componentName: string, variationName?: string): string {
  const base = idMap.get(componentName) ?? sanitizeId(componentName);
  return variationName ? `${base}_${sanitizeId(variationName)}` : base;
}

function navTargetToNodeId(
  target: NavTarget,
  currentComponentName: string,
  document: Document,
  idMap: Map<string, string>
): string {
  if (target.kind === 'variation') {
    return nodeId(idMap, currentComponentName, target.name);
  }
  // kind === 'component'
  if (target.module !== null) {
    // cross-file ref: use module__name to distinguish from local nodes
    const crossId = sanitizeId(target.module + '__' + target.name);
    return target.variation ? `${crossId}_${sanitizeId(target.variation)}` : crossId;
  }
  if (target.variation) {
    return nodeId(idMap, target.name, target.variation);
  }
  // variation 指定なしでも、対象コンポーネントが variation を持つなら最初の variation へ
  const comp = document.components.find(c => c.name === target.name);
  if (comp && comp.variations.length > 0) {
    return nodeId(idMap, target.name, comp.variations[0].name);
  }
  return nodeId(idMap, target.name);
}

function actionLabel(action: Action): string {
  const targetPart = action.target ? `(${action.target.name})` : '';
  return `${action.text}${targetPart}`;
}

function emitEdges(
  interactions: Interaction[],
  componentName: string,
  variationName: string | null,
  currentComponentName: string,
  document: Document,
  idMap: Map<string, string>,
  lines: string[]
): void {
  const fromId = variationName
    ? nodeId(idMap, componentName, variationName)
    : (idMap.get(componentName) ?? sanitizeId(componentName));

  for (const interaction of interactions) {
    const baseLabel = actionLabel(interaction.action);

    // ラベルは「次のラベルまで」スコープ — 有効ラベルを継承展開して読む
    for (const { label: effLabel, result } of effectiveResults(interaction)) {
      if (result.body.kind !== 'transition') continue;
      const tr = result.body;
      if (!tr.target) continue;
      const toId = navTargetToNodeId(tr.target, currentComponentName, document, idMap);
      const label = effLabel ? `[${effLabel}]${baseLabel}` : baseLabel;
      const safeLabel = label.replace(/"/g, '#quot;');
      lines.push(`  ${fromId} -->|"${safeLabel}"| ${toId}`);
    }
  }
}
