// ---------------------------------------------------------------------------
// Parser for @shitae/parser
// ---------------------------------------------------------------------------
import type {
  Document,
  Import,
  Component,
  Variation,
  Body,
  ElementLine,
  Ref,
  Inline,
  Interaction,
  Action,
  Reference,
  Result,
  Transition,
  Effect,
  TransitionWord,
  NavTarget,
  Session,
  Span,
  Diagnostic,
} from '@shitae/ast';

import {
  stripComments,
  buildLogicalLines,
  skipWhitespace,
  readName,
  readUntil,
  type LogicalLine,
} from './lexer.js';

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------
interface ComponentBuilder {
  name: string;
  span: Span;
  commonElements: ElementLine[];
  commonInteractions: Interaction[];
  commonHasInteractionSection: boolean;
  variations: Variation[];
}

interface VariationBuilder {
  name: string;
  span: Span;
  elements: ElementLine[];
  interactions: Interaction[];
  hasInteractionSection: boolean;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function parseDocument(source: string): { document: Document; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripComments(source);
  const rawLines = stripped.split('\n');
  const logicalLines = buildLogicalLines(rawLines);

  const imports: Import[] = [];
  const components: Component[] = [];

  let componentBuilder: ComponentBuilder | null = null;
  let variationBuilder: VariationBuilder | null = null;
  let section: 'element' | 'interaction' = 'element';
  let lastInteraction: Interaction | null = null;
  let seenFirstComponent = false;

  function makeSpan(startLine: number): Span {
    // Simple span: offset approximation based on line number
    // We use line number (1-based) and col=0 as approximation
    return { offset: 0, length: 0, line: startLine, col: 0 };
  }

  function finalizeVariation(): void {
    if (variationBuilder && componentBuilder) {
      const v: Variation = {
        name: variationBuilder.name,
        body: {
          elements: variationBuilder.elements,
          interactions: variationBuilder.interactions,
          hasInteractionSection: variationBuilder.hasInteractionSection,
        },
        span: variationBuilder.span,
      };
      // Check duplicate variation
      const dupes = componentBuilder.variations.filter((x) => x.name === v.name);
      if (dupes.length > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'E006',
          message: `重複した variation 定義: '${v.name}'`,
          span: v.span,
        });
      }
      componentBuilder.variations.push(v);
      variationBuilder = null;
    }
  }

  function finalizeComponent(): void {
    if (componentBuilder) {
      const c: Component = {
        name: componentBuilder.name,
        common: {
          elements: componentBuilder.commonElements,
          interactions: componentBuilder.commonInteractions,
          hasInteractionSection: componentBuilder.commonHasInteractionSection,
        },
        variations: componentBuilder.variations,
        span: componentBuilder.span,
      };
      // Check duplicate component
      const dupes = components.filter((x) => x.name === c.name);
      if (dupes.length > 0) {
        diagnostics.push({
          severity: 'error',
          code: 'E005',
          message: `重複した component 定義: '${c.name}'`,
          span: c.span,
        });
      }
      components.push(c);
      componentBuilder = null;
    }
  }

  function currentElements(): ElementLine[] {
    if (variationBuilder) return variationBuilder.elements;
    if (componentBuilder) return componentBuilder.commonElements;
    return [];
  }

  function currentInteractions(): Interaction[] {
    if (variationBuilder) return variationBuilder.interactions;
    if (componentBuilder) return componentBuilder.commonInteractions;
    return [];
  }

  function setHasInteractionSection(): void {
    if (variationBuilder) {
      variationBuilder.hasInteractionSection = true;
    } else if (componentBuilder) {
      componentBuilder.commonHasInteractionSection = true;
    }
  }

  for (const ll of logicalLines) {
    const raw = ll.text;
    const trimmed = raw.trim();
    const span = makeSpan(ll.startLine);

    // Empty line
    if (trimmed === '') {
      // End of result continuation
      lastInteraction = null;
      continue;
    }

    // Component header: "# name"
    if (raw.startsWith('# ') || raw === '#') {
      finalizeVariation();
      finalizeComponent();
      seenFirstComponent = true;
      const name = raw.slice(2).trim();
      componentBuilder = {
        name,
        span,
        commonElements: [],
        commonInteractions: [],
        commonHasInteractionSection: false,
        variations: [],
      };
      variationBuilder = null;
      section = 'element';
      lastInteraction = null;
      continue;
    }

    // Variation header: "## name"
    if (raw.startsWith('## ') || raw === '##') {
      finalizeVariation();
      const name = raw.slice(3).trim();
      variationBuilder = {
        name,
        span,
        elements: [],
        interactions: [],
        hasInteractionSection: false,
      };
      section = 'element';
      lastInteraction = null;
      continue;
    }

    // Section separator: "---" (only hyphens, 3+)
    if (/^-{3,}$/.test(trimmed)) {
      setHasInteractionSection();
      section = 'interaction';
      lastInteraction = null;
      continue;
    }

    // import statement
    if (trimmed.startsWith('import ')) {
      if (seenFirstComponent) {
        diagnostics.push({
          severity: 'error',
          code: 'E004',
          message: 'import は component 定義の前にのみ書けます',
          span,
        });
        // still parse it
      }
      const imp = parseImport(trimmed, span, diagnostics);
      if (imp) imports.push(imp);
      continue;
    }

    // Lines within a component/variation
    if (!componentBuilder) {
      // Outside any component — ignore (or could warn)
      continue;
    }

    if (section === 'element') {
      // Check for -> in element section → W001
      if (trimmed.includes('->')) {
        diagnostics.push({
          severity: 'warning',
          code: 'W001',
          message: '--- の前（要素節）に -> を含む行があります',
          span,
        });
        // Still parse as element? Actually per spec it's a warning; treat as element-line
      }
      const el = parseElementLine(ll, diagnostics);
      if (el) currentElements().push(el);
    } else {
      // interaction section
      if (trimmed.includes('->')) {
        // New interaction
        const interaction = parseInteractionLine(ll, diagnostics);
        if (interaction) {
          currentInteractions().push(interaction);
          lastInteraction = interaction;
        }
      } else {
        // Continuation of previous interaction result list
        if (lastInteraction === null) {
          diagnostics.push({
            severity: 'warning',
            code: 'W002',
            message: 'interaction が開始されていない継続行です',
            span,
          });
        } else {
          // Parse as additional results
          const additionalResults = parseResultList(trimmed, span, diagnostics);
          lastInteraction.results.push(...additionalResults);
        }
      }
    }
  }

  // Finalize last component/variation
  finalizeVariation();
  finalizeComponent();

  return {
    document: { imports, components },
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// parseImport
// ---------------------------------------------------------------------------
function parseImport(
  line: string,
  span: Span,
  _diagnostics: Diagnostic[]
): Import | null {
  // "import モジュール名 as 別名"
  const m = line.match(/^import\s+(\S+)\s+as\s+(\S+)/);
  if (!m) return null;
  return { module: m[1], alias: m[2], span };
}

// ---------------------------------------------------------------------------
// parseElementLine
// ---------------------------------------------------------------------------
function parseElementLine(
  ll: LogicalLine,
  diagnostics: Diagnostic[]
): ElementLine | null {
  const span: Span = { offset: 0, length: 0, line: ll.startLine, col: 0 };
  let text = ll.text.trim();

  // Collection flag
  let collection = false;
  if (text.startsWith('*')) {
    collection = true;
    text = text.slice(1).trim();
  }

  // Check for alias: or inline
  // Find the colon that is NOT inside { } or " "
  const colonIdx = findColonOutside(text);

  let alias: string | null = null;
  let valueText: string;

  if (colonIdx !== -1) {
    alias = text.slice(0, colonIdx).trim();
    valueText = text.slice(colonIdx + 1).trim();
  } else {
    valueText = text;
  }

  // Parse value: inline or ref
  const value = parseElementValue(valueText, span, diagnostics);
  if (!value) return null;

  return { collection, alias, value, span };
}

/**
 * Find the index of ':' that is outside { } and " " blocks.
 * Returns -1 if not found.
 */
function findColonOutside(text: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (!inQuote) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === ':' && depth === 0) return i;
    }
  }
  return -1;
}

function parseElementValue(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Ref | Inline | null {
  const t = text.trim();

  if (t.startsWith('{')) {
    // Inline
    return parseInline(t, span, diagnostics);
  }

  // Ref (possibly quoted)
  let name: string;
  if (t.startsWith('"')) {
    // Quoted name
    const r = readName(t, 0);
    name = r ? r.name : t;
  } else {
    // Unquoted: take the whole trimmed text as name
    // (stop at whitespace or separator for safety, but element names can have spaces if quoted)
    name = t;
  }

  return { kind: 'ref', name, span };
}

function parseInline(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Inline {
  // text: "{ content }" or "{ ... ; ... }"
  // Strip outer { }
  let inner = text;
  if (inner.startsWith('{')) inner = inner.slice(1);
  if (inner.endsWith('}')) inner = inner.slice(0, -1);

  // Split by ; (from buildLogicalLines multi-line joining)
  // splitBySemicolon はクォート・括弧保護済み
  const parts = splitBySemicolon(inner);
  const elements: ElementLine[] = [];

  for (const part of parts) {
    const trimPart = part.trim();
    if (trimPart === '') continue;
    const el = parseElementLine(
      { text: trimPart, startLine: span.line },
      diagnostics
    );
    if (el) elements.push(el);
  }

  return { kind: 'inline', elements, span };
}

// ---------------------------------------------------------------------------
// parseInteractionLine
// ---------------------------------------------------------------------------
function parseInteractionLine(
  ll: LogicalLine,
  diagnostics: Diagnostic[]
): Interaction | null {
  const span: Span = { offset: 0, length: 0, line: ll.startLine, col: 0 };
  const text = ll.text.trim();

  // Split on first ->
  const arrowIdx = findFirstArrow(text);
  if (arrowIdx === -1) return null;

  const actionText = text.slice(0, arrowIdx).trim();
  const resultsText = text.slice(arrowIdx + 2).trim();

  // Check E001: empty action text means this is a bare "-> ..." continuation
  if (actionText === '') {
    diagnostics.push({
      severity: 'error',
      code: 'E001',
      message: '二重矢印: -> の左辺が空です（直前の interaction の継続行に -> があります）',
      span,
    });
    return null;
  }

  const action = parseAction(actionText, span, diagnostics);

  // Check E003: empty result list
  if (resultsText === '') {
    diagnostics.push({
      severity: 'error',
      code: 'E003',
      message: '空の result-list: -> の後に結果がありません',
      span,
    });
    return { action, results: [], span };
  }

  const results = parseResultList(resultsText, span, diagnostics);
  return { action, results, span };
}

/**
 * Find the index of the first '->' that is not inside quotes or parentheses.
 */
function findFirstArrow(text: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length - 1; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (!inQuote) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === '-' && text[i + 1] === '>' && depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// parseAction
// ---------------------------------------------------------------------------
function parseAction(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Action {
  // "自然文 [(Reference)]"
  // Find the last '(' at depth 0 outside quotes
  const parenIdx = findLastOpenParen(text);

  if (parenIdx === -1) {
    return { text: text.trim(), target: null, span };
  }

  const actionText = text.slice(0, parenIdx).trim();
  const parenContent = text.slice(parenIdx + 1);

  // Find matching close paren
  const closeIdx = findCloseParen(parenContent);
  const refText = closeIdx === -1 ? parenContent : parenContent.slice(0, closeIdx);

  const target = parseReference(refText.trim(), span, diagnostics);
  return { text: actionText, target, span };
}

function findLastOpenParen(text: string): number {
  let inQuote = false;
  let lastIdx = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote && ch === '(') lastIdx = i;
  }
  return lastIdx;
}

function findCloseParen(text: string): number {
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) return i;
        depth--;
      }
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------
// parseReference
// ---------------------------------------------------------------------------
function parseReference(
  text: string,
  span: Span,
  _diagnostics: Diagnostic[]
): Reference {
  // "[module "::"] name ["." member] ["?"]"
  let t = text.trim();
  let existsGated = false;
  let module: string | null = null;
  let member: string | null = null;

  // Check existsGated (trailing ?)
  if (t.endsWith('?')) {
    existsGated = true;
    t = t.slice(0, -1);
  }

  // Check module:: prefix
  const dcIdx = t.indexOf('::');
  if (dcIdx !== -1) {
    module = t.slice(0, dcIdx).trim();
    t = t.slice(dcIdx + 2).trim();
  }

  // Check .member
  const dotIdx = t.indexOf('.');
  if (dotIdx !== -1) {
    member = t.slice(dotIdx + 1).trim();
    t = t.slice(0, dotIdx).trim();
  }

  const name = t;
  return { module, name, member, existsGated, span };
}

// ---------------------------------------------------------------------------
// parseResultList
// ---------------------------------------------------------------------------
function parseResultList(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Result[] {
  // Split by ';' outside quotes and brackets
  const tokens = splitBySemicolon(text);
  const results: Result[] = [];
  for (const token of tokens) {
    const t = token.trim();
    if (t === '') continue;
    const r = parseResult(t, span, diagnostics);
    if (r) results.push(r);
  }
  return results;
}

function splitBySemicolon(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ';' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// ---------------------------------------------------------------------------
// parseResult
// ---------------------------------------------------------------------------
const TRANSITION_WORDS: TransitionWord[] = ['push', 'present', 'goto', 'back', 'exit', 'dismiss'];

function parseResult(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Result | null {
  let t = text.trim();
  let label: string | null = null;

  // Strip leading "[label]"
  if (t.startsWith('[')) {
    const closeIdx = t.indexOf(']');
    if (closeIdx !== -1) {
      label = t.slice(1, closeIdx).trim();
      t = t.slice(closeIdx + 1).trim();
    }
  }

  const body = parseResultBody(t, span, diagnostics);
  return { label, body, span };
}

function parseResultBody(
  text: string,
  span: Span,
  diagnostics: Diagnostic[]
): Transition | Effect {
  // Check if it starts with a transition word
  for (const word of TRANSITION_WORDS) {
    if (text === word || text.startsWith(word + '(') || text.startsWith(word + ' ')) {
      // It's a transition
      const afterWord = text.slice(word.length).trim();
      // afterWord should be "(args...)"
      let argsText = '';
      if (afterWord.startsWith('(')) {
        const closeIdx = findCloseParen(afterWord.slice(1));
        if (closeIdx !== -1) {
          argsText = afterWord.slice(1, closeIdx + 1);
        } else {
          argsText = afterWord.slice(1);
        }
      }
      return parseTransition(word as TransitionWord, argsText, span, diagnostics);
    }
  }

  // Otherwise it's an effect
  return { kind: 'effect', text, span };
}

// ---------------------------------------------------------------------------
// parseTransition
// ---------------------------------------------------------------------------
function parseTransition(
  word: TransitionWord,
  argsText: string,
  span: Span,
  diagnostics: Diagnostic[]
): Transition {
  const args = splitArgs(argsText.trim());

  switch (word) {
    case 'push':
    case 'present': {
      const target = args[0] ? parseNavTarget(args[0].trim(), span, diagnostics) : null;
      const session = args[1] ? parseSession(args[1].trim(), span, diagnostics) : null;
      return { kind: 'transition', word, target, session, span };
    }
    case 'goto': {
      const target = args[0] ? parseNavTarget(args[0].trim(), span, diagnostics) : null;
      return { kind: 'transition', word, target, session: null, span };
    }
    case 'back': {
      const target = args[0] ? parseNavTarget(args[0].trim(), span, diagnostics) : null;
      return { kind: 'transition', word, target, session: null, span };
    }
    case 'exit': {
      if (!args[0] || args[0].trim() === '') {
        diagnostics.push({
          severity: 'error',
          code: 'E002',
          message: 'exit() には @session 引数が必要です',
          span,
        });
        return { kind: 'transition', word, target: null, session: null, span };
      }
      const session = parseSession(args[0].trim(), span, diagnostics);
      return { kind: 'transition', word, target: null, session, span };
    }
    case 'dismiss': {
      const session = args[0] ? parseSession(args[0].trim(), span, diagnostics) : null;
      return { kind: 'transition', word, target: null, session, span };
    }
  }
}

/**
 * Split comma-separated arguments, respecting parentheses and quotes.
 */
function splitArgs(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') inQuote = !inQuote;
    else if (!inQuote) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
  }
  if (start <= text.length) parts.push(text.slice(start));
  return parts;
}

// ---------------------------------------------------------------------------
// parseNavTarget
// ---------------------------------------------------------------------------
function parseNavTarget(
  text: string,
  span: Span,
  _diagnostics: Diagnostic[]
): NavTarget {
  const t = text.trim();

  // "##variation" — same-component variation
  if (t.startsWith('##')) {
    const name = t.slice(2).trim();
    return { kind: 'variation', name };
  }

  // Check for module:: prefix
  let module: string | null = null;
  let rest = t;
  const dcIdx = t.indexOf('::');
  if (dcIdx !== -1) {
    module = t.slice(0, dcIdx).trim();
    rest = t.slice(dcIdx + 2).trim();
  }

  // Check for ##variation suffix
  const hashIdx = rest.indexOf('##');
  let name: string;
  let variation: string | null = null;
  if (hashIdx !== -1) {
    name = rest.slice(0, hashIdx).trim();
    variation = rest.slice(hashIdx + 2).trim();
  } else {
    name = rest;
  }

  return { kind: 'component', module, name, variation };
}

// ---------------------------------------------------------------------------
// parseSession
// ---------------------------------------------------------------------------
function parseSession(text: string, span: Span, _diagnostics: Diagnostic[]): Session {
  const t = text.trim();
  if (t.startsWith('@')) {
    return { name: t.slice(1), span };
  }
  // No @ prefix — return as-is (edge case)
  return { name: t || null, span };
}
