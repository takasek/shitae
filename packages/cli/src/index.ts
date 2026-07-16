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
  modulePaths: Map<string, string>;
  failed: boolean;
} {
  const documents = new Map<string, Document>();
  const diagnosticsMap = new Map<string, Diagnostic[]>();
  const modulePaths = new Map<string, string>();
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

    modulePaths.set(moduleName, absPath);
    const { document, diagnostics } = parse(source);
    documents.set(moduleName, document);
    diagnosticsMap.set(moduleName, diagnostics);

    const baseDir = dirname(absPath);
    for (const imp of document.imports) {
      load(imp.module, resolvePath(baseDir, imp.module + '.shitae'), visited);
    }
  }

  load(entryModule, entryPath, new Set());
  return { documents, diagnostics: diagnosticsMap, modulePaths, failed };
}

function printDiags(items: Array<{ diag: Diagnostic; path: string }>): void {
  for (const { diag, path } of items) {
    process.stderr.write(`${path}:${diag.span.line}: [${diag.severity}] ${diag.code}: ${diag.message}\n`);
  }
}

const { documents, diagnostics: diagnosticsMap, modulePaths, failed } = loadDocuments();

if (failed) {
  process.exit(1);
}

const parseDiags = diagnosticsMap.get(entryModule) ?? [];

if (command === 'check') {
  // プロジェクト単位の検査（ADR-0021 A2+B2）: エントリ + 全 import 先モジュールそれぞれについて
  // parse 診断と check() の診断を集約し、モジュールごとの実ファイルパスで報告する。
  const project = resolveProject(documents);
  const all: Array<{ diag: Diagnostic; path: string }> = [];
  for (const [moduleName, doc] of documents) {
    const path = modulePaths.get(moduleName) ?? entryPath;
    for (const d of diagnosticsMap.get(moduleName) ?? []) {
      all.push({ diag: d, path });
    }
    const moduleResolved = project.getModule(moduleName)!;
    for (const d of check(doc, moduleResolved, { project })) {
      all.push({ diag: d, path });
    }
  }
  printDiags(all);
  process.exit(all.filter(({ diag }) => diag.severity === 'error').length > 0 ? 1 : 0);
} else if (command === 'mermaid') {
  const errors = parseDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    printDiags(errors.map(d => ({ diag: d, path: entryPath })));
    process.exit(1);
  }
  const project = resolveProject(documents);
  const mainResolved = project.getModule(entryModule)!;
  const checkDiags = check(documents.get(entryModule)!, mainResolved);
  printDiags(checkDiags.map(d => ({ diag: d, path: entryPath })));
  process.stdout.write(toMermaid(documents.get(entryModule)!) + '\n');
  process.exit(0);
} else if (command === 'simulate') {
  const errors = parseDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    printDiags(errors.map(d => ({ diag: d, path: entryPath })));
    process.exit(1);
  }
  process.stdout.write(toSimulator(documents, entryModule) + '\n');
  process.exit(0);
} else {
  process.stderr.write(`Error: unknown command '${command}'. Use 'check', 'mermaid', or 'simulate'.\n`);
  process.exit(1);
}
