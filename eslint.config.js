import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'graft/**',
      'coverage/**',
      '.eslintcache',
      'src/manifest.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // The codebase intentionally uses `any` at integration boundaries
      // (chrome.* APIs, DOM payloads, LLM tool args). Keep it visible but non-blocking.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused vars are frequently intentional (destructured rest, ignored args).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-function': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      // Base rule is superseded by the TypeScript-aware variant above.
      'no-unused-vars': 'off',
    },
  },
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // React Compiler–era rules shipped with eslint-plugin-react-hooks v7 fire on
      // legitimate, idiomatic React 18 code in this codebase (e.g. syncing state from
      // an effect). Keep them visible as warnings instead of blocking the build.
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/void-use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
    },
  },
  {
    rules: {
      // ESLint 10 core rules that are stylistic preferences rather than defects:
      // - preserve-caught-error: this codebase re-throws with the original message
      //   interpolated into the new message instead of using `{ cause }`.
      // - no-useless-assignment: flags the `let x = ''` initialization pattern that
      //   TypeScript requires for definite assignment before the branches assign.
      'preserve-caught-error': 'warn',
      'no-useless-assignment': 'warn',
    },
  },
);
