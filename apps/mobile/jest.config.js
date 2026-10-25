/** @type {import('jest').Config} */
module.exports = {
  displayName: 'mobile',
  // The web preset, not the native one, and deliberately — see ADR-008. Under
  // Jest 30 the native preset dies before any test runs: Expo installs lazy
  // globals whose getters require a module, and Jest 30 refuses to load modules
  // outside a test body ("outside of the scope of the test code").
  preset: 'jest-expo/web',
  rootDir: __dirname,
  // pnpm keeps almost every dependency in the workspace root, which Jest treats
  // as "outside the scope of the test code" unless it is a declared root.
  roots: ['<rootDir>', '<rootDir>/../../node_modules', '<rootDir>/../../packages'],
  testMatch: ['<rootDir>/src/**/*.test.tsx', '<rootDir>/src/**/*.test.ts'],
};
