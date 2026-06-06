#!/usr/bin/env node
import { readFileSync } from 'fs';
import { parse } from '@shitae/parser';
import { resolve } from '@shitae/resolver';
import { check } from '@shitae/checker';
import { toMermaid } from '@shitae/transpiler-mermaid';

const [, , command, filePath] = process.argv;

if (!command || !filePath) {
  process.stderr.write('Usage: shitae <check|mermaid> <file>\n');
  process.exit(1);
}

let source: string;
try {
  source = readFileSync(filePath, 'utf8');
} catch {
  process.stderr.write(`Error: cannot read '${filePath}'\n`);
  process.exit(1);
}

const { document, diagnostics: parseDiags } = parse(source);

if (command === 'check') {
  const checkDiags = check(document, resolve(document));
  const all = [...parseDiags, ...checkDiags];
  for (const d of all) {
    process.stderr.write(`${filePath}:${d.span.line}: [${d.severity}] ${d.code}: ${d.message}\n`);
  }
  process.exit(all.filter(d => d.severity === 'error').length > 0 ? 1 : 0);
} else if (command === 'mermaid') {
  const errors = parseDiags.filter(d => d.severity === 'error');
  if (errors.length > 0) {
    for (const d of errors) {
      process.stderr.write(`${filePath}:${d.span.line}: [error] ${d.code}: ${d.message}\n`);
    }
    process.exit(1);
  }
  const checkDiags = check(document, resolve(document));
  for (const d of checkDiags) {
    process.stderr.write(`${filePath}:${d.span.line}: [${d.severity}] ${d.code}: ${d.message}\n`);
  }
  process.stdout.write(toMermaid(document) + '\n');
  process.exit(0);
} else {
  process.stderr.write(`Error: unknown command '${command}'. Use 'check' or 'mermaid'.\n`);
  process.exit(1);
}
