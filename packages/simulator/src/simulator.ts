import { readFileSync } from 'node:fs';
import { createMetadata } from '@shitae/session/model';
import type { ModelMetadata } from '@shitae/session';
import type { Document } from '@shitae/ast';
import { extractSimData } from './extract.js';
import type { SimulatorConfig } from './extract.js';

type SimulatorModel = { files: Map<string, string>; metadata: ModelMetadata };

/** Display copy of a real file path: the module ID plus the `.shitae` suffix when the real file has one, so shared HTML never carries the author's directory. */
function displayFile(module: string, file: string): string {
  return file.endsWith('.shitae') ? module + '.shitae' : module;
}

function embeddedModel(documents: Map<string, Document>, entryModule: string, model?: SimulatorModel) {
  if (!model) return { documents: [...documents], entryModule, files: [], metadata: createMetadata(documents, entryModule) };
  return {
    documents: [...documents], entryModule,
    files: [...model.files].map(([module, file]) => [module, displayFile(module, file)]),
    metadata: { ...model.metadata, manifest: model.metadata.manifest.map((m) => ({ ...m, file: m.file === null ? null : displayFile(m.module, m.file) })) },
  };
}

function readBrowserAsset(name: string): string {
  return readFileSync(new URL(`./browser/${name}`, import.meta.url), 'utf8');
}

export function toSimulator(
  documents: Map<string, Document>,
  entryModule: string,
  config?: SimulatorConfig,
  model?: SimulatorModel,
): string {
  const data = extractSimData(documents, entryModule, config);
  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const json = safeJson(data);
  const modelJson = safeJson(embeddedModel(documents, entryModule, model));
  const bundle = readFileSync(new URL('../dist/session-browser.js', import.meta.url), 'utf8');
  const sessionScript = readFileSync(new URL('./gui-session.js', import.meta.url), 'utf8');
  const stylesheet = readBrowserAsset('simulator.css');
  const viewScript = ['panels.js', 'cards.js', 'graph.js', 'render.js'].map(readBrowserAsset).join('\n');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>shitae simulator</title>
<style>
${stylesheet}</style>
</head>
<body>
<div id="app"></div>
<script>
const DATA = ${json};
const app = document.getElementById('app');
${bundle}
const MODEL = ${modelJson};
${sessionScript}
${viewScript}</script>
</body>
</html>`;
}
