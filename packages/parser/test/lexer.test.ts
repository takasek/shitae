import { describe, it, expect } from 'vitest';
import {
  stripComments,
  buildLogicalLines,
} from '../src/lexer.js';

// ---------------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------------
describe('stripComments', () => {
  it('行末コメントを同じ長さの空白で置換する', () => {
    const input = 'abc // comment';
    const result = stripComments(input);
    expect(result.length).toBe(input.length);
    expect(result.startsWith('abc ')).toBe(true);
    // コメント部分は空白
    expect(result.slice(4)).toMatch(/^ +$/);
  });

  it('クォート内の // はコメントとして扱わない', () => {
    const input = '"foo // not comment"';
    const result = stripComments(input);
    expect(result).toBe(input);
  });

  it('クォートに空白を含む name でも正しく動作する', () => {
    const input = '"スプラッシュ 画面" // コメント';
    const result = stripComments(input);
    expect(result.startsWith('"スプラッシュ 画面" ')).toBe(true);
    expect(result.length).toBe(input.length);
  });

  it('--- 行はそのまま保持される', () => {
    const input = '---';
    expect(stripComments(input)).toBe('---');
  });

  it('複数行を処理する', () => {
    const lines = [
      'abc // comment1',
      '"quoted // stays"',
      'xyz // comment2',
    ].join('\n');
    const result = stripComments(lines);
    const resultLines = result.split('\n');
    // コメント部分は空白に置換されるので行の長さは変わらない
    expect(resultLines[0].length).toBe('abc // comment1'.length);
    expect(resultLines[0].trimEnd()).toBe('abc');
    expect(resultLines[1]).toBe('"quoted // stays"');
    expect(resultLines[2].length).toBe('xyz // comment2'.length);
    expect(resultLines[2].trimEnd()).toBe('xyz');
  });

  it('コメントがない行はそのまま', () => {
    const input = 'タップ(button) -> push(home)';
    expect(stripComments(input)).toBe(input);
  });

  it('クォートの後のコメントは除去', () => {
    const input = 'タップ(button) -> push(home) // comment';
    const result = stripComments(input);
    expect(result.length).toBe(input.length);
    expect(result.slice(0, 'タップ(button) -> push(home) '.length)).toBe(
      'タップ(button) -> push(home) '
    );
  });
});

// ---------------------------------------------------------------------------
// buildLogicalLines
// ---------------------------------------------------------------------------
describe('buildLogicalLines', () => {
  it('{ } のない行は 1:1 変換', () => {
    const lines = ['abc', 'def', 'ghi'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: 'abc', startLine: 1 });
    expect(result[1]).toEqual({ text: 'def', startLine: 2 });
    expect(result[2]).toEqual({ text: 'ghi', startLine: 3 });
  });

  it('{ が開いた後 } で閉じるまで複数行を連結する', () => {
    const lines = ['フィード: {', '  *サムネイル', '}'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0].startLine).toBe(1);
    expect(result[0].text).toBe('フィード: {;  *サムネイル;}');
  });

  it('} で閉じた後の行は新しい論理行になる', () => {
    const lines = ['a: {', '  b', '}', 'c'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(2);
    expect(result[0].startLine).toBe(1);
    expect(result[0].text).toBe('a: {;  b;}');
    expect(result[1]).toEqual({ text: 'c', startLine: 4 });
  });

  it('ネストした { { } } を正しく処理する', () => {
    const lines = ['a: {', '  b: {', '    c', '  }', '}'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0].startLine).toBe(1);
    expect(result[0].text).toBe('a: {;  b: {;    c;  };}');
  });

  it('クォート内の { } は無視する', () => {
    const lines = ['"foo {bar}" // still one line', 'next'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: '"foo {bar}" // still one line', startLine: 1 });
    expect(result[1]).toEqual({ text: 'next', startLine: 2 });
  });

  it('空行は単独の論理行になる', () => {
    const lines = ['', 'abc', ''];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ text: '', startLine: 1 });
  });
});
