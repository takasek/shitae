import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const CLI = join(import.meta.dirname, '../dist/index.js');
const BATTLE = join(import.meta.dirname, '../../../docs/example-battle.shitae');
const ECOMMERCE = join(import.meta.dirname, '../../../docs/example-ecommerce.shitae');

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI, ...args]);
    return { stdout, stderr, code: 0 };
  } catch (e: any) {
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

describe('shitae check', () => {
  it('battle サンプルで exit 0', async () => {
    const { code, stderr } = await runCli(['check', BATTLE]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  it('ecommerce サンプルで exit 0', async () => {
    const { code, stderr } = await runCli(['check', ECOMMERCE]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  it('構文エラーで exit 1', async () => {
    const tmp = '/tmp/shitae_cli_test.shitae';
    writeFileSync(tmp, '# A\n---\n行動 -> exit()\n');
    try {
      const { code, stderr } = await runCli(['check', tmp]);
      expect(code).toBe(1);
      expect(stderr).toContain('[error]');
    } finally {
      unlinkSync(tmp);
    }
  });

  it('引数なしで usage 表示', async () => {
    const { code, stderr } = await runCli([]);
    expect(code).toBe(1);
    expect(stderr).toContain('Usage:');
  });
});

describe('shitae mermaid', () => {
  it('battle → flowchart LR を stdout', async () => {
    const { stdout, code } = await runCli(['mermaid', BATTLE]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^flowchart LR/);
  });

  it('ecommerce → flowchart LR を stdout', async () => {
    const { stdout, code } = await runCli(['mermaid', ECOMMERCE]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^flowchart LR/);
  });

  it('不明コマンドで exit 1', async () => {
    const { code, stderr } = await runCli(['unknown', BATTLE]);
    expect(code).toBe(1);
    expect(stderr).toContain('unknown command');
  });
});
