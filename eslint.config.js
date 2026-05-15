import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import eslintPluginAstro from 'eslint-plugin-astro'

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Global ignores — debe ir primero ──
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'node_modules/**',
      '*.lock',
      '*.lockb',
      'worker-configuration.d.ts',
      '.wrangler/**',
    ],
  },

  // ── Core JavaScript recommended rules ──
  js.configs.recommended,

  // ── Astro recommended rules (handles .astro parsing + plugin registration) ──
  ...eslintPluginAstro.configs.recommended,

  // ── Accessibility rules adapted for Astro components ──
  ...eslintPluginAstro.configs['jsx-a11y-recommended'],

  // ── TypeScript recommended rules — scoped ONLY to .ts/.tsx files ──
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
  })),

  // ── Custom rule overrides ──
  {
    rules: {
      // Allow console during dev/build — remove when going strictly prod
      'no-console': 'off',
    },
  },

  // ── Astro slots can't be statically analyzed for a11y ──
  {
    files: ['**/*.astro'],
    rules: {
      'astro/jsx-a11y/label-has-associated-control': 'off',
    },
  },
]
