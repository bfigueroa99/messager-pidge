import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/*.d.ts',
      '**/*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      // These are CommonJS tool configs — Metro, Babel and Jest all load them
      // with require(). Banning require() in a file that cannot use import is
      // just noise.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ── The layering rule (anti-drift safeguard C) ─────────────────────────────
  // packages/flight-sim is the pure heart of the product. It runs in three
  // places: the React Native client, the Deno Edge Function, and Jest. If a
  // React or Supabase import ever lands here, the engine stops being portable
  // and — because this container has no simulator — stops being verifiable.
  // Non-determinism is banned for the same reason: every golden test depends
  // on plan() being a pure function of its arguments.
  {
    files: ['packages/flight-sim/**/*.ts'],
    ignores: ['packages/flight-sim/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                'expo',
                'expo-*',
                '@expo/*',
                '@supabase/*',
                'node:*',
                'fs',
                'path',
                'crypto',
              ],
              message:
                'packages/flight-sim must stay dependency-free and runtime-agnostic. It runs in React Native, Deno and Node. See CLAUDE.md > Layering.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Time is a parameter in flight-sim, never ambient. Pass nowMs in.' },
        { name: 'process', message: 'flight-sim must not read the environment.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'flight-sim must be deterministic. Use the seeded PRNG in src/rng.ts so golden tests stay stable.',
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/scripts/**/*.mjs', 'supabase/tests/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
