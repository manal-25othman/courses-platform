// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * One ESLint configuration for the whole repository.
 *
 * Kept in a single file on purpose: one place to look when a rule fires,
 * rather than a config per package.
 */
export default tseslint.config(
  {
    // Never lint generated or installed code.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/next-env.d.ts',
      'apps/api/prisma/migrations/**',
    ],
  },

  // --- Baseline for every TypeScript file ---------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts}'],
    rules: {
      // Unused variables are an error, but an underscore prefix marks a
      // deliberately unused one (e.g. a required-but-ignored parameter).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // `any` defeats the type safety the whole stack depends on.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // --- API: NestJS uses decorators and empty constructor-injection classes --
  {
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // --- Seed script runs in Node and prints to the console ------------------
  {
    files: ['apps/api/prisma/seed.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // --- Web: Next.js and React hooks rules ----------------------------------
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
      // The app router is used exclusively; there is no `pages/` directory
      // for this rule to check against.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
);
