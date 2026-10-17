import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import { toSimulator } from '../src/simulator.js';

const modelOf = (html: string) => JSON.parse(html.match(/^const MODEL = (.*);$/m)![1]!);
function prepare(entryFile: string) {
  const source = '# Home\nx\n';
  const documents = new Map([['main', parse(source).document]]);
  const files = new Map([['main', entryFile]]);
  const metadata = createMetadata(documents, 'main', files, new Map([['main', new TextEncoder().encode(source)]]));
  return { documents, files, metadata };
}

describe('toSimulator embeds display copies of file paths', () => {
  it('does not mutate the caller files Map or metadata object, and leaves identity untouched', () => {
    const { documents, files, metadata } = prepare('/abs/work/main.shitae');
    const filesBefore = [...files], metadataBefore = structuredClone(metadata);
    const deepFreeze = (o: object) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };
    deepFreeze(metadata.manifest);
    const html = toSimulator(documents, 'main', undefined, { files, metadata });
    expect([...files]).toEqual(filesBefore);
    expect(metadata).toEqual(metadataBefore);
    expect(metadata.manifest[0]!.file).toBe('/abs/work/main.shitae');
    const embedded = modelOf(html);
    expect(embedded.files).toEqual([['main', 'main.shitae']]);
    expect(embedded.metadata.manifest[0].file).toBe('main.shitae');
    expect(embedded.metadata.modelId).toBe(metadata.modelId);
    expect(html).not.toContain('/abs/work');
  });

  it('uses the module ID itself when the real file has no .shitae suffix', () => {
    const { documents, files, metadata } = prepare('/abs/work/main');
    const embedded = modelOf(toSimulator(documents, 'main', undefined, { files, metadata }));
    expect(embedded.files).toEqual([['main', 'main']]);
    expect(embedded.metadata.manifest[0].file).toBe('main');
  });

  it('keeps AST-only generation AST-only with no file paths', () => {
    const { documents } = prepare('/abs/work/main.shitae');
    const embedded = modelOf(toSimulator(documents, 'main'));
    expect(embedded.metadata.sourceBasis).toBe('ast');
    expect(embedded.files).toEqual([]);
    expect(embedded.metadata.manifest[0].file).toBeNull();
  });
});
