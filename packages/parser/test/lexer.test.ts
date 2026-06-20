import { describe, it, expect } from 'vitest';
import {
  stripComments,
  buildLogicalLines,
  buildLineOffsets,
  readName,
  readUntil,
  skipWhitespace,
  scanTopLevel,
  splitTopLevel,
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

  it('行頭コメントも除去する', () => {
    const input = '// これはコメント\nfoo';
    const result = stripComments(input);
    expect(result.length).toBe(input.length);
    expect(result.slice(0, '// これはコメント'.length)).toMatch(/^ +$/);
    expect(result.slice('// これはコメント'.length)).toBe('\nfoo');
  });

  it('クォートの後のコメントは除去', () => {
    const input = 'タップ(button) -> push(home) // comment';
    const result = stripComments(input);
    expect(result.length).toBe(input.length);
    expect(result.slice(0, 'タップ(button) -> push(home) '.length)).toBe(
      'タップ(button) -> push(home) '
    );
  });

  it('未閉クォートは行末で終わり、後続行のコメントを消費しない', () => {
    // 1行目: 閉じていないクォート (bug があると 2行目の // もクォート内として扱われる)
    // 2行目: 正常な // コメントがある行 → コメント部分は空白に置換されるべき
    const input = '"unterminated\nfoo // comment';
    const result = stripComments(input);
    const resultLines = result.split('\n');
    expect(resultLines).toHaveLength(2);
    // 2行目の // コメントは正しく空白に置換される
    expect(resultLines[1].trimEnd()).toBe('foo');
    // 行長は保持される
    expect(resultLines[1].length).toBe('foo // comment'.length);
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

  it('未閉じブロックはエラーにならずフラッシュされる', () => {
    const lines = ['始まり {', '中身'];
    const result = buildLogicalLines(lines);
    expect(result).toHaveLength(1);
    expect(result[0].startLine).toBe(1);
    expect(result[0].text).toBe('始まり {;中身');
  });
});

// ---------------------------------------------------------------------------
// skipWhitespace
// ---------------------------------------------------------------------------
describe('skipWhitespace', () => {
  it('スペースとタブをスキップする', () => {
    expect(skipWhitespace('   abc', 0)).toBe(3);
    expect(skipWhitespace('\t\t x', 0)).toBe(3);
    expect(skipWhitespace('abc', 0)).toBe(0);
  });

  it('pos から開始する', () => {
    expect(skipWhitespace('ab  cd', 2)).toBe(4);
  });

  it('末尾まで達した場合は文字列長を返す', () => {
    expect(skipWhitespace('   ', 0)).toBe(3);
  });

  it('改行（\\n）はスキップしない', () => {
    expect(skipWhitespace('\n  foo', 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// readName
// ---------------------------------------------------------------------------
describe('readName', () => {
  it('クォートなしの識別子を読む（ASCII）', () => {
    const r = readName('button', 0);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('button');
    expect(r!.end).toBe(6);
  });

  it('クォートなしの識別子を読む（日本語）', () => {
    const r = readName('ホーム画面', 0);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('ホーム画面');
    expect(r!.end).toBe(5);
  });

  it('"..." で囲まれた name はクォートを除いた中身を返す', () => {
    const r = readName('"スプラッシュ 画面"', 0);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('スプラッシュ 画面');
    // end はクローズクォートの次
    expect(r!.end).toBe('"スプラッシュ 画面"'.length);
  });

  it('区切り文字の手前で止まる', () => {
    const r = readName('home)', 0);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('home');
    expect(r!.end).toBe(4);
  });

  it('-> セパレータ前で正しく止まる', () => {
    const r = readName('home->next', 0);
    expect(r).not.toBeNull();
    expect(r!.name).toBe('home');
    expect(r!.end).toBe(4);
  });

  it('pos がスペースの場合は null', () => {
    const r = readName(' abc', 0);
    expect(r).toBeNull();
  });

  it('pos が文字列末尾の場合は null', () => {
    const r = readName('abc', 3);
    expect(r).toBeNull();
  });

  it('pos から先頭が区切り文字の場合は null', () => {
    const r = readName('(abc', 0);
    expect(r).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readUntil
// ---------------------------------------------------------------------------
describe('readUntil', () => {
  it('sep の手前まで読む', () => {
    const r = readUntil('abc->def', 0, ['->']);
    expect(r.text).toBe('abc');
    expect(r.end).toBe(3);
  });

  it('sep が見つからなければ末尾まで', () => {
    const r = readUntil('abcdef', 0, []);
    expect(r.text).toBe('abcdef');
    expect(r.end).toBe(6);
  });

  it('クォート内の sep は無視する', () => {
    const r = readUntil('"foo->bar"->end', 0, ['->']);
    expect(r.text).toBe('"foo->bar"');
    expect(r.end).toBe(10);
  });

  it('複数の sep のうち最初に出現するもので止まる', () => {
    const r = readUntil('a(b)->c', 0, ['(', '->']);
    expect(r.text).toBe('a');
    expect(r.end).toBe(1);
  });

  it('先頭の空白を含む場合は text にそのまま含まれる（trailing trim はしない）', () => {
    const r = readUntil('abc ', 0, ['->']);
    expect(r.text).toBe('abc ');
  });

  it('複数文字の sep（##）を正しく扱う', () => {
    const r = readUntil('Component##Variation', 0, ['##']);
    expect(r.text).toBe('Component');
    expect(r.end).toBe(9);
  });

  it('クォート内の ( ) は区切り文字として扱わない', () => {
    const r = readUntil('"foo (bar)")', 0, [')']);
    expect(r.text).toBe('"foo (bar)"');
    expect(r.end).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// scanTopLevel
// ---------------------------------------------------------------------------
describe('scanTopLevel', () => {
  it('各文字を depth（その文字の手前までの括弧の深さ）付きで列挙する', () => {
    const got = [...scanTopLevel('a(b)c', '()')].map((t) => [t.ch, t.i, t.depth]);
    expect(got).toEqual([
      ['a', 0, 0],
      ['(', 1, 0],
      ['b', 2, 1],
      [')', 3, 1],
      ['c', 4, 0],
    ]);
  });

  it('クォート内の文字は列挙しない', () => {
    const chars = [...scanTopLevel('a"b;c"d', '()')].map((t) => t.ch);
    expect(chars).toEqual(['a', 'd']);
  });

  it('brackets に含まれない括弧は深さに影響しない', () => {
    const got = [...scanTopLevel('[a]', '()')].map((t) => t.depth);
    expect(got).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// splitTopLevel
// ---------------------------------------------------------------------------
describe('splitTopLevel', () => {
  it('トップレベルの区切り文字で分割する', () => {
    expect(splitTopLevel('a;b;c', ';', '()[]{}')).toEqual(['a', 'b', 'c']);
  });

  it('括弧の内側の区切り文字では分割しない', () => {
    expect(splitTopLevel('f(a,b),c', ',', '()')).toEqual(['f(a,b)', 'c']);
  });

  it('クォート内の区切り文字では分割しない', () => {
    expect(splitTopLevel('"a;b";c', ';', '()')).toEqual(['"a;b"', 'c']);
  });

  it('区切り文字がなければ単一要素', () => {
    expect(splitTopLevel('abc', ';', '()')).toEqual(['abc']);
  });
});

// ---------------------------------------------------------------------------
// buildLogicalLines: known limitation
// ---------------------------------------------------------------------------
describe('buildLogicalLines: 余分な } がある不正入力の既知動作', () => {
  it('行内に余分な } があるとブロックが途中でフラッシュされる（known limitation）', () => {
    // 不正入力: ブロック内に余分な } がある
    // 正しい shitae では発生しない。フラッシュは早まるが後続行への影響はない
    const lines = ['elem: {', '  inner1', '  } }'];
    const result = buildLogicalLines(lines);
    // 余分な } でフラッシュが発生し、1つの logical line になる
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('inner1');
  });
});

// ---------------------------------------------------------------------------
// buildLineOffsets
// ---------------------------------------------------------------------------
describe('buildLineOffsets', () => {
  it('単一行: [0]', () => {
    expect(buildLineOffsets('abc')).toEqual([0]);
  });

  it('2行: [0, 4]', () => {
    expect(buildLineOffsets('abc\ndef')).toEqual([0, 4]);
  });

  it('末尾改行あり: [0, 4]', () => {
    expect(buildLineOffsets('abc\n')).toEqual([0, 4]);
  });

  it('空文字: [0]', () => {
    expect(buildLineOffsets('')).toEqual([0]);
  });

  it('3行 + 末尾改行: 各行先頭 offset', () => {
    // '# Foo\n## Bar\nButton\n': line1=0, line2=6, line3=13, trailing=20
    expect(buildLineOffsets('# Foo\n## Bar\nButton\n')).toEqual([0, 6, 13, 20]);
  });
});
