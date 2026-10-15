import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const base = resolve(import.meta.dirname, '..');
mkdirSync(resolve(base, 'dist'), { recursive: true });
await build({ entryPoints: [resolve(base, '../session/src/index.ts')], bundle: true, platform: 'browser',
  format: 'iife', globalName: 'Shitae', outfile: resolve(base, 'dist/session-browser.js'), target: 'es2022' });
copyFileSync(resolve(base, 'src/gui-session.js'), resolve(base, 'dist/gui-session.js'));
