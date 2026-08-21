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
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/supabase/tests/tsconfig.json' }],
      },
    },
    '<rootDir>/apps/mobile',
  ],
  // `testTimeout` is a GLOBAL option in a multi-project config — jest-circus
  // reads it off globalConfig, not off the project that matched a given test
  // file, so setting it inside one entry of `projects` above is silently a
  // no-op. It has to live here. PGlite boots a WASM Postgres per `db` suite,
  // which the default 5s does not cover once more than one such suite runs
  // under real CPU contention from the other projects.
  testTimeout: 60000,
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
