import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLI = join(import.meta.dirname, '../dist/index.js');

describe('simulate stdout の完全性', () => {
  let directory: string;
  let model: string;
  let expected: Buffer;

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'shitae-stdout-'));
    model = join(directory, 'large.shitae');
    // 日本語と 4-byte UTF-8 文字を含む、pipe のバッファより十分大きい入力。
    const label = '日本語🙂'.repeat(512);
    writeFileSync(model, Array.from({ length: 128 }, (_, i) =>
      `# 画面${i}\n"${label}": 内容\n> 次へ -> push(画面${(i + 1) % 128})\n`
    ).join('\n'));

    const output = join(directory, 'expected.html');
    const fd = openSync(output, 'w');
    try {
      const child = spawn(process.execPath, [CLI, 'simulate', model], {
        stdio: ['ignore', fd, 'pipe'],
        timeout: 10_000,
      });
      const completion = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      const stderr: Buffer[] = [];
      child.stderr!.on('data', chunk => stderr.push(chunk));
      expect(await completion).toBe(0);
      expect(Buffer.concat(stderr).toString('utf8')).toBe('');
    } finally {
      closeSync(fd);
    }
    expected = readFileSync(output);
    expect(expected.length).toBeGreaterThan(256 * 1024);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(expected)).toContain(label);
    expect(expected.toString('utf8')).toMatch(/<\/html>\n$/);
  }, 15_000);

  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('通常の pipe capture が通常ファイルと byte 単位で一致する', async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, 'simulate', model], {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 10_000,
    });
    expect(stderr.length).toBe(0);
    expect(stdout.equals(expected)).toBe(true);
  }, 15_000);

  it('低速 reader でも成功終了までに全 byte を受け取れる', async () => {
    const child = spawn(process.execPath, [CLI, 'simulate', model], {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    const completion = new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    const stderr: Buffer[] = [];
    child.stderr!.on('data', chunk => stderr.push(chunk));
    const chunks: Buffer[] = [];
    // 読み始めを遅らせ、各 chunk の消費にも待機を入れて backpressure を掛ける。
    await delay(100);
    for await (const chunk of child.stdout!) {
      chunks.push(chunk);
      await delay(5);
    }
    expect(await completion).toEqual({ code: 0, signal: null });
    expect(Buffer.concat(stderr).toString('utf8')).toBe('');
    expect(Buffer.concat(chunks).equals(expected)).toBe(true);
  }, 15_000);
});
