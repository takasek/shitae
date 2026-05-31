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
