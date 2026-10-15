import { readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { parse } from '@shitae/parser';
import { createMetadata } from '@shitae/session/model';
import type { Document, Diagnostic } from '@shitae/ast';

/** Fixed model: canonical real file identity, relocatable module IDs, original source bytes. */
export function loadModel(entryPath: string) {
  const entryFile = realpathSync(entryPath), root = dirname(entryFile);
  const documents = new Map<string, Document>(), files = new Map<string, string>();
  const sources = new Map<string, Uint8Array>(), diagnostics = new Map<string, Diagnostic[]>();
  function load(path: string): string {
    const file = realpathSync(path);
    const module = relative(root, file).split(sep).join('/').replace(/\.shitae$/, '');
    if (documents.has(module)) return module;
    const bytes = readFileSync(file), result = parse(bytes.toString('utf8'));
    documents.set(module, result.document); files.set(module, file);
    sources.set(module, bytes); diagnostics.set(module, result.diagnostics);
    for (const imp of result.document.imports) imp.module = load(resolve(dirname(file), imp.module + '.shitae'));
    return module;
  }
  const entryModule = load(entryFile);
  return { documents, entryModule, modulePaths: files, diagnostics, sources, failed: false,
    metadata: createMetadata(documents, entryModule, files, sources) };
}
