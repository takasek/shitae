import type {
  Document,
  Component,
  Interaction,
  Result,
  Action,
  NavTarget,
  Reference,
} from '@shitae/ast';
import { effectiveResults, mergeInteractions } from '@shitae/resolver';

export interface XStateOptions {
  id?: string;
}

// ───── state ID helpers ───────────────────────────────────────────────

function stateId(componentName: string, variationName?: string | null): string {
  if (variationName) return `${componentName}__${variationName}`;
  return componentName;
}

function componentStateIds(comp: Component): string[] {
  if (comp.variations.length === 0) return [stateId(comp.name)];
  return comp.variations.map((v) => stateId(comp.name, v.name));
}

function allStateIds(doc: Document): string[] {
  return doc.components.flatMap(componentStateIds);
}

function initialStateId(doc: Document): string {
  const first = doc.components[0];
  if (!first) return '';
  if (first.variations.length === 0) return stateId(first.name);
  return stateId(first.name, first.variations[0]!.name);
}

// ───── event name ─────────────────────────────────────────────────────

function eventName(action: Action): string {
  if (!action.target) return action.text;
  const ref = action.target;
  const nameWithMember = ref.member ? `${ref.name}.${ref.member}` : ref.name;
  return `${action.text}(${nameWithMember})`;
}

// ───── nav target resolution ──────────────────────────────────────────

function resolveNavTarget(
  target: NavTarget,
  currentComponent: string,
  doc: Document,
): string {
  if (target.kind === 'variation') {
    return stateId(currentComponent, target.name);
  }
  // kind === 'component'
  if (target.module !== null) {
    // cross-file: use module__name
    const base = `${target.module}__${target.name}`;
    return target.variation ? `${base}__${target.variation}` : base;
  }
  if (target.variation) {
    return stateId(target.name, target.variation);
  }
  // No variation specified — resolve to first variation if component has variations
  const comp = doc.components.find((c) => c.name === target.name);
  if (comp && comp.variations.length > 0) {
    return stateId(target.name, comp.variations[0]!.name);
  }
  return stateId(target.name);
}

// ───── push/present predecessors map ─────────────────────────────────

function buildPredecessors(doc: Document): Map<string, string[]> {
  const pred = new Map<string, string[]>();

  function processInteractions(interactions: Interaction[], sourceId: string) {
    for (const interaction of interactions) {
      for (const result of interaction.results) {
        if (result.body.kind !== 'transition') continue;
        const tr = result.body;
        if (tr.word !== 'push' && tr.word !== 'present') continue;
        if (!tr.target) continue;
        const currentComponent = sourceId.includes('__')
          ? sourceId.split('__')[0]!
          : sourceId;
        const targetId = resolveNavTarget(tr.target, currentComponent, doc);
        const list = pred.get(targetId) ?? [];
        if (!list.includes(sourceId)) list.push(sourceId);
        pred.set(targetId, list);
      }
    }
  }

  for (const comp of doc.components) {
    if (comp.variations.length === 0) {
      processInteractions(comp.common.interactions, stateId(comp.name));
    } else {
      for (const v of comp.variations) {
        const sid = stateId(comp.name, v.name);
        // Same shadow merge as state-node generation: a shadowed common
        // push/present must not register a predecessor edge (v2)
        processInteractions(
          mergeInteractions(comp.common.interactions, v.body.interactions),
          sid,
        );
      }
    }
  }

  return pred;
}

// ───── code generation ────────────────────────────────────────────────

function ind(n: number): string {
  return '  '.repeat(n);
}

function q(s: string): string {
  return `'${s}'`;
}

function generateAssignPush(sourceId: string, baseIndent: number): string {
  return (
    `assign({\n` +
    `${ind(baseIndent + 1)}stack: ({ context }: { context: NavigationContext }) => ` +
    `[...context.stack, ${q(sourceId)}],\n` +
    `${ind(baseIndent)}})`
  );
}

function generateAssignPop(baseIndent: number): string {
  return (
    `assign({\n` +
    `${ind(baseIndent + 1)}stack: ({ context }: { context: NavigationContext }) => ` +
    `context.stack.slice(0, -1),\n` +
    `${ind(baseIndent)}})`
  );
}

function generateTransition(
  result: Result,
  sourceId: string,
  doc: Document,
  predecessors: Map<string, string[]>,
): string[] {
  const body = result.body;

  if (body.kind === 'effect') {
    return [`${ind(4)}{}`];
  }

  // transition
  const tr = body;
  const word = tr.word;

  if (word === 'goto' || word === 'push' || word === 'present') {
    if (!tr.target) return [`${ind(4)}{}`];
    const currentComponent = sourceId.includes('__')
      ? sourceId.split('__')[0]!
      : sourceId;
    const targetId = resolveNavTarget(tr.target, currentComponent, doc);

    if (word === 'goto') {
      return [`${ind(4)}{ target: ${q(targetId)} }`];
    }
    // push or present — update stack
    const lines = [
      `${ind(4)}{`,
      `${ind(5)}target: ${q(targetId)},`,
      `${ind(5)}actions: ${generateAssignPush(sourceId, 5)},`,
      `${ind(4)}}`,
    ];
    return [lines.join('\n')];
  }

  if (word === 'back' || word === 'exit' || word === 'dismiss') {
    // If an explicit target is provided (back(X)), treat as goto
    if (tr.target) {
      const currentComponent = sourceId.includes('__')
        ? sourceId.split('__')[0]!
        : sourceId;
      const targetId = resolveNavTarget(tr.target, currentComponent, doc);
      return [`${ind(4)}{ target: ${q(targetId)}, actions: ${generateAssignPop(4)} }`];
    }
    // No explicit target — guard array over predecessors
    const preds = predecessors.get(sourceId) ?? [];
    if (preds.length === 0) {
      return [`${ind(4)}{} /* ${word}() — no known predecessor */`];
    }
    return preds.map((predId) => {
      const lines = [
        `${ind(4)}{`,
        `${ind(5)}guard: ({ context }: { context: NavigationContext }) => context.stack.at(-1) === ${q(predId)},`,
        `${ind(5)}target: ${q(predId)},`,
        `${ind(5)}actions: ${generateAssignPop(5)},`,
        `${ind(4)}}`,
      ];
      return lines.join('\n');
    });
  }

  return [`${ind(4)}{}`];
}

function generateInteractionBlock(
  interactions: Interaction[],
  sourceId: string,
  doc: Document,
  predecessors: Map<string, string[]>,
): string {
  if (interactions.length === 0) return '';

  // Group by event name. Labels follow v2 semantics: a [label] applies to
  // itself and all subsequent unlabeled results (effectiveResults).
  const eventMap = new Map<string, Array<{ label: string | null; result: Result }>>();
  for (const interaction of interactions) {
    const name = eventName(interaction.action);
    const list = eventMap.get(name) ?? [];
    eventMap.set(name, list.concat(effectiveResults(interaction)));
  }

  const eventLines: string[] = [];
  for (const [name, results] of eventMap) {
    const transitions = results.flatMap(({ label, result }) =>
      generateTransition(result, sourceId, doc, predecessors).map((t) =>
        label ? `${t} /* [${label}] */` : t,
      ),
    );
    eventLines.push(
      `${ind(3)}${q(name)}: [\n${transitions.join(',\n')},\n${ind(3)}],`,
    );
  }

  return `${ind(2)}on: {\n${eventLines.join('\n')}\n${ind(2)}},\n`;
}

function generateStateNode(
  sourceId: string,
  interactions: Interaction[],
  doc: Document,
  predecessors: Map<string, string[]>,
): string {
  const inner = generateInteractionBlock(interactions, sourceId, doc, predecessors);
  if (!inner) return `${ind(1)}${q(sourceId)}: {},`;
  return `${ind(1)}${q(sourceId)}: {\n${inner}${ind(1)}},`;
}

// ───── main ───────────────────────────────────────────────────────────

export function toXState(doc: Document, options?: XStateOptions): string {
  const id = options?.id ?? 'app';
  const initial = initialStateId(doc);
  const predecessors = buildPredecessors(doc);

  const stateNodes: string[] = [];

  for (const comp of doc.components) {
    if (comp.variations.length === 0) {
      const sid = stateId(comp.name);
      const interactions = comp.common.interactions;
      stateNodes.push(generateStateNode(sid, interactions, doc, predecessors));
    } else {
      for (const v of comp.variations) {
        const sid = stateId(comp.name, v.name);
        // Common body + variation body, with variation-specific interactions
        // shadowing common ones on (action.text, target) exact match (v2)
        const interactions = mergeInteractions(
          comp.common.interactions,
          v.body.interactions,
        );
        stateNodes.push(generateStateNode(sid, interactions, doc, predecessors));
      }
    }
  }

  const lines = [
    `import { createMachine, assign } from 'xstate';`,
    ``,
    `interface NavigationContext {`,
    `  stack: string[];`,
    `}`,
    ``,
    `export const machine = createMachine({`,
    `  id: ${q(id)},`,
    `  context: { stack: [] } satisfies NavigationContext,`,
    `  initial: ${q(initial)},`,
    `  states: {`,
    stateNodes.join('\n'),
    `  },`,
    `});`,
  ];

  return lines.join('\n');
}
