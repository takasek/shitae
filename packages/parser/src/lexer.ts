// ---------------------------------------------------------------------------
// Lexer utilities for @shitae/parser
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogicalLine {
  text: string;
  startLine: number; // 1-based
}

// ---------------------------------------------------------------------------
// Separators recognised by the token scanner
// ---------------------------------------------------------------------------
const SEPS = ['->', '(', ')', '{', '}', '.', '?', ',', '@', '##', ';', '[', ']', '::'];

// ---------------------------------------------------------------------------
// stripComments
//
// Replace `// comment` (to end of line) with spaces of the same length.
// Quoted strings ("...") are treated opaquely — `//` inside quotes is kept.
// Line structure (number of lines, character offsets) is preserved.
// ---------------------------------------------------------------------------
export function stripComments(source: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '"') {
      // Skip quoted string verbatim
      result.push(ch);
      i++;
      while (i < source.length && source[i] !== '"') {
        result.push(source[i]);
        i++;
      }
      if (i < source.length) {
        result.push(source[i]); // closing "
        i++;
      }
    } else if (ch === '/' && source[i + 1] === '/') {
      // Comment: replace until newline with spaces
      while (i < source.length && source[i] !== '\n') {
        result.push(' ');
        i++;
      }
    } else {
      result.push(ch);
      i++;
    }
  }

  return result.join('');
}

// ---------------------------------------------------------------------------
// buildLogicalLines
//
// Joins physical lines into LogicalLines.
// When an unquoted `{` opens a block, subsequent lines are appended
// (with `;` as separator) until the matching `}` closes the block.
// Nested braces are counted.
// ---------------------------------------------------------------------------
export function buildLogicalLines(lines: string[]): LogicalLine[] {
  const result: LogicalLine[] = [];

  let depth = 0;
  let current: string | null = null;
  let startLine = 1;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const physicalLineNo = lineIdx + 1;

    if (current === null) {
      // Start a new logical line
      current = line;
      startLine = physicalLineNo;
      depth = countBraceDepthChange(line);
      if (depth <= 0) {
        // No open block — flush immediately
        result.push({ text: current, startLine });
        current = null;
        depth = 0;
      }
    } else {
      // Continuation of an open block
      current = current + ';' + line;
      depth += countBraceDepthChange(line);
      if (depth <= 0) {
        result.push({ text: current, startLine });
        current = null;
        depth = 0;
      }
    }
  }

  // Unterminated block (depth still > 0): flush what we have
  if (current !== null) {
    result.push({ text: current, startLine });
  }

  return result;
}

/**
 * Count net brace depth change for a single line, ignoring braces inside
 * double-quoted strings.
 */
function countBraceDepthChange(line: string): number {
  let depth = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      while (i < line.length && line[i] !== '"') i++;
      if (i < line.length) i++; // skip closing "
    } else if (line[i] === '{') {
      depth++;
      i++;
    } else if (line[i] === '}') {
      depth--;
      i++;
    } else {
      i++;
    }
  }
  return depth;
}

// ---------------------------------------------------------------------------
// skipWhitespace
//
// Return the next position after skipping spaces and tabs.
// ---------------------------------------------------------------------------
export function skipWhitespace(source: string, pos: number): number {
  while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t')) {
    pos++;
  }
  return pos;
}

// ---------------------------------------------------------------------------
// readName
//
// Read a name (identifier) from `source` at `pos`.
// - If the character at `pos` is `"`, read a quoted string and return its
//   content (without quotes) and the position after the closing `"`.
// - Otherwise, read until a separator or whitespace.
// Returns null if `pos` is at whitespace, a separator, or past end.
// ---------------------------------------------------------------------------
export function readName(
  source: string,
  pos: number
): { name: string; end: number } | null {
  if (pos >= source.length) return null;

  const ch = source[pos];

  if (ch === '"') {
    // Quoted name
    let i = pos + 1;
    let name = '';
    while (i < source.length && source[i] !== '"') {
      name += source[i];
      i++;
    }
    if (i < source.length) i++; // skip closing "
    return { name, end: i };
  }

  // Unquoted: stop at whitespace or any separator character
  if (ch === ' ' || ch === '\t' || ch === '\n') return null;
  if (isSepStart(source, pos)) return null;

  let i = pos;
  while (i < source.length) {
    if (source[i] === ' ' || source[i] === '\t' || source[i] === '\n') break;
    if (isSepStart(source, i)) break;
    i++;
  }

  if (i === pos) return null;
  return { name: source.slice(pos, i), end: i };
}

// ---------------------------------------------------------------------------
// readUntil
//
// Read from `pos` until one of `seps` is found (outside quoted strings).
// Returns the text before the separator and the position at the separator.
// If no separator is found, returns the rest of the string.
// ---------------------------------------------------------------------------
export function readUntil(
  source: string,
  pos: number,
  seps: string[]
): { text: string; end: number } {
  let i = pos;

  while (i < source.length) {
    if (source[i] === '"') {
      // Skip quoted string
      i++;
      while (i < source.length && source[i] !== '"') i++;
      if (i < source.length) i++; // skip closing "
      continue;
    }

    // Check if any separator starts here
    const found = seps.find((sep) => source.startsWith(sep, i));
    if (found !== undefined) {
      return { text: source.slice(pos, i), end: i };
    }

    i++;
  }

  return { text: source.slice(pos), end: i };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return true if `source` starts a separator token at `pos`.
 */
function isSepStart(source: string, pos: number): boolean {
  return SEPS.some((sep) => source.startsWith(sep, pos));
}
