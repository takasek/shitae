import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { createMetadata, engineIdentity } from '../src/model.js';
import { Session } from '../src/index.js';

describe('fixed model identity', () => {
  it('hashes every source byte and engine, is sorted, relocatable and detached', () => {
    const docs = new Map([['main', parse('# Home\nx\n').document], ['sub', parse('# Sub\nx\n').document]]);
    const bytes = new Map([['main', new TextEncoder().encode('# Home\nx\n')], ['sub', new TextEncoder().encode('# Sub\nx\n')]]);
    const files = new Map([['main', '/one/main.shitae'], ['sub', '/one/sub.shitae']]);
    const meta = createMetadata(docs, 'main', files, bytes, 'engine-a');
    expect(meta.manifest.map((m) => m.module)).toEqual(['main', 'sub']);
    expect(meta.sourceBasis).toBe('source-bytes');
    expect(meta.manifest.every((m) => /^[a-f0-9]{64}$/.test(m.sourceSha256))).toBe(true);
    expect(createMetadata(new Map([...docs].reverse()), 'main', new Map([['main', '/two/main.shitae'], ['sub', '/two/sub.shitae']]), bytes, 'engine-a').modelId).toBe(meta.modelId);
    expect(createMetadata(docs, 'main', files, bytes, 'engine-b').modelId).not.toBe(meta.modelId);
    bytes.set('sub', new TextEncoder().encode('# Sub\nx\n// changed\n'));
    expect(createMetadata(docs, 'main', files, bytes, 'engine-a').modelId).not.toBe(meta.modelId);
    const session = new Session(docs, 'main', files, meta);
    meta.manifest[0]!.sourceSha256 = 'corrupted';
    expect(session.query({ select: ['metadata'] }).data!.metadata!.manifest[0]!.sourceSha256).not.toBe('corrupted');
    expect(session.query()).not.toHaveProperty('data');
    expect(engineIdentity([['a.ts', 'code'], ['pnpm-lock.yaml', 'lock']])).not.toBe(engineIdentity([['a.ts', 'changed'], ['pnpm-lock.yaml', 'lock']]));
    expect(createMetadata(docs, 'main').sourceBasis).toBe('ast');
    expect(() => createMetadata(docs, 'main', files, new Map())).toThrow('Missing source bytes');
  });
});
