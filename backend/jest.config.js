/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  moduleNameMapper: {
    // Redirect db imports from src/modules/* to the mock
    '^../../db$': '<rootDir>/src/__tests__/__mocks__/db.ts',
    '^../../db/index$': '<rootDir>/src/__tests__/__mocks__/db.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
};
