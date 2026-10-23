import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/src/index.js';
import { resolve, resolveProject } from '../../resolver/src/index.js';
import { check } from '../src/index.js';

function errors(source: string, library = '#! Card\nLabel\n', projectContext = true) {
  const entry = parse(source);
  const lib = parse(library);
  expect(entry.diagnostics).toEqual([]);
  expect(lib.diagnostics).toEqual([]);
  const project = resolveProject(new Map([['main', entry.document], ['library', lib.document]]));
  return check(entry.document, resolve(entry.document), projectContext ? { project } : undefined)
    .filter(d => d.code === 'E028');
}

describe('issue #64: collection resolves the referenced definition', () => {
  it.each(['*ui::Card', '*cards: ui::Card', 'panel: { *cards: ui::Card }'])
    ('cross-module declaration %s ignores a local namesake', element => {
      const source = `import library as ui\n# Screen\n${element}\n#! Card\nLabel\n`;
      expect(errors(source, '# Card\nLabel\n')).toEqual([]);
      expect(errors(source)).toHaveLength(1);
    });

  it.each(['', '# Screen\n', '# Screen\n## Ready\n'])
    ('declarations in document/component/variant body %j are checked', prefix => {
      expect(errors(`import library as ui\n${prefix}panel: { *ui::Card }\n# Other\nLabel\n`)).toHaveLength(1);
    });

  it('checks inline children locally without propagating outer collection', () => {
    expect(errors('# Screen\npanel: { *badge: Card }\n#! Card\nLabel\n')).toHaveLength(1);
    expect(errors('import library as ui\n# Screen\n*panel: { badge: ui::Card }\n')).toEqual([]);
  });

  it.each(['*missing::Card', '*ui::Missing', '*Card'])('unresolved declaration %s is skipped', element => {
    expect(errors(`import library as ui\n# Screen\n${element}\n`)).toEqual([]);
  });

  it('cross-module declarations without project context are skipped', () => {
    expect(errors('import library as ui\n# Screen\n*ui::Card\n#! Card\nLabel\n', undefined, false)).toEqual([]);
  });

  it.each(['', '# Screen\n', '# Screen\n## Ready\n'])
    ('action aliases in their own body %j resolve to the definition', prefix => {
      expect(errors(`import library as ui\n${prefix}badge: ui::Card\n> Tap(*badge) -> Done\n# Other\nLabel\n`)).toHaveLength(1);
      expect(errors(`${prefix}Card: Regular\n> Tap(*Card) -> Done\n#! Card\nLabel\n# Regular\nLabel\n`)).toEqual([]);
    });

  it('aliases are single-body local, not inherited by variant/component/document interactions', () => {
    const source = `> Global(*badge) -> Done
# Screen
badge: Card
> Common(*badge) -> Done
## Ready
> Variant(*badge) -> Done
## Other
badge: Regular
> Other(*badge) -> Done
#! Card
Label
# Regular
Label
`;
    const diags = errors(source);
    expect(diags).toHaveLength(1);
    expect(diags[0].span.line).toBe(4);
  });

  it('aliases do not chain and explicit module names bypass body aliases', () => {
    expect(errors('# Screen\na: b\nb: Card\n> Tap(*a) -> Done\n#! Card\nLabel\n')).toEqual([]);
    expect(errors('import library as ui\n# Screen\nCard: Regular\n> Tap(*ui::Card) -> Done\n')).toHaveLength(1);
  });

  it('an inline alias denotes the container, and a member denotes its own definition', () => {
    expect(errors('# Screen\nCard: { badge: Regular }\n> Tap(*Card) -> Done\n> Child(*Card.badge) -> Done\n#! Card\nLabel\n# Regular\nLabel\n')).toEqual([]);
    expect(errors('import library as ui\n# Screen\npanel: { badge: ui::Card }\n> Tap(*panel.badge) -> Done\n')).toHaveLength(1);
  });

  it('component members resolve the member alias, not the singleton owner or a member namesake', () => {
    expect(errors('# Screen\n> Tap(*Card.badge) -> Done\n#! Card\nbadge: Regular\n# Regular\nLabel\n')).toEqual([]);
    expect(errors('# Screen\n> Tap(*Panel.badge) -> Done\n# Panel\nbadge: Card\n#! Card\nLabel\n')).toHaveLength(1);
    expect(errors('# Screen\n> Tap(*Panel.Card) -> Done\n# Panel\nCard\n#! Card\nLabel\n')).toEqual([]);
  });

  it('member lookup inspects effective bodies of each possible target variant once per action', () => {
    expect(errors('# Screen\n> Tap(*Panel.badge) -> Done\n# Panel\nbadge: Regular\n## A\nbadge: Card\n## B\nbadge: Card\n#! Card\nLabel\n# Regular\nLabel\n')).toHaveLength(1);
    expect(errors('# Screen\n> Tap(*Panel.badge) -> Done\n# Panel\n## A\nbadge: Regular\n## B\nLabel\n#! badge\nLabel\n# Regular\nLabel\n')).toEqual([]);
  });

  it('members of imported components use imports of the defining module', () => {
    const main = parse('import library as ui\nimport regular as inside\n# Screen\n> Tap(*ui::Panel.badge) -> Done\n').document;
    const library = parse('import shared as inside\n# Panel\nbadge: inside::Card\n').document;
    const shared = parse('#! Card\nLabel\n').document;
    const regular = parse('# Card\nLabel\n').document;
    const project = resolveProject(new Map([['main', main], ['library', library], ['shared', shared], ['regular', regular]]));
    expect(check(main, resolve(main), { project }).filter(d => d.code === 'E028')).toHaveLength(1);
  });
});
