// ---------------------------------------------------------------------------
// Parser for @shitae/parser
// ---------------------------------------------------------------------------
import type {
  Document,
  Import,
  Component,
  Variant,
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
import { TRANSITION_WORDS } from '@shitae/ast';

import {
  stripComments,
  buildLogicalLines,
  buildLineOffsets,
  readName,
  scanTopLevel,
  splitTopLevel,
  type LogicalLine,
} from './lexer.js';

// Bracket sets used by the top-level scanners below.
const ALL_BRACKETS = '()[]{}';
const PARENS = '()';

// ---------------------------------------------------------------------------
// Internal builders
// ---------------------------------------------------------------------------
interface ComponentBuilder {
  name: string;
  span: Span;
  commonElements: ElementLine[];
  commonInteractions: Interaction[];
  variants: Variant[];
}

interface VariantBuilder {
  name: string;
  span: Span;
  elements: ElementLine[];
  interactions: Interaction[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function parseDocument(source: string): { document: Document; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const stripped = stripComments(source);
  const lineOffsets = buildLineOffsets(stripped);
  const rawLines = stripped.split('\n');
  const logicalLines = buildLogicalLines(rawLines);

  const imports: Import[] = [];
  const components: Component[] = [];

  let componentBuilder: ComponentBuilder | null = null;
  let variantBuilder: VariantBuilder | null = null;
  let lastInteraction: Interaction | null = null;
  let seenFirstComponent = false;

  function makeSpan(startLine: number, col: number, length: number): Span {
    const offset = (lineOffsets[startLine - 1] ?? 0) + (col - 1);
    return { offset, length, line: startLine, col };
  }

  function finalizeVariant(): void {
    if (variantBuilder && !componentBuilder) {
      diagnostics.push({
        severity: 'error',
        code: 'E007',
        message: `variant '${variantBuilder.name}' が component の外で定義されています`,
        span: variantBuilder.span,
      });
      variantBuilder = null;
      return;
    }
    if (variantBuilder && componentBuilder) {
      const v: Variant = {
        name: variantBuilder.name,
        body: {
          elements: variantBuilder.elements,
          interactions: variantBuilder.interactions,
        },
        span: variantBuilder.span,
      };
      // Check duplicate variant
      if (componentBuilder.variants.some((x) => x.name === v.name)) {
        diagnostics.push({
          severity: 'error',
          code: 'E006',
          message: `重複した variant 定義: '${v.name}'`,
          span: v.span,
        });
      }
      componentBuilder.variants.push(v);
      variantBuilder = null;
    }
  }

  function finalizeComponent(): void {
    if (componentBuilder) {
      const c: Component = {
        name: componentBuilder.name,
        common: {
          elements: componentBuilder.commonElements,
          interactions: componentBuilder.commonInteractions,
        },
        variants: componentBuilder.variants,
        span: componentBuilder.span,
      };
      // Check duplicate component
      if (components.some((x) => x.name === c.name)) {
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
    if (variantBuilder) return variantBuilder.elements;
    if (componentBuilder) return componentBuilder.commonElements;
    return [];
  }

  function currentInteractions(): Interaction[] {
    if (variantBuilder) return variantBuilder.interactions;
    if (componentBuilder) return componentBuilder.commonInteractions;
    return [];
  }

  // An interaction's result-list may be empty on its own "> action ->" line and
  // still be valid, as long as continuation lines (`>` lines without `->`) fill
  // it in afterwards (canonical multi-line branching). So E003 can only be
  // decided once we know no more continuation lines will arrive for it — i.e.
  // when the interaction stops being `lastInteraction` (a new interaction
  // starts, the enclosing body ends, or the document ends).
  function checkEmptyResultList(interaction: Interaction | null): void {
    if (interaction && interaction.results.length === 0) {
      diagnostics.push({
        severity: 'error',
        code: 'E003',
        message: '空の result-list: -> の後に結果がありません',
        span: interaction.span,
      });
    }
  }

  for (const ll of logicalLines) {
    const raw = ll.text;
    const trimmed = raw.trim();
    const firstNonSpace = raw.search(/\S/);
    const spanCol = firstNonSpace === -1 ? 1 : firstNonSpace + 1;
    const spanLen = firstNonSpace === -1 ? 0 : raw.trimEnd().length - firstNonSpace;
    const span = makeSpan(ll.startLine, spanCol, spanLen);

    // Empty line
    if (trimmed === '') {
      continue;
    }

    // Component header: "# name"
    if (raw.startsWith('# ') || raw === '#') {
      checkEmptyResultList(lastInteraction);
      finalizeVariant();
      finalizeComponent();
      seenFirstComponent = true;
      const name = raw.slice(2).trim();
      if (name === '') {
        diagnostics.push({
          severity: 'error',
          code: 'E008',
          message: 'component 名が空です（# の後に名前を書いてください）',
          span,
        });
        continue;
      }
      componentBuilder = {
        name,
        span,
        commonElements: [],
        commonInteractions: [],
        variants: [],
      };
      variantBuilder = null;
      lastInteraction = null;
      continue;
    }

    // Variant header: "## name"
    if (raw.startsWith('## ') || raw === '##') {
      checkEmptyResultList(lastInteraction);
      finalizeVariant();
      const name = raw.slice(3).trim();
      variantBuilder = {
        name,
        span,
        elements: [],
        interactions: [],
      };
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

    // Lines within a component/variant
    if (!componentBuilder) {
      // Outside any component — ignore (or could warn)
      continue;
    }

    if (trimmed.startsWith('>')) {
      // Interaction line: leading '>' marker, subsequent whitespace/indent is non-meaningful.
      const content = trimmed.slice(1).replace(/^[ \t]+/, '');
      if (findFirstArrow(content) !== -1) {
        // Contains '->' at top level → new interaction
        checkEmptyResultList(lastInteraction);
        const interaction = parseInteractionLine(ll, lineOffsets, content, diagnostics);
        if (interaction) {
          currentInteractions().push(interaction);
          lastInteraction = interaction;
        } else {
          lastInteraction = null;
        }
      } else {
        // Continuation of the previous interaction's result-list (same body only)
        if (lastInteraction === null) {
          diagnostics.push({
            severity: 'error',
            code: 'E010',
            message:
              '継続行の前に interaction がありません（新しい interaction は行頭 > の後に action -> result が必要です）',
            span,
          });
        } else {
          const additionalResults = parseResultList(content, span, diagnostics);
          lastInteraction.results.push(...additionalResults);
        }
      }
    } else {
      // Element line
      if (containsArrowOutsideQuotes(trimmed)) {
        diagnostics.push({
          severity: 'error',
          code: 'E011',
          message:
            '要素行に -> を含めることはできません（ヒント: インタラクション行は行頭 > が必要です）',
          span,
        });
      }
      const el = parseElementLine(ll, lineOffsets, diagnostics);
      if (el) currentElements().push(el);
    }
  }

  // Finalize last component/variant
  checkEmptyResultList(lastInteraction);
  finalizeVariant();
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
  diagnostics: Diagnostic[]
): Import | null {
  // "import モジュール名 as 別名"
  const m = line.match(/^import\s+(\S+)\s+as\s+(\S+)/);
  if (!m) {
    diagnostics.push({
      severity: 'error',
      code: 'E009',
      message: `不正な import 構文です（正しい形式: import <モジュール> as <別名>）`,
      span,
    });
    return null;
  }
  return { module: m[1], alias: m[2], span };
}

// ---------------------------------------------------------------------------
// parseElementLine
// ---------------------------------------------------------------------------
function parseElementLine(
  ll: LogicalLine,
  lineOffsets: number[],
  diagnostics: Diagnostic[]
): ElementLine | null {
  const raw = ll.text;
  const firstNonSpace = raw.search(/\S/);
  const col = firstNonSpace === -1 ? 1 : firstNonSpace + 1;
  const offset = (lineOffsets[ll.startLine - 1] ?? 0) + (col - 1);
  const length = firstNonSpace === -1 ? 0 : raw.trimEnd().length - firstNonSpace;
  const span: Span = { offset, length, line: ll.startLine, col };
  let text = raw.trim();

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
  const value = parseElementValue(valueText, span, lineOffsets, diagnostics);
  if (!value) return null;

  return { collection, alias, value, span };
}

/**
 * Find the index of ':' that is outside { } and " " blocks.
 * Returns -1 if not found.
 */
function findColonOutside(text: string): number {
  for (const { ch, i, depth } of scanTopLevel(text, '{}')) {
    if (ch === ':' && depth === 0) return i;
  }
  return -1;
}

function parseElementValue(
  text: string,
  span: Span,
  lineOffsets: number[],
  diagnostics: Diagnostic[]
): Ref | Inline | null {
  const t = text.trim();

  if (t.startsWith('{')) {
    // Inline
    return parseInline(t, span, lineOffsets, diagnostics);
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
  lineOffsets: number[],
  diagnostics: Diagnostic[]
): Inline {
  // text: "{ content }" or "{ ... ; ... }"
  // Strip outer { }
  let inner = text;
  if (inner.startsWith('{')) inner = inner.slice(1);
  if (inner.endsWith('}')) inner = inner.slice(0, -1);

  // Split by ; (from buildLogicalLines multi-line joining)
  // splitTopLevel はクォート・括弧保護済み
  const parts = splitTopLevel(inner, ';', ALL_BRACKETS);
  const elements: ElementLine[] = [];

  for (const part of parts) {
    const trimPart = part.trim();
    if (trimPart === '') continue;
    const el = parseElementLine(
      { text: trimPart, startLine: span.line },
      lineOffsets,
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
  lineOffsets: number[],
  content: string,
  diagnostics: Diagnostic[]
): Interaction | null {
  const raw = ll.text;
  const firstNonSpace = raw.search(/\S/);
  const col = firstNonSpace === -1 ? 1 : firstNonSpace + 1;
  const offset = (lineOffsets[ll.startLine - 1] ?? 0) + (col - 1);
  const length = firstNonSpace === -1 ? 0 : raw.trimEnd().length - firstNonSpace;
  const span: Span = { offset, length, line: ll.startLine, col };
  // `content` is the text after the leading '>' marker (marker and following
  // whitespace/indent already stripped by the caller — non-meaningful per 記号一覧).
  const text = content.trim();

  // Split on first ->
  const arrowIdx = findFirstArrow(text);
  if (arrowIdx === -1) return null;

  const actionText = text.slice(0, arrowIdx).trim();
  let resultsText = text.slice(arrowIdx + 2).trim();

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

  // Check E012: a second top-level '->' in the same line (`-> R -> R`) is a
  // syntax error — 1 行につき矢印は 1 つだけ（「未定・分岐」参照）。
  // Recover by keeping only the result(s) before the offending arrow.
  const secondArrowIdx = findFirstArrow(resultsText);
  if (secondArrowIdx !== -1) {
    diagnostics.push({
      severity: 'error',
      code: 'E012',
      message: '矢印重複: 1 行に -> が 2 つ以上あります（分岐は ; または継続行で並べてください）',
      span,
    });
    resultsText = resultsText.slice(0, secondArrowIdx).trim();
  }

  const action = parseAction(actionText, span, diagnostics);

  // Empty result-list is not necessarily an error here: continuation lines
  // (`>` lines without `->`) may still fill it in (canonical multi-line
  // branching, see SPEC.md「未定・分岐」). E003 is decided later, once the
  // caller knows no more continuation lines are coming (see
  // checkEmptyResultList in parseDocument).
  const results = resultsText === '' ? [] : parseResultList(resultsText, span, diagnostics);
  return { action, results, span };
}

/**
 * Find the index of the first '->' that is not inside quotes or parentheses.
 */
function findFirstArrow(text: string): number {
  for (const { ch, i, depth } of scanTopLevel(text, ALL_BRACKETS)) {
    if (ch === '-' && text[i + 1] === '>' && depth === 0) return i;
  }
  return -1;
}

/**
 * Detect '->' anywhere outside quoted strings (E011: element lines may not
 * contain '->' at all — unlike interaction lines this is not restricted to
 * top-level / outside-parens; only quoted text is exempt).
 */
function containsArrowOutsideQuotes(text: string): boolean {
  for (const { ch, i } of scanTopLevel(text, '')) {
    if (ch === '-' && text[i + 1] === '>') return true;
  }
  return false;
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
  let lastTopLevelIdx = -1;
  for (const { ch, i, depth } of scanTopLevel(text, PARENS)) {
    if (ch === '(' && depth === 0) lastTopLevelIdx = i;
  }
  return lastTopLevelIdx;
}

function findCloseParen(text: string): number {
  for (const { ch, i, depth } of scanTopLevel(text, PARENS)) {
    if (ch === ')' && depth === 0) return i;
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
    const memberStr = t.slice(dotIdx + 1).trim();
    member = memberStr === '' ? null : memberStr;
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
  const tokens = splitTopLevel(text, ';', ALL_BRACKETS);
  const results: Result[] = [];
  for (const token of tokens) {
    const t = token.trim();
    if (t === '') continue;
    const r = parseResult(t, span, diagnostics);
    if (r) results.push(r);
  }
  return results;
}

// ---------------------------------------------------------------------------
// parseResult
// ---------------------------------------------------------------------------
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
  const args = splitTopLevel(argsText.trim(), ',', PARENS);

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

// ---------------------------------------------------------------------------
// parseNavTarget
// ---------------------------------------------------------------------------
function parseNavTarget(
  text: string,
  span: Span,
  _diagnostics: Diagnostic[]
): NavTarget {
  const t = text.trim();

  // "##variant" — same-component variant
  if (t.startsWith('##')) {
    const name = t.slice(2).trim();
    return { kind: 'variant', name };
  }

  // Check for module:: prefix
  let module: string | null = null;
  let rest = t;
  const dcIdx = t.indexOf('::');
  if (dcIdx !== -1) {
    module = t.slice(0, dcIdx).trim();
    rest = t.slice(dcIdx + 2).trim();
  }

  // Check for ##variant suffix
  const hashIdx = rest.indexOf('##');
  let name: string;
  let variant: string | null = null;
  if (hashIdx !== -1) {
    name = rest.slice(0, hashIdx).trim();
    variant = rest.slice(hashIdx + 2).trim();
  } else {
    name = rest;
  }

  return { kind: 'component', module, name, variant };
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
