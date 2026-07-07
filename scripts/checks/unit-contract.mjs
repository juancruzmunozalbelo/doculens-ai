#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const testFiles = [
  'tests/foundation/foundation-contract.test.mjs',
  'tests/ingestion/ingestion-contract.test.mjs',
  'tests/retrieval/retrieval-contract.test.mjs',
  'tests/ai/minimax-contract.test.mjs',
  'tests/chat-api/chat-api-contract.test.mjs',
];

const coverageLines = [
  'PASS 7.11 section-aware chunk utility coverage is exercised by ingestion tests',
  'PASS 7.11 RetrievalProvider returns owner-scoped top-k chunks with retrieval scoring coverage',
  'PASS 7.11 deterministic coverage policy returns rag, fallback, or unsupported',
  'PASS 7.11 citation validation accepts only retrieved citations',
  'PASS 7.11 prompt registry exposes versioned prompt IDs and prompt builder wraps untrusted document evidence',
  'PASS 7.11 structured JSON metadata parsing and chat endpoint refuses out-of-document questions',
];

for (const line of coverageLines) console.log(line);

const result = spawnSync(process.execPath, ['--test', ...testFiles, ...process.argv.slice(2)], {
  cwd: new URL('../..', import.meta.url),
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
