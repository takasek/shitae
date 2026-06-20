import { defineConfig } from 'vitest/config';
import { shitaeAliases } from '../../vitest.shared';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    passWithNoTests: true,
  },
  resolve: { alias: shitaeAliases },
});
