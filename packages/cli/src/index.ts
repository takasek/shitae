#!/usr/bin/env node
import { readFileSync } from 'fs';
import { resolve as resolvePath, dirname, basename } from 'path';
import { parse } from '@shitae/parser';
import { resolveProject } from '@shitae/resolver';
import { check } from '@shitae/checker';
import { toMermaid } from '@shitae/transpiler-mermaid';
import { toSimulator } from '@shitae/simulator';
import type { Document, Diagnostic } from '@shitae/ast';

const [, , command, filePath] = process.argv;

if (!command || !filePath) {
  process.stderr.write('Usage: shitae <check|mermaid|simulate> <file>\n');
  process.exit(1);
}

const entryPath = resolvePath(filePath);
const entryModule = basename(entryPath, '.shitae');

function loadDocuments(): {
  documents: Map<string, Document>;
  diagnostics: Map<string, Diagnostic[]>;
  failed: boolean;
} {
  const documents = new Map<string, Document>();
  const diagnosticsMap = new Map<string, Diagnostic[]>();
  let failed = false;

  function load(moduleName: string, absPath: string, visited: Set<string>): void {
    if (visited.has(moduleName)) return;
    visited.add(moduleName);

    let source: string;
    try {
      source = readFileSync(absPath, 'utf8');
    } catch {
      process.stderr.write(`Error: cannot read '${absPath}'\n`);
      failed = true;
      return;
    }

    const { document, diagnostics } = parse(source);
    documents.set(moduleName, document);
    diagnosticsMap.set(moduleName, diagnostics);

    const baseDir = dirname(absPath);
    for (const imp of document.imports) {
      load(imp.module, resolvePath(baseDir, imp.module + '.shitae'), visited);
    }
  }

  load(entryModule, entryPath, new Set());
  return { documents, diagnostics: diagnosticsMap, failed };
}

function printDiags(diags: Diagnostic[]): void {
  for (const d of diags) {
    process.stderr.write(`${filePath}:${d.span.line}: [${d.severity}] ${d.code}: ${d.message}\n`);
  }
}

const { documents, diagnostics: diagnosticsMap, failed } = loadDocuments();

if (failed) {
  process.exit(1);
}

const parseDiags = diagnosticsMap.get(entryModule) ?? [];

if (command === 'check') {
  const project = resolveProject(documents);
  const mainResolved = project.getModule(entryModule)!;
  const checkDiags = check(documents.get(entryModule)!, mainResolved);
  const all = [...parseDiags, ...checkDiags];
  printDiags(all);
  process.exit(all.filter(d => d.severity === 'error').length > 0 ? 1 : 0);
} else if (command === 'mermaid') {
  const errors = parseDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    printDiags(errors);
    process.exit(1);
  }
  const project = resolveProject(documents);
  const mainResolved = project.getModule(entryModule)!;
  const checkDiags = check(documents.get(entryModule)!, mainResolved);
  printDiags(checkDiags);
  process.stdout.write(toMermaid(documents.get(entryModule)!) + '\n');
  process.exit(0);
} else if (command === 'simulate') {
  const errors = parseDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    printDiags(errors);
    process.exit(1);
  }
  process.stdout.write(toSimulator(documents, entryModule) + '\n');
  process.exit(0);
} else {
  process.stderr.write(`Error: unknown command '${command}'. Use 'check', 'mermaid', or 'simulate'.\n`);
  process.exit(1);
}
