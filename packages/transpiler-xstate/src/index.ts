import type {
  Document,
  Component,
  Interaction,
  Result,
  Action,
  NavTarget,
} from '@shitae/ast';
import { effectiveResults, mergeInteractions } from '@shitae/resolver';

export interface XStateOptions {
  id?: string;
}

// ───── state ID helpers ───────────────────────────────────────────────

function stateId(componentName: string, variantName?: string | null): string {
  if (variantName) return `${componentName}__${variantName}`;
  return componentName;
}

interface StateDefinition {
  id: string;
  interactions: Interaction[];
}

function componentStates(comp: Component): StateDefinition[] {
  const common = comp.common.interactions;
  if (comp.variants.length === 0) return [{ id: comp.name, interactions: common }];
  return comp.variants.map(variant => ({
    id: stateId(comp.name, variant.name),
    interactions: mergeInteractions(common, variant.body.interactions),
  }));
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
  sourceId: string,
  doc: Document,
): string {
  if (target.kind === 'variant') {
    return stateId(sourceId.split('__', 1)[0]!, target.name);
  }
  // kind === 'component'
  if (target.module !== null) {
    // cross-file: use module__name
    const base = `${target.module}__${target.name}`;
    return target.variant ? `${base}__${target.variant}` : base;
  }
  if (target.variant) {
    return stateId(target.name, target.variant);
  }
  // No variant specified — resolve to first variant if component has variants
  const comp = doc.components.find((c) => c.name === target.name);
  if (comp && comp.variants.length > 0) {
    return stateId(target.name, comp.variants[0]!.name);
  }
  return stateId(target.name);
}

// ───── push/present predecessors map ─────────────────────────────────

function buildPredecessors(states: StateDefinition[], doc: Document): Map<string, string[]> {
  const pred = new Map<string, string[]>();

  for (const { id: sourceId, interactions } of states) {
    for (const interaction of interactions) {
      for (const result of interaction.results) {
        if (result.body.kind !== 'transition') continue;
        const tr = result.body;
        if (tr.word !== 'push' && tr.word !== 'present') continue;
        if (!tr.target) continue;
        const targetId = resolveNavTarget(tr.target, sourceId, doc);
        const list = pred.get(targetId) ?? [];
        if (!list.includes(sourceId)) list.push(sourceId);
        pred.set(targetId, list);
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

  // overlay（show / hide）は frame 木・遷移グラフを操作しないので、
  // xstate の状態遷移としては空アクション扱いにする（SPEC「オーバーレイ」）。
  if (body.kind === 'overlay') {
    return [`${ind(4)}{} /* ${body.verb}(${body.target.name}) */`];
  }

  // state verb（set）も frame 木・遷移グラフを操作しない（ADR-0014）。
  if (body.kind === 'state') {
    return [`${ind(4)}{} /* ${body.verb}(${body.target.name}##${body.target.variant}) */`];
  }

  // transition
  const tr = body;
  const word = tr.word;

  if (word === 'goto' || word === 'push' || word === 'present') {
    if (!tr.target) return [`${ind(4)}{}`];
    const targetId = resolveNavTarget(tr.target, sourceId, doc);

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
      const targetId = resolveNavTarget(tr.target, sourceId, doc);
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
  { id: sourceId, interactions }: StateDefinition,
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
  const states = doc.components.flatMap(componentStates);
  const initial = states[0]?.id ?? '';
  const predecessors = buildPredecessors(states, doc);
  const stateNodes = states.map(state => generateStateNode(state, doc, predecessors));

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
