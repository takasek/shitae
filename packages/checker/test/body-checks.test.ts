import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/src/index.js';
import { resolve, resolveProject } from '../../resolver/src/index.js';
import { check } from '../src/index.js';

const scopes = [
  ['document common', ''],
  ['component common', '# Host\n'],
  ['variant', '# Host\n## Active\n'],
] as const;

describe('checks shared by every single-body scope', () => {
  it.each(scopes)('%s receives each applicable diagnostic once at its source', (_, prefix) => {
    const source = `${prefix}slot: First
slot: Second
*Status
> Link -> goto(Ready)
> WriteRegular -> set(Regular##Ready)
> WriteUnknown -> set(Status##Missing)
> Show -> show(Status##Off)
# Regular
## Ready
Label
#! Status
## Off
Label
`;
    const { document, diagnostics } = parse(source);
    expect(diagnostics).toEqual([]);
    const actual = check(document, resolve(document));
    const expected = [
      ['W101', 'slot: Second'],
      ['W102', '> Link -> goto(Ready)'],
      ['E028', '*Status'],
      ['E030', '> WriteRegular -> set(Regular##Ready)'],
      ['W105', '> WriteUnknown -> set(Status##Missing)'],
      ['W106', '> Show -> show(Status##Off)'],
    ].map(([code, line]) => ({ code, line: source.split('\n').indexOf(line!) + 1 }));
    expect(actual.map(d => ({ code: d.code, line: d.span.line }))).toEqual(expect.arrayContaining(expected));
    expect(actual).toHaveLength(expected.length);
  });

  it.each(scopes)('%s resolves imported W102 targets through the declaring import', (_, prefix) => {
    const source = `import library as ui\n${prefix}> Link -> goto(ui::Ready)\n# Other\nLabel\n`;
    const { document, diagnostics } = parse(source);
    const library = parse('# Target\n## Ready\nLabel\n').document;
    expect(diagnostics).toEqual([]);
    const project = resolveProject(new Map([['main', document], ['library', library]]));
    const warnings = check(document, resolve(document), { project });
    expect(warnings.map(d => ({ code: d.code, line: d.span.line }))).toEqual([
      { code: 'W102', line: source.split('\n').indexOf('> Link -> goto(ui::Ready)') + 1 },
    ]);
    expect(check(document, resolve(document))).toEqual([]);
  });

  it('keeps aliases local to each body, including document common', () => {
    const { document } = parse(`slot: Global
# Host
slot: Common
## Active
slot: Specific
`);
    expect(check(document, resolve(document))).toEqual([]);
  });

  it('does not infer a host for document common bare goto', () => {
    const { document } = parse(`> Global -> goto(##Missing)
# Host
> Common -> goto(##Missing)
## Ready
> Specific -> goto(##Missing)
`);
    const warnings = check(document, resolve(document));
    expect(warnings.map(d => ({ code: d.code, line: d.span.line }))).toEqual([
      { code: 'W105', line: 3 },
      { code: 'W105', line: 5 },
    ]);
  });
});
