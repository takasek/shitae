import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const CLI = join(import.meta.dirname, '../dist/index.js');
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(files: Record<string, string>): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'shitae-module-loading-')));
  directories.push(dir);
  for (const [name, source] of Object.entries(files)) {
    const file = join(dir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
  }
  return join(dir, 'main.shitae');
}

function run(command: string, file: string) {
  const result = spawnSync(process.execPath, [CLI, command, file], {
    encoding: 'utf8', input: '', maxBuffer: 10 * 1024 * 1024, timeout: 10_000,
  });
  expect(result.error).toBeUndefined();
  return result;
}

describe('CLI module identity is the resolved file', () => {
  it('checks both same-named imports in different directories', () => {
    const file = fixture({
      'main.shitae': 'import left/view as left\nimport right/view as right\n# Home\n',
      'left/view.shitae': 'import status as status\n# Left\n> Save -> set(status::Status##Saved)\n',
      'right/view.shitae': 'import status as status\n# Right\n> Save -> set(status::Status##Saved)\n',
      'left/status.shitae': '#! Status\n## Saved\n',
      'right/status.shitae': '# Status\n## Saved\n',
    });
    const result = run('check', file);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.match(/E030/g)).toHaveLength(1);
    expect(result.stderr).toContain(`${join(dirname(file), 'right/view.shitae')}:3: [error] E030`);
  });

  it('reports parse errors from a nested import sharing the entry basename', () => {
    const file = fixture({
      'main.shitae': 'import nested/view as view\n# Home\n',
      'nested/view.shitae': 'import main as local\n# View\n',
      'nested/main.shitae': '# Broken\n> Leave -> exit()\n',
    });
    const result = run('check', file);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`${join(dirname(file), 'nested/main.shitae')}:2: [error]`);
  });

  it('reports a shared file only once when imported through different relative paths', () => {
    const file = fixture({
      'main.shitae': 'import shared as direct\nimport nested/view as view\n# Home\n',
      'nested/view.shitae': 'import ../shared as shared\n# View\n',
      'shared.shitae': '# Regular\n> Save -> set(Regular##Saved)\n## Saved\n',
    });
    const result = run('check', file);
    expect(result.status).toBe(1);
    expect(result.stderr.match(/E030/g)).toHaveLength(1);
    expect(result.stderr).toContain(`${join(dirname(file), 'shared.shitae')}:2: [error] E030`);
  });

  it.each(['check', 'mermaid', 'simulate', 'session'])('%s accepts circular imports using relative paths', (command) => {
    const file = fixture({
      'main.shitae': 'import nested/view as view\n# Home\n> Open -> push(view::View)\n',
      'nested/view.shitae': 'import ../main as home\n# View\n> Return -> push(home::Home)\n',
    });
    const result = run(command, file);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
