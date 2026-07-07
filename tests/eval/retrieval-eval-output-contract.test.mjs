import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const canaries = Object.freeze({
  minimaxApiKey: 'MINIMAX_EVAL_REDACTION_CANARY',
  jwtSecret: 'JWT_EVAL_REDACTION_CANARY_WITH_ENTROPY',
  databaseUrl: 'postgresql://doculens_eval:DATABASE_PASSWORD_EVAL_CANARY@127.0.0.1:65432/doculens_eval',
  databasePassword: 'DATABASE_PASSWORD_EVAL_CANARY',
  authorizationHeader: 'Bearer AUTHORIZATION_EVAL_CANARY',
  rawDocumentText: 'RAW_DOCUMENT_CANARY:EVAL_DOCUMENT_TEXT_MUST_NOT_LEAK',
  fullPrompt: 'FULL_PROMPT_CANARY:EVAL_FULL_PROMPT_MUST_NOT_LEAK',
  providerResponse: 'PROVIDER_RESPONSE_CANARY:EVAL_PROVIDER_RESPONSE_MUST_NOT_LEAK',
});

function evalEnv(envOverrides = {}) {
  return {
    ...process.env,
    AI_PROVIDER: 'minimax',
    DOCULENS_EVAL_USE_DETERMINISTIC_FAKES: 'true',
    DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX: 'false',
    RETRIEVAL_BACKEND: 'hybrid',
    EMBEDDING_PROVIDER: 'local_hashing',
    EMBEDDING_MODEL: 'doculens-local-hashing-v1',
    EMBEDDING_DIMENSIONS: '384',
    EMBEDDING_STRICT: 'false',
    MINIMAX_API_KEY: canaries.minimaxApiKey,
    JWT_SECRET: canaries.jwtSecret,
    DATABASE_URL: canaries.databaseUrl,
    AUTHORIZATION: canaries.authorizationHeader,
    RAW_DOCUMENT_CANARY: canaries.rawDocumentText,
    FULL_PROMPT_CANARY: canaries.fullPrompt,
    PROVIDER_RESPONSE_CANARY: canaries.providerResponse,
    ...envOverrides,
  };
}

function runEval(envOverrides = {}) {
  return spawnSync(process.execPath, ['scripts/checks/eval-contract.mjs'], {
    cwd: repoRoot,
    env: evalEnv(envOverrides),
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function outputFor(result, extraSecrets = {}) {
  return redactSecrets(`${result.stdout ?? ''}\n${result.stderr ?? ''}`, { ...canaries, ...extraSecrets });
}

function assertOutputHas(output, pattern, contract) {
  assert.match(output, pattern, `eval output must include ${contract}; output:\n${output}`);
}

function assertOutputDoesNotHave(output, pattern, contract) {
  assert.doesNotMatch(output, pattern, `eval output must not include ${contract}; output:\n${output}`);
}

test('retrieval eval success output is reviewer-readable and proves no-cost local pgvector/hybrid provenance', () => {
  const result = runEval();
  const output = outputFor(result);

  assert.equal(result.status, 0, `retrieval eval runner must pass deterministic mode; output:\n${output}`);
  const requiredFields = [
    [/question (category|type)|category=/i, 'question category for each eval case'],
    [/matched evidence|evidence (section|chunk|match)|expected evidence/i, 'matched evidence section or chunk'],
    [/configured backend|configuredBackend|configured_backend/i, 'configured backend'],
    [/effective backend|effectiveBackend|effective_backend|actual backend/i, 'effective backend'],
    [/backend provenance|backendProvenance|backend_provenance/i, 'backend provenance'],
    [/postgresql_repository|repository-backed|repository backed/i, 'repository-backed PostgreSQL vector proof'],
    [/fallback reason|fallbackReason|fallback_reason/i, 'fallback reason field'],
    [/answer state|answerState|answer_state|display state/i, 'answer state'],
    [/citation (result|valid|support)|citationResult|citation_result/i, 'citation validation result'],
    [/claim[- ]support|claimSupport|claim_support/i, 'claim-support validation result'],
    [/score summary|scoreSummary|score_summary/i, 'score summary diagnostics'],
    [/controlled paraphrase|paraphrase/i, 'controlled paraphrase eval case'],
    [/lexical-negative|lexical negative/i, 'lexical-negative eval case'],
    [/stale|no-embedding|missing_chunk_embeddings/i, 'stale/no-embedding eval reporting'],
    [/unsupported|low-evidence|insufficient/i, 'unsupported and low-evidence answer-state coverage'],
    [/local_hashing/i, 'local hashing embedding provider'],
    [/doculens-local-hashing-v1/i, 'locked local hashing embedding model'],
    [/\b384\b/i, 'locked embedding dimension'],
    [/no-cost|no cost/i, 'no-cost embedding statement'],
    [/in-container|inside (the )?(docker|ecs|app )?container|in process|in-process/i, 'in-container embedding statement'],
  ];

  for (const [pattern, contract] of requiredFields) {
    assertOutputHas(output, pattern, contract);
  }

  assertOutputDoesNotHave(output, /\b(?:MiniMax-M3|OpenAI|Bedrock|hosted)\s+embedding(?:s)?\s+(?:provider|model|quality|proof|path)\b/i, 'hosted/deep semantic embedding claims for the local vector path');
  assertOutputDoesNotHave(output, /OPENAI_API_KEY|MINIMAX_API_KEY=.*embedding|BEDROCK|external embedding credential/i, 'external embedding credential requirements for local_hashing');
});

test('retrieval eval fails with a diagnostic when pgvector or hybrid proof comes from an injected fake preferred search', () => {
  const result = runEval({ DOCULENS_EVAL_FORCE_FAKE_PREFERRED_SEARCH: 'true' });
  const output = outputFor(result);

  assert.notEqual(result.status, 0, `fake preferred search must not satisfy pgvector/hybrid proof; output:\n${output}`);
  assertOutputHas(output, /fake preferred|injected preferred|test-only preferred|metadata theater|not repository-backed/i, 'fake-preferred-search failure reason');
  assertOutputHas(output, /pgvector|hybrid/i, 'claimed vector/hybrid backend in the failure diagnostic');
  assertOutputHas(output, /postgresql_repository|repository-backed|backend provenance|backendProvenance/i, 'missing repository provenance in the failure diagnostic');
  assertOutputHas(output, /FAIL/i, 'reviewer-visible fail status');
});

test('retrieval eval reports stale or missing chunk embeddings as lexical fallback rather than vector proof', () => {
  const result = runEval({ DOCULENS_EVAL_FORCE_MISSING_CHUNK_EMBEDDINGS: 'true' });
  const output = outputFor(result);

  assert.equal(result.status, 0, `missing-embedding eval case should be a reported fallback contract, not a runner crash; output:\n${output}`);
  assertOutputHas(output, /missing_chunk_embeddings/i, 'missing_chunk_embeddings fallback reason');
  assertOutputHas(output, /lexical_fallback/i, 'lexical fallback effective backend for stale/no-embedding documents');
  assertOutputHas(output, /configured backend|configuredBackend|configured_backend/i, 'configured backend alongside fallback metadata');
  assertOutputHas(output, /effective backend|effectiveBackend|effective_backend/i, 'effective fallback backend alongside configured backend');
  assertOutputDoesNotHave(output, /effective backend[:= ]+(pgvector|hybrid).*(missing_chunk_embeddings|stale|no-embedding)/i, 'pgvector/hybrid effective backend for missing embeddings');
});
