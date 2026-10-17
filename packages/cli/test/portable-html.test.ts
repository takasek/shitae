import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { loadModel } from '../dist/model.js';

const CLI = join(import.meta.dirname, '../dist/index.js');
const NOTE_PATH = '/Users/someone/notes.shitae';
const SOURCES: Record<string, string> = {
  'main.shitae': `import screens/list as sl\nimport parts/list as pl\nimport alias/list as al\n\n# Home\n> Open -> ${NOTE_PATH} を開く ; push(sl::ScreenList)\n> Parts -> push(pl::PartList)\n> Alias -> push(al::PartList)\n`,
  'screens/list.shitae': '# ScreenList\nitem\n> Back -> back()\n',
  'parts/list.shitae': '# PartList\nrow\n> Back -> back()\n',
};
const cleanup: Array<() => void> = [];
afterAll(() => { while (cleanup.length) cleanup.pop()!(); });

/** Builds the same model under a fresh absolute directory; `alias` is a symlinked directory pointing at `parts`. */
function fixture(dirName: string) {
  const parent = mkdtempSync(join(tmpdir(), 'shitae-portable-'));
  cleanup.push(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, dirName);
  for (const [name, text] of Object.entries(SOURCES)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  symlinkSync('parts', join(dir, 'alias'));
  const leaks = [dir, realpathSync(dir), parent, realpathSync(parent), parent.split('/').at(-1)!];
  return { dir, main: join(dir, 'main.shitae'), leaks };
}
const simulate = (main: string) => execFileSync(process.execPath, [CLI, 'simulate', main], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const modelOf = (html: string) => JSON.parse(html.match(/^const MODEL = (.*);$/m)![1]!);

function startSession(file: string, args: string[] = []) {
  const child = spawn(process.execPath, [CLI, 'session', file, ...args]);
  cleanup.push(() => { if (child.exitCode == null) child.kill(); });
  let stderr = '';
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
  const closed = once(child, 'close');
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  const request = async (r: unknown) => {
    child.stdin.write(JSON.stringify(r) + '\n');
    const line = await lines.next();
    if (line.done) throw new Error(`Session exited before response: ${stderr}`);
    return JSON.parse(line.value);
  };
  return { request, finish: async () => { child.stdin.end(); const [code] = await closed; return { code, stderr }; } };
}

function gui(html: string) {
  const app = { innerHTML: '' };
  const ctx = vm.createContext({ crypto: webcrypto, structuredClone, TextEncoder, Blob, console, setTimeout: () => 0,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    document: { getElementById: () => app, createElement: () => ({ click() {}, remove() {} }) } });
  vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!, ctx);
  const run = (code: string) => vm.runInContext(code, ctx);
  return { app, run, load: (text: string) => { ctx.scenarioText = text; return run('loadScenarioText(scenarioText)'); } };
}

/** A model whose own text names its own absolute directory (as typed and as resolved), so the directory is also model content. */
function selfReferencing(dirName: string) {
  const parent = mkdtempSync(join(tmpdir(), 'shitae-portable-self-'));
  cleanup.push(() => rmSync(parent, { recursive: true, force: true }));
  const dir = join(parent, dirName), real = join(realpathSync(parent), dirName);
  mkdirSync(dir, { recursive: true });
  const mentioned = [`${dir}/memo.shitae`, `${real}/memo.shitae`];
  const main = join(dir, 'main.shitae');
  writeFileSync(main, `# Home\n${mentioned.map((path, i) => `> Memo${i} -> ${path} を開く\n`).join('')}`);
  return { dir, real, main, mentioned };
}

describe('a directory written in the model text is content, not a path to scrub (issue #28)', () => {
  it('keeps the model\'s own absolute directory verbatim in MODEL.documents while files and the manifest carry none', () => {
    const f = selfReferencing('own-dir');
    const model = modelOf(simulate(f.main));
    const documents = JSON.stringify(model.documents);
    for (const path of f.mentioned) expect(documents).toContain(JSON.stringify(path).slice(1, -1));
    const files = [...model.files.map(([, file]: [string, string]) => file), ...model.metadata.manifest.map((m: { file: string | null }) => m.file)];
    expect(files).toEqual(['main.shitae', 'main.shitae']);
    for (const file of files) for (const dir of [f.dir, f.real]) { expect(file).not.toContain(dir); expect(file.startsWith('/')).toBe(false); }
  });
});

describe('shared simulator HTML does not leak absolute paths (issue #28)', () => {
  let a: ReturnType<typeof fixture>, b: ReturnType<typeof fixture>, htmlA: string, htmlB: string;
  beforeAll(() => {
    a = fixture('first'); b = fixture('作業 ディレクトリ');
    htmlA = simulate(a.main); htmlB = simulate(b.main);
  });

  it('is byte-identical across directories and mentions neither directory', () => {
    expect(htmlA).toBe(htmlB);
    for (const html of [htmlA, htmlB]) for (const leak of [...a.leaks, ...b.leaks]) expect(html).not.toContain(leak);
  });

  it('embeds distinct module-relative display files in MODEL.files and the manifest', () => {
    const model = modelOf(htmlA);
    const expected: Record<string, string> = { main: 'main.shitae', 'screens/list': 'screens/list.shitae', 'parts/list': 'parts/list.shitae' };
    expect(Object.fromEntries(model.files)).toEqual(expected);
    expect(model.files).toHaveLength(3);
    expect(model.documents.map(([module]: [string]) => module).sort()).toEqual(['main', 'parts/list', 'screens/list']);
    expect(Object.fromEntries(model.metadata.manifest.map((m: { module: string; file: string }) => [m.module, m.file]))).toEqual(expected);
    expect(new Set(model.metadata.manifest.map((m: { file: string }) => m.file)).size).toBe(3);
    expect(model.entryModule).toBe('main');
  });

  it('keeps model identity, engine version, source basis and source hashes equal to loadModel', () => {
    const local = loadModel(a.main).metadata, other = loadModel(b.main).metadata;
    expect(other.modelId).toBe(local.modelId);
    for (const html of [htmlA, htmlB]) {
      const { metadata } = modelOf(html);
      expect(metadata.modelId).toBe(local.modelId);
      expect(metadata.engineVersion).toBe(local.engineVersion);
      expect(metadata.sourceBasis).toBe(local.sourceBasis);
      expect(metadata.entryModule).toBe(local.entryModule);
      expect(metadata.manifest.map(({ module, sourceSha256 }: { module: string; sourceSha256: string }) => ({ module, sourceSha256 })))
        .toEqual(local.manifest.map(({ module, sourceSha256 }) => ({ module, sourceSha256 })));
    }
  });

  it('keeps a path written in the model text verbatim', () => {
    expect(htmlA).toContain(NOTE_PATH);
    expect(JSON.stringify(modelOf(htmlA).documents)).toContain(NOTE_PATH);
  });

  it('loads a CLI scenario from the other directory, and a scenario exported from the page replays through the CLI', async () => {
    const first = startSession(a.main);
    const actions = (await first.request({ id: 1, command: 'query', select: ['actions'] })).data.actions.items;
    const open = actions.find((x: { actionText: string }) => x.actionText === 'Open');
    await first.request({ id: 2, command: 'dispatch', handle: open.handle });
    const before = await first.request({ id: 3, command: 'query', select: ['state'] });
    const exported = (await first.request({ id: 4, command: 'exportScenario' })).scenario;
    expect(await first.finish()).toMatchObject({ code: 0, stderr: '' });
    expect(before.summary.location.component).toBe('ScreenList');

    const page = gui(htmlB);
    await page.load(JSON.stringify(exported));
    expect(page.app.innerHTML).toContain('シナリオを読み込みました');
    expect(page.app.innerHTML).not.toContain('MODEL_MISMATCH');
    const fromPage = await page.run('buildScenarioJson()');
    expect(JSON.parse(fromPage)).toEqual(exported);

    const sidecar = join(dirname(b.main), 'from-html.scenario.json');
    writeFileSync(sidecar, fromPage);
    const replayed = startSession(b.main, ['--replay', sidecar]);
    const after = await replayed.request({ id: 1, command: 'query', select: ['state'] });
    expect(after.summary.location).toEqual(before.summary.location);
    expect(after.data.state.frames).toEqual(before.data.state.frames);
    expect((await replayed.request({ id: 2, command: 'exportScenario' })).scenario).toEqual(exported);
    expect(await replayed.finish()).toMatchObject({ code: 0, stderr: '' });
  });
});
