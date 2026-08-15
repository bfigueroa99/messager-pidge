/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'flight-sim',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/packages/flight-sim/src/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/packages/flight-sim/tsconfig.json' }],
      },
    },
    {
      displayName: 'repo',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tests/tsconfig.json' }],
      },
    },
    {
      displayName: 'db',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/supabase/tests/**/*.test.ts'],
      // PGlite boots a WASM Postgres per suite; the default 5s is not enough.
      testTimeout: 60000,
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/supabase/tests/tsconfig.json' }],
      },
    },
  ],
  collectCoverageFrom: [
    'packages/flight-sim/src/**/*.ts',
    '!packages/flight-sim/src/**/*.test.ts',
    '!packages/flight-sim/src/index.ts',
  ],
  coverageThreshold: {
    // The engine is pure and is the product. Gate it hard; do not chase
    // coverage anywhere else.
    './packages/flight-sim/src/': {
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90,
    },
  },
};
