import { defineConfig } from '@lobehub/eslint-config';

export default defineConfig(
  {
    ignores: [
      '**/pnpm-lock.yaml',
      '.ryugi/**',
      'evals/**',
      '.worktrees/**',
      'skills/artifacts/app/viewer/**',
      'skills/artifacts/app/runtime/**',
      'skills/artifacts/app/cli.cjs',
      'skills/artifacts/app/server.cjs',
    ],
    react: 'vite',
    typescript: true,
  },
  {
    rules: {
      // Prettier lowercases hex digits while unicorn's fixer uppercases them.
      'unicorn/number-literal-case': 'off',
      // Its fixer rewrites `.filter().at(-1)` to `findLast`, which the ES2022 lib does not include.
      'unicorn/prefer-array-find': 'off',
    },
  },
);
