/** @type {import('jest').Config} */

const fs = require('fs')
const path = require('path')

// Use monorepo source paths when available (dev), fall back to node_modules (standalone)
const omMonorepo = path.resolve(__dirname, '../../open-mercato')
const useMonorepo = fs.existsSync(path.join(omMonorepo, 'packages/core/src'))

const moduleNameMapper = useMonorepo
  ? {
      '^@open-mercato/core/generated/(.*)$': `${omMonorepo}/packages/core/generated/$1`,
      '^@open-mercato/core/(.*)$': `${omMonorepo}/packages/core/src/$1`,
      '^@open-mercato/shared/(.*)$': `${omMonorepo}/packages/shared/src/$1`,
      '^@open-mercato/ui/(.*)$': `${omMonorepo}/packages/ui/src/$1`,
      '^#generated/(.*)$': '<rootDir>/generated/$1',
    }
  : {
      // Standalone: let Node resolve @open-mercato/* from node_modules normally
      // Only map #generated (path alias not resolvable by Node)
      '^#generated/(.*)$': '<rootDir>/generated/$1',
    }

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  watchman: false,
  rootDir: '.',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper,
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/src/**/*.test.(ts|tsx)'],
  passWithNoTests: true,
}
