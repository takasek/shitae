import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const B=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const state=readFileSync(B+'/trial-state.mjs','utf8').replace('export function','function');
const data=readFileSync(B+'/materials/history-data.js','utf8');
const html=readFileSync(B+'/ui-proposal.html','utf8')
.replace('<script src="materials/history-data.js"></script>',`<script>${data}</script>`)
.replace('<script type="module">','<script>')
.replace("import {createTrial} from './trial-state.mjs';",state);
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);
writeFileSync(B+'/standalone-preview.html',html);
console.log('Standalone preview generated from tested sources; script syntax valid.');
