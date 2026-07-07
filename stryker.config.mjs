const command = process.env.MUTATION_TEST_COMMAND || 'npm run test:unit';
const mutate = (process.env.MUTATION_SCOPE || 'apps/api/src/server/security/**/*.mjs').split(',').map((value) => value.trim()).filter(Boolean);

export default {
  mutate: [
    ...mutate,
    '!tests/**',
    '!**/*.test.*',
    '!**/*.spec.*',
    '!node_modules/**',
    '!dist/**',
    '!coverage/**',
    '!infra/aws/.terraform/**',
  ],
  testRunner: 'command',
  commandRunner: {
    command,
  },
  coverageAnalysis: 'off',
  concurrency: Number(process.env.MUTATION_CONCURRENCY || 2),
  timeoutMS: Number(process.env.MUTATION_TIMEOUT_MS || 60_000),
  thresholds: {
    high: 80,
    low: 60,
    break: process.env.MUTATION_MODE === 'smoke' ? null : 60,
  },
  reporters: ['clear-text', 'progress'],
  tempDirName: '.stryker-tmp',
};
