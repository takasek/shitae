export { parseDocument as parse } from './parser.js';
export type { LogicalLine } from './lexer.js';
export {
  stripComments,
  buildLogicalLines,
  skipWhitespace,
  readName,
  readUntil,
} from './lexer.js';
