import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// ワークスペース内の @shitae/* を dist ではなく src の TypeScript へ解決する
// エイリアス。これにより各ライブラリの単体テストは事前ビルドなしで動く。
const packagesDir = fileURLToPath(new URL('./packages', import.meta.url));

const pkg = (name: string) => resolve(packagesDir, name, 'src/index.ts');

export const shitaeAliases = {
  '@shitae/ast': pkg('ast'),
  '@shitae/parser': pkg('parser'),
  '@shitae/resolver': pkg('resolver'),
  '@shitae/checker': pkg('checker'),
  '@shitae/runtime': pkg('runtime'),
  '@shitae/transpiler-mermaid': pkg('transpiler-mermaid'),
};

// 各パッケージ共通の vitest 設定。include は config ファイルのある
// パッケージ基準で解決されるため、そのまま共有してよい。
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
  },
  resolve: { alias: shitaeAliases },
});
