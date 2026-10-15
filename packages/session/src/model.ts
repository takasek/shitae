/** Node-only model preparation. The browser Session entry never imports this module. */
import { createHash } from 'node:crypto';
import { engineVersion } from './engine-version.js';
export { engineVersion } from './engine-version.js';
import type { Document } from '@shitae/ast';
import type { ModelMetadata } from './metadata.js';

const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export function engineIdentity(inputs: Array<[string, string]>): string {
  return hash(JSON.stringify([...inputs].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
export function createMetadata(documents: Map<string, Document>, entryModule: string, files = new Map<string, string>(),
  sources?: Map<string, Uint8Array>, engine = engineVersion): ModelMetadata {
  const manifest = [...documents].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([module, document]) => {
    if (sources && !sources.has(module)) throw new Error(`Missing source bytes: ${module}`);
    return { module, sourceSha256: hash(sources ? sources.get(module)! : JSON.stringify(document)), file: files.get(module) ?? null };
  });
  const sourceBasis = sources ? 'source-bytes' : 'ast';
  return { engineVersion: engine, entryModule, sourceBasis, manifest,
    modelId: hash(JSON.stringify({ protocolVersion: 1, engineVersion: engine, entryModule, sourceBasis,
      modules: manifest.map(({ module, sourceSha256 }) => ({ module, sourceSha256 })) })) };
}
