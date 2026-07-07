#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const options = { mode: 'smoke', scope: 'apps/api/src/server/security', command: 'npm run test:unit' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') options.mode = argv[++index];
    else if (arg === '--scope' || arg === '--mutate') options.scope = argv[++index];
    else if (arg === '--command') options.command = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function boundedScope(scope) {
  const value = String(scope ?? '').trim();
  if (!value || /^(?:\.\/)?(?:\*\*\/\*|apps\/\*\*|src\/\*\*)$/.test(value)) {
    throw new Error('Mutation scope must be explicit and bounded.');
  }
  return value;
}

export function runMutation(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  const scope = boundedScope(options.scope);
  const childEnv = {
    ...env,
    MUTATION_MODE: options.mode,
    MUTATION_SCOPE: scope,
    MUTATION_TEST_COMMAND: options.command,
  };
  const result = spawnSync('npx', ['stryker', 'run', 'stryker.config.mjs', '--mutate', scope], {
    cwd: new URL('../..', import.meta.url),
    env: childEnv,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = runMutation();
  } catch (error) {
    console.error(error.message || String(error));
    process.exitCode = 1;
  }
}
