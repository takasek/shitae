import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/src/index.js';
import { resolve, resolveProject } from '../../resolver/src/index.js';
import { check } from '../src/index.js';

describe('issue #65: document common W106', () => {
  it.each([
    ['show(Status##Clean)', '#!', 1],
    ['show(Status)', '#!', 0],
    ['show(Status##Clean)', '#', 0],
  ])('%s (%s) reports %i warning', (result, header, count) => {
    const { document, diagnostics } = parse(`> Notify -> ${result}
# Editor
Status
> Save -> set(Status##Saved)
> Next -> push(Preview)
# Preview
Status
${header} Status
## Clean
CleanLabel
## Saved
SavedLabel
`);
    expect(diagnostics).toEqual([]);
    const warnings = check(document, resolve(document)).filter(d => d.code === 'W106');
    expect(warnings).toHaveLength(count);
    if (count) expect(warnings[0].span).toEqual(document.common.interactions[0].results[0].body.span);
  });

  it('resolves import aliases and reports each branch result once despite multiple hosts', () => {
    const { document, diagnostics } = parse(`import library as ui
> Notify -> [reset] show(ui::Status##Clean) ; show(ui::Status##Clean)
> [keep] show(ui::Status)
# Editor
Label
# Preview
Label
`);
    const library = parse('#! Status\n## Clean\nLabel\n## Saved\nLabel\n').document;
    expect(diagnostics).toEqual([]);
    const project = resolveProject(new Map([['main', document], ['library', library]]));
    const warnings = check(document, resolve(document), { project }).filter(d => d.code === 'W106');
    expect(warnings.map(d => d.span)).toEqual(
      document.common.interactions[0].results.slice(0, 2).map(r => r.body.span),
    );
    expect(check(document, resolve(document)).filter(d => d.code === 'W106')).toEqual([]);
  });
});
