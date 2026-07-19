import { describe, it, expect } from 'vitest';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const CLI = join(import.meta.dirname, '../dist/index.js');
const BATTLE = join(import.meta.dirname, '../../../docs/examples/battle.shitae');
const ECOMMERCE = join(import.meta.dirname, '../../../docs/examples/ecommerce.shitae');
const SMARTHOME_MAIN = join(import.meta.dirname, '../../../docs/examples/smarthome/main.shitae');

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

  it('smarthome サンプル（モジュール分割・3 ファイル）で exit 0・無診断（W106 も含め新規診断が出ない）', async () => {
    const { code, stderr } = await runCli(['check', SMARTHOME_MAIN]);
    expect(stderr).toBe('');
    expect(code).toBe(0);
  });

  it('構文エラーで exit 1', async () => {
    const tmp = '/tmp/shitae_cli_test.shitae';
    writeFileSync(tmp, '# A\n行動 -> exit()\n');
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

  it('mermaid コマンドで checker の警告が stderr に出る', async () => {
    // W102: variant 名をコンポーネント名として参照している → 警告出るはず
    const tmp = '/tmp/shitae_mermaid_warning_test.shitae';
    writeFileSync(tmp, '# A\n> 行動 -> goto(検索中)\n# マッチング\n## 検索中\n案内\n## 失敗\n案内\n');
    try {
      const { code, stderr, stdout } = await runCli(['mermaid', tmp]);
      // mermaid 自体は成功（exit 0）
      expect(code).toBe(0);
      // stdout は flowchart
      expect(stdout).toMatch(/^flowchart LR/);
      // W102 警告が stderr に出る
      expect(stderr).toContain('W102');
    } finally {
      unlinkSync(tmp);
    }
  });
});

describe('cross-file import', () => {
  const tmpDir = '/tmp/shitae_crossfile_test';

  it('import したファイルを自動ロードし check が exit 0', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'auth.shitae'), '# ログイン\nID入力\n');
    writeFileSync(
      join(tmpDir, 'main.shitae'),
      'import auth as auth\n# ホーム\n> タップ -> push(auth::ログイン)\n'
    );
    try {
      const { code, stderr } = await runCli(['check', join(tmpDir, 'main.shitae')]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('import ファイルが存在しない場合 stderr にエラー・exit 1', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(
      join(tmpDir, 'main.shitae'),
      'import missing as m\n# ホーム\nロゴ\n'
    );
    try {
      const { code, stderr } = await runCli(['check', join(tmpDir, 'main.shitae')]);
      expect(code).toBe(1);
      expect(stderr).toContain('missing');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('cross-file import で mermaid が exit 0', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'auth.shitae'), '# ログイン\nID入力\n');
    writeFileSync(
      join(tmpDir, 'main.shitae'),
      'import auth as auth\n# ホーム\n> タップ -> push(auth::ログイン)\n'
    );
    try {
      const { code, stdout } = await runCli(['mermaid', join(tmpDir, 'main.shitae')]);
      expect(code).toBe(0);
      expect(stdout).toMatch(/^flowchart LR/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('shitae simulate と simconfig（Task 11: 遷移マップ粒度 config）', () => {
  const tmpDir = '/tmp/shitae_cli_simconfig_test';
  const SRC = '# ホーム\n## 通常\n要素\n## 特殊\n要素2\n';

  it('entry の兄弟 <basename>.simconfig.json があるとき split が graphConfig として埋め込まれる', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'main.shitae'), SRC);
    writeFileSync(
      join(tmpDir, 'main.simconfig.json'),
      JSON.stringify({ graph: { split: [{ module: 'main', component: 'ホーム' }] } }),
    );
    try {
      const { code, stdout, stderr } = await runCli(['simulate', join(tmpDir, 'main.shitae')]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      expect(stdout).toContain('"graphConfig":{"split":[{"module":"main","component":"ホーム"}]}');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('simconfig が無いとき split は空', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'main.shitae'), SRC);
    try {
      const { code, stdout, stderr } = await runCli(['simulate', join(tmpDir, 'main.shitae')]);
      expect(stderr).toBe('');
      expect(code).toBe(0);
      expect(stdout).toContain('"graphConfig":{"split":[]}');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('simconfig が不正 JSON のとき stderr に警告を出して無視する（simulate 自体は成功）', async () => {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'main.shitae'), SRC);
    writeFileSync(join(tmpDir, 'main.simconfig.json'), '{ broken');
    try {
      const { code, stdout, stderr } = await runCli(['simulate', join(tmpDir, 'main.shitae')]);
      expect(code).toBe(0);
      expect(stderr).toContain('simconfig');
      expect(stdout).toContain('"graphConfig":{"split":[]}');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('r4 A2+B2: check はプロジェクト単位（ADR-0021）', () => {
  const tmpDir = '/tmp/shitae_cli_project_check_test';

  // E030 の span は set() 呼び出し site（main.shitae 内）の位置を指す——診断の span は
  // 「その診断を検出した document 内の位置」であり、cross-module 参照先（sub.shitae）の
  // 行番号とは対応しないため、診断のファイルパスは呼び出し元（main.shitae）になるのが
  // 正しい（call-site 帰属。診断ツール一般の慣習と一致）。
  it('import 先の非 singleton への set(mod::X##v) で exit 1、診断は呼び出し元の実ファイルパスで報告される', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const mainPath = join(tmpDir, 'main.shitae');
    writeFileSync(join(tmpDir, 'sub.shitae'), '# 通常\n## x\n要素\n');
    writeFileSync(
      mainPath,
      'import sub as sub\n# ホーム\n> a -> set(sub::通常##x)\n'
    );
    try {
      const { code, stderr } = await runCli(['check', mainPath]);
      expect(code).toBe(1);
      expect(stderr).toContain('E030');
      expect(stderr).toContain(mainPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('import 先に構文エラーがあると exit 1 で報告される', async () => {
    mkdirSync(tmpDir, { recursive: true });
    const subPath = join(tmpDir, 'sub.shitae');
    writeFileSync(subPath, '# A\n行動 -> exit()\n');
    writeFileSync(
      join(tmpDir, 'main.shitae'),
      'import sub as sub\n# ホーム\nロゴ\n'
    );
    try {
      const { code, stderr } = await runCli(['check', join(tmpDir, 'main.shitae')]);
      expect(code).toBe(1);
      expect(stderr).toContain('[error]');
      expect(stderr).toContain(subPath);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
