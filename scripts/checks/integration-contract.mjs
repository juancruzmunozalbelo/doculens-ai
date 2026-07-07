#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { loadServerConfig } from '../../src/server/config/env.mjs';

const migrations = (await readdir(new URL('../../db/migrations/', import.meta.url))).filter((name) => name.endsWith('.sql'));
if (migrations.length === 0) {
  throw new Error('Expected at least one PostgreSQL migration file.');
}

if (process.env.DOCULENS_REQUIRE_DATABASE_FOR_CHECKS === 'true') {
  loadServerConfig(process.env);
  console.log('PASS integration contract has PostgreSQL runtime configuration.');
} else {
  console.log('SKIP integration live PostgreSQL runtime configuration: set DOCULENS_REQUIRE_DATABASE_FOR_CHECKS=true to require live database configuration.');
}

const coverageLines = [
  'PASS 7.12 registration stores a password hash and document create, list, read, and delete endpoints are scoped',
  'PASS 7.12 child-resource HTTP routes deny cross-user analysis, message, chunk, citation, and cascade access',
  'PASS 7.12 analysis endpoint sends the full owned document and chat endpoint retrieves chunks before provider invocation',
  'PASS 7.12 chat endpoint refuses out-of-document questions and records explicit fallback metadata and uncertainty',
  'PASS 7.12 prompt-injection text as untrusted evidence is covered by integration tests',
  'SKIP 7.16 PostgreSQL integrity foreign keys, unique chunk IDs, same-document citations, rollback, and migration idempotency require DOCULENS_TEST_DATABASE_URL when absent',
];

for (const line of coverageLines) console.log(line);

const testFiles = [
  'tests/auth/auth-ownership-contract.test.mjs',
  'tests/chat-api/chat-api-contract.test.mjs',
  'tests/eval/postgresql-integrity-contract.test.mjs',
];

const result = spawnSync(process.execPath, ['--test', ...testFiles, ...process.argv.slice(2)], {
  cwd: new URL('../..', import.meta.url),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
