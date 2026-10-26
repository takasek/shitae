import { describe, expect, it } from 'vitest';
import { parse } from '../src/index.js';

// Compare structure independently of the intentionally different source spans.
const structure = (value: unknown) => JSON.parse(JSON.stringify(value, (key, item) => key === 'span' ? undefined : item));

describe('indentation is non-semantic at heading boundaries', () => {
  const cases = [
    ['component', '# Start\nStartBody\n# Details\nDetailsBody', '# Details'],
    ['singleton', '# Start\nStartBody\n#! Status\n## Ready\nReadyBody\n## Done\nDoneBody', '#! Status'],
    ['variant', '# Start\n## Ready\nReadyBody\n## Done\nDoneBody', '## Done'],
  ];
  for (const [kind, source, heading] of cases) {
    it.each(['', ' ', '  ', '\t'])(`${kind} retains its definition with prefix %j`, prefix => {
      const control = parse(source!);
      const indented = parse(source!.replace(heading!, prefix + heading));
      expect(structure(indented)).toEqual(structure(control));
      const nodes = indented.document.components.flatMap(c => [c, ...c.variants]);
      const node = nodes.find(n => n.name === (kind === 'component' ? 'Details' : kind === 'singleton' ? 'Status' : 'Done'))!;
      expect(node.span.col).toBe(prefix.length + 1);
      expect(node.span.offset).toBe(source!.indexOf(heading!) + prefix.length);
      expect(node.span.length).toBe(heading!.length);
    });
  }

  it.each(['# Next', '#! Next', '## Next'])('breaks result continuation across indented %s', heading => {
    const { document, diagnostics } = parse('# Start\n> Go -> effect\n  ' + heading + '\n> [Next] other');
    expect(diagnostics.some(d => d.code === 'E010')).toBe(true);
    expect(document.components[0]!.common.interactions[0]!.results).toHaveLength(1);
  });

  it.each(['#', '#!'])('reports an indented empty %s at its original position', heading => {
    const { diagnostics } = parse('# Start\nBody\n\t' + heading + ' // missing name');
    expect(diagnostics.find(d => d.code === 'E008')?.span).toMatchObject({ line: 3, col: 2, offset: 14, length: heading.length });
  });

  it('preserves quoted heading names and ignores heading text in quoted elements and comments', () => {
    const { document, diagnostics } = parse('  # "Start page" // heading\n  "# Details"\n  // # Ignored\n\t#! "Shared state"\n  ## "Ready state"\nValue');
    expect(diagnostics).toEqual([]);
    expect(document.components.map(c => c.name)).toEqual(['Start page', 'Shared state']);
    expect(document.components[0]!.common.elements[0]!.value).toMatchObject({ kind: 'ref', name: '# Details' });
    expect(document.components[1]!.variants[0]!.name).toBe('Ready state');
  });
});
