import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function runNpmScript(script, extraArgs = []) {
  return spawnSync('npm', ['run', script, '--', ...extraArgs], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'ScriptCoverageJwtSecretWithEnoughEntropy123',
      AI_PROVIDER: 'fake',
    },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function hasPlaywrightBinary() {
  return existsSync(path.join(repoRoot, 'node_modules/.bin/playwright'));
}

function outputOf(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function assertScriptListsContracts({ script, args, expectedContracts }) {
  const result = runNpmScript(script, args);
  const output = outputOf(result);
  assert.equal(result.status, 0, `npm run ${script} must be executable before it can prove PR8 coverage; output:\n${output}`);
  const missing = expectedContracts
    .filter(({ pattern }) => !pattern.test(output))
    .map(({ task, contract }) => `${task}: ${contract}`);
  assert.deepEqual(missing, [], `npm run ${script} does not execute required PR8 coverage:\n${missing.join('\n')}`);
}

test('test:unit executes deterministic AI, retrieval, citation, fallback, prompt, schema, and unsupported-answer contracts', () => {
  assertScriptListsContracts({
    script: 'test:unit',
    args: ['--test-reporter=spec'],
    expectedContracts: [
      {
        task: '7.11',
        contract: 'chunking behavior',
        pattern: /section-aware chunk/i,
      },
      {
        task: '7.11',
        contract: 'retrieval scoring and top-k behavior',
        pattern: /RetrievalProvider returns owner-scoped top-k chunks/i,
      },
      {
        task: '7.11',
        contract: 'fallback decision logic',
        pattern: /deterministic coverage policy returns rag, fallback, or unsupported/i,
      },
      {
        task: '7.11',
        contract: 'citation validation',
        pattern: /accepts only retrieved citations|citation.*retrieved/i,
      },
      {
        task: '7.11',
        contract: 'prompt metadata and construction guardrails',
        pattern: /prompt registry exposes versioned prompt IDs|prompt builder wraps untrusted document/i,
      },
      {
        task: '7.11',
        contract: 'schema parsing and unsupported-answer decisions',
        pattern: /structured JSON metadata|refuses out-of-document questions/i,
      },
    ],
  });
});

test('test:integration executes API, authorization, chat routing, prompt-injection, and PostgreSQL integrity contracts', () => {
  assertScriptListsContracts({
    script: 'test:integration',
    args: ['--test-reporter=spec'],
    expectedContracts: [
      {
        task: '7.12',
        contract: 'authentication and owner-scoped documents',
        pattern: /registration stores a password hash|document create, list, read, and delete endpoints are scoped/i,
      },
      {
        task: '7.12',
        contract: 'child-resource denial',
        pattern: /child-resource HTTP routes deny cross-user analysis, message, chunk, citation, and cascade access/i,
      },
      {
        task: '7.12',
        contract: 'analysis and chat endpoint behavior',
        pattern: /analysis endpoint sends the full owned document|chat endpoint retrieves chunks before provider invocation/i,
      },
      {
        task: '7.12',
        contract: 'fallback/refusal routing',
        pattern: /chat endpoint refuses out-of-document questions|explicit fallback metadata and uncertainty/i,
      },
      {
        task: '7.12',
        contract: 'prompt-injection guardrail behavior',
        pattern: /prompt-injection text as untrusted evidence/i,
      },
      {
        task: '7.16',
        contract: 'PostgreSQL integrity invariants are part of integration coverage or explicitly skipped when no database is configured',
        pattern: /PostgreSQL integrity.*foreign keys|SKIP.*PostgreSQL integrity/i,
      },
    ],
  });
});

test('test:e2e lists the canonical Playwright reviewer flow for analysis, chat, citations, retrieved chunks, unsupported answer, and AI metadata', (t) => {
  if (!hasPlaywrightBinary()) {
    t.skip('SKIP Playwright command coverage: install npm dependencies to list canonical E2E reviewer flow.');
    return;
  }
  assertScriptListsContracts({
    script: 'test:e2e',
    args: ['--list'],
    expectedContracts: [
      {
        task: '7.13',
        contract: 'canonical reviewer flow is present',
        pattern: /source-first notebook creates a ready active source, offers briefing and starter questions before analysis, and keeps chat scoped to the source/i,
      },
      {
        task: '7.13',
        contract: 'error state proof is present for the canonical auth route',
        pattern: /login failure renders the canonical error state without echoing credentials/i,
      },
    ],
  });
});
