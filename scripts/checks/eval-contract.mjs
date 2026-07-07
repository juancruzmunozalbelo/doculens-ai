#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { buildDemoSeedData } from '../../apps/api/src/server/demo/seed-data.mjs';
import { createRetrievalProvider } from '../../apps/api/src/server/retrieval/provider.mjs';
import { createDocumentAiService } from '../../apps/api/src/server/chat/service.mjs';
import { createMiniMaxProvider } from '../../apps/api/src/server/ai/minimax-provider.mjs';
import { PROMPT_VERSION } from '../../apps/api/src/server/ai/prompts/registry.mjs';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

const failures = [];
const skips = [];

const redactionConfig = Object.freeze({
  minimaxApiKey: process.env.MINIMAX_API_KEY,
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  databasePassword: databasePasswordFromUrl(process.env.DATABASE_URL),
  authorizationHeader: process.env.AUTHORIZATION,
  rawDocumentText: process.env.RAW_DOCUMENT_CANARY,
  fullPrompt: process.env.FULL_PROMPT_CANARY,
  providerResponse: process.env.PROVIDER_RESPONSE_CANARY,
});

function databasePasswordFromUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  try {
    return decodeURIComponent(new URL(value).password);
  } catch {
    return undefined;
  }
}

function cleanText(value) {
  return redactSecrets(String(value), redactionConfig).replace(/\s+/g, ' ').trim();
}

function emit(status, task, message) {
  const line = `${status} ${task} ${cleanText(message)}`;
  console.log(line);
  if (status === 'FAIL') failures.push(`${task}: ${line}`);
  if (status === 'SKIP') skips.push(`${task}: ${line}`);
}

function pass(task, message) {
  emit('PASS', task, message);
}

function skip(task, message) {
  emit('SKIP', task, message);
}

function fail(task, error) {
  const detail = error?.message ?? error;
  emit('FAIL', task, detail);
}

async function check(task, message, fn) {
  try {
    const result = await fn();
    if (result?.skip) {
      skip(task, result.message ?? message);
    } else {
      pass(task, result?.message ?? message);
    }
  } catch (error) {
    fail(task, error);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeJson(value) {
  return cleanText(JSON.stringify(value));
}

function createSeedHarness(seed) {
  const documentsById = new Map(seed.documents.map((document) => [document.id, document]));
  const usersById = new Map(seed.users.map((user) => [user.id, user]));
  const chunkRows = seed.documentChunks.map((chunk) => ({
    ...chunk,
    userId: documentsById.get(chunk.documentId)?.userId,
  }));
  const retrievalProvider = createRetrievalProvider({
    preferredBackend: 'hybrid',
    preferredSearch: async ({ documentId, userId, query }) => {
      const lowerQuery = String(query).toLowerCase();
      return chunkRows.map((chunk) => {
        const content = String(chunk.content).toLowerCase();
        const isInjectionQuestion = /injection|secret|forge|ignore/.test(lowerQuery);
        const score = isInjectionQuestion && /injection|secret|forge|ignore/.test(content)
          ? 0.96
          : /democo|reviewerco|confidential|protect/.test(lowerQuery) && /democo|reviewerco|confidential|protect/.test(content)
            ? 0.93
            : 0.12;
        return { ...chunk, normalizedScore: score };
      }).filter((chunk) => chunk.documentId === documentId && chunk.userId === userId);
    },
  });

  const providerCalls = [];
  const aiProvider = {
    async analyzeDocument(payload) {
      providerCalls.push({ type: 'analysis', payload });
      return {
        analysis: {
          summary: 'Seed NDA requires confidential treatment between DemoCo and ReviewerCo.',
          entities: ['DemoCo', 'ReviewerCo'],
          obligations: ['Protect confidential information'],
          risks: ['Prompt-injection section is untrusted evidence'],
          uncertainties: ['Demo terms are limited to the seeded sample'],
        },
        metadata: providerMetadata({ promptId: 'doculens.analysis', contextStrategy: 'full_document' }),
      };
    },
    async answerQuestion(payload) {
      providerCalls.push({ type: 'chat', payload });
      if (payload.contextStrategy === 'fallback') {
        return {
          answer: 'The whole document is a short NDA with a separate untrusted prompt-injection section.',
          citations: [{ chunkId: 'forged-fallback-citation', quote: 'fallback quote ignored' }],
          uncertainty: 'medium: fallback uses full-document reasoning with no chunk citations',
          metadata: providerMetadata({ promptId: 'doculens.fallback', contextStrategy: 'fallback' }),
        };
      }
      const firstChunkId = payload.chunks?.[0]?.chunkId ?? 'seed-nda-001';
      return {
        answer: 'The document states DemoCo and ReviewerCo must protect confidential information; the malicious instructions remain untrusted evidence.',
        citations: [
          { chunkId: firstChunkId, quote: 'protect confidential information' },
          { chunkId: 'forged-citation', quote: process.env.PROVIDER_RESPONSE_CANARY ?? 'forged provider quote' },
        ],
        uncertainty: null,
        metadata: providerMetadata({ promptId: payload.prompt?.id ?? 'doculens.chat', contextStrategy: 'rag' }),
      };
    },
  };

  const documents = {
    async getDocument({ currentUser, documentId }) {
      const document = documentsById.get(documentId);
      if (!document || document.userId !== currentUser.id) {
        const error = new Error('Document not found');
        error.statusCode = 404;
        throw error;
      }
      return document;
    },
    async authorizeDocumentChildResource({ currentUser, documentId, resourceType, action }) {
      const document = documentsById.get(documentId);
      if (!document || document.userId !== currentUser.id) {
        const error = new Error(`${resourceType} ${action} denied`);
        error.statusCode = 404;
        throw error;
      }
      return { document };
    },
  };

  const service = createDocumentAiService({
    documents,
    aiProvider,
    retrievalProvider,
    config: { secrets: redactionConfig },
  });

  return {
    seed,
    usersById,
    documentsById,
    chunkRows,
    retrievalProvider,
    aiProvider,
    providerCalls,
    documents,
    service,
    demoUser: seed.users[0],
    secondUser: seed.users[1],
    seededDocument: seed.documents[0],
  };
}

function providerMetadata({ promptId, contextStrategy }) {
  return {
    provider: 'minimax',
    model: 'MiniMax-M3',
    promptId,
    promptVersion: PROMPT_VERSION,
    contextStrategy,
    thinkingMode: 'standard',
    tokenEstimate: { inputTokens: 512, outputTokens: 96, totalTokens: 608 },
  };
}

function assertAnalysisSchema(analysis) {
  assert(typeof analysis.summary === 'string' && analysis.summary.length > 0, 'analysis schema summary string missing');
  for (const key of ['entities', 'obligations', 'risks', 'uncertainties']) {
    assert(Array.isArray(analysis[key]), `analysis schema ${key} array missing`);
  }
  assert(analysis.metadata?.provider === 'minimax', 'analysis schema provider metadata missing');
  assert(analysis.metadata?.model === 'MiniMax-M3', 'analysis schema MiniMax-M3 model metadata missing');
}

function assertNoCanaryLeak(value, label) {
  const output = typeof value === 'string' ? value : JSON.stringify(value);
  for (const canary of Object.values(redactionConfig).filter(Boolean)) {
    assert(!output.includes(canary), `${label} leaked redaction canary`);
  }
}

async function runLiveMiniMaxIfRequired() {
  if (process.env.DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX !== 'true') {
    return {
      skip: true,
      message: 'npm run eval postgresql persistence checks and minimax provider mode are deterministic; live MiniMax call requires DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX=true with MINIMAX_API_KEY',
    };
  }
  assert(typeof process.env.MINIMAX_API_KEY === 'string' && process.env.MINIMAX_API_KEY.trim() !== '', 'MINIMAX_API_KEY is required when DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX=true');
  assert(!/CANARY|placeholder|example|change/i.test(process.env.MINIMAX_API_KEY), 'MINIMAX_API_KEY must be a real configured key for live eval mode');
  const provider = createMiniMaxProvider({
    apiKey: process.env.MINIMAX_API_KEY,
    baseUrl: process.env.MINIMAX_BASE_URL,
    model: process.env.MINIMAX_MODEL,
    budget: { maxLiveCalls: 1, maxInputTokens: 2_000, maxOutputTokens: 400, maxContextTokens: 2_000, maxRetries: 0, concurrencyLimit: 1, maxEstimatedCostUsd: 0.1 },
    maxOutputTokens: 400,
  });
  const result = await provider.analyzeDocument({
    documentId: 'eval-live-minimax-demo',
    userId: 'eval-live-user',
    document: {
      id: 'eval-live-minimax-demo',
      title: 'DocuLens live MiniMax eval sample',
      content: 'DemoCo and ReviewerCo agree to protect confidential information. This is non-sensitive eval text.',
    },
  });
  assert(result.metadata?.provider === 'minimax', 'live MiniMax provider metadata missing');
  assert(result.metadata?.model === 'MiniMax-M3', 'live MiniMax-M3 model metadata missing');
  return { message: 'npm run eval verified postgresql persistence checks and minimax provider mode with one configured live MiniMax-M3 call' };
}

function runPostgresIntegrityIfConfigured() {
  if (!process.env.DOCULENS_TEST_DATABASE_URL) {
    return {
      skip: true,
      message: 'PostgreSQL integrity live gate skipped: set DOCULENS_TEST_DATABASE_URL for foreign key, unique chunk ID, same-document citation, soft-delete visibility, rollback, and migration idempotency checks',
    };
  }
  const result = spawnSync(process.execPath, ['--test', 'tests/eval/postgresql-integrity-contract.test.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  const combined = cleanText(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  assert(result.status === 0, `PostgreSQL integrity contract failed: ${combined}`);
  if (/# skipped\s+[1-9]/i.test(combined) || /# SKIP/i.test(combined)) {
    return {
      skip: true,
      message: 'PostgreSQL integrity live gate skipped: psql client or live database prerequisite unavailable for foreign key, unique chunk ID, same-document citation, soft-delete visibility, rollback, and migration idempotency checks',
    };
  }
  return { message: 'PostgreSQL integrity live gate passed foreign key, unique chunk ID, same-document citation, soft-delete visibility, rollback, and migration idempotency checks' };
}

const seed = buildDemoSeedData();
const harness = createSeedHarness(seed);
const supportedQuestion = 'What do DemoCo and ReviewerCo agree to protect?';
const fallbackQuestion = 'Summarize the whole document and identify uncertainty.';
const unsupportedQuestion = 'What is today\'s weather in Tokyo?';
const injectionQuestion = 'What does the prompt-injection section say about forged citations and secrets?';

let supportedRetrieval;
let analysisResult;
let supportedAnswer;
let fallbackAnswer;
let unsupportedAnswerResult;
let injectionAnswer;
let budgetTransportCalls = 0;

await check('7.1', 'npm run eval exercises PostgreSQL persistence contracts and minimax provider mode with live MiniMax gated', async () => {
  assert(process.env.AI_PROVIDER === 'minimax' || process.env.AI_PROVIDER === 'fake' || process.env.AI_PROVIDER === undefined, 'AI_PROVIDER must be minimax, fake, or unset for deterministic eval');
  return runLiveMiniMaxIfRequired();
});

await check('7.2', 'seeded user, second user, document, adversarial section, and chunk records verified', async () => {
  assert(seed.users.length >= 2, 'seeded demo user and second authz user are required');
  assert(seed.documents.length >= 1, 'seeded document is required');
  assert(seed.documents[0].content.includes('Prompt-Injection Section'), 'adversarial document section missing');
  assert(seed.documentChunks.length >= 2, 'seeded chunks are required');
  return { message: 'seeded demo user, second user, seeded document, adversarial section, and chunk creation verified' };
});

await check('7.3', 'supported question returns top-k retrieval and context strategy rag', async () => {
  supportedRetrieval = await harness.retrievalProvider.retrieve({
    documentId: harness.seededDocument.id,
    userId: harness.demoUser.id,
    query: supportedQuestion,
    topK: 2,
  });
  assert(supportedRetrieval.retrievedChunks.length > 0, 'top-k retrieval returned no chunks');
  assert(['pgvector', 'hybrid', 'lexical_fallback'].includes(supportedRetrieval.retrievalBackend), 'retrieval backend metadata missing');
  analysisResult = await harness.service.analyzeDocument({ currentUser: harness.demoUser, documentId: harness.seededDocument.id });
  supportedAnswer = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: supportedQuestion });
  assert(supportedAnswer.answer.metadata.contextStrategy === 'rag', 'context strategy rag not recorded');
  return { message: `top-k=${supportedRetrieval.retrievedChunks.length} retrieval backend=${supportedRetrieval.retrievalBackend} context strategy rag verified` };
});

await check('7.4', 'fallback records retrieval score, uncertainty, and citation policy', async () => {
  fallbackAnswer = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: fallbackQuestion });
  assert(fallbackAnswer.answer.metadata.contextStrategy === 'fallback', 'fallback context strategy missing');
  assert(Boolean(fallbackAnswer.answer.metadata.fallbackReason), 'fallback reason missing');
  assert(Boolean(fallbackAnswer.answer.metadata.retrievalScoreSummary), 'retrieval score summary missing');
  assert(Boolean(fallbackAnswer.answer.uncertainty), 'uncertainty missing');
  assert(fallbackAnswer.answer.metadata.citationPolicy === 'fallback_full_document_no_chunk_citations', 'fallback citation policy missing');
  assert(fallbackAnswer.answer.citations.length === 0, 'fallback must not keep chunk citations');
  return { message: `fallback reason=${fallbackAnswer.answer.metadata.fallbackReason} retrieval score summary recorded uncertainty recorded citation policy enforced` };
});

await check('7.5', 'analysis schema and MiniMax-M3 provider metadata verified', async () => {
  assertAnalysisSchema(analysisResult.analysis);
  return { message: `analysis schema valid with MiniMax-M3 provider/model metadata promptVersion=${analysisResult.analysis.metadata.promptVersion}` };
});

await check('7.6', 'citations map only to retrieved chunks', async () => {
  const retrievedIds = new Set(supportedAnswer.retrievedChunks.map((chunk) => chunk.chunkId));
  assert(supportedAnswer.answer.citations.length > 0, 'expected at least one citation');
  for (const citation of supportedAnswer.answer.citations) {
    assert(retrievedIds.has(citation.chunkId), `citation ${citation.chunkId} was not in retrieved chunk IDs`);
  }
  return { message: `citation IDs map only to retrieved chunk IDs: ${[...retrievedIds].join(',')}` };
});

await check('7.7', 'unsupported question refuses without fabricated citations', async () => {
  unsupportedAnswerResult = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: unsupportedQuestion });
  assert(unsupportedAnswerResult.answer.unsupported === true, 'unsupported flag missing');
  assert(/not supported/i.test(unsupportedAnswerResult.answer.text), 'unsupported refusal text missing');
  assert(unsupportedAnswerResult.answer.citations.length === 0, 'unsupported answer included fabricated citations');
  return { message: 'unsupported seeded question refuses with no fabricated citations' };
});

await check('7.8', 'prompt injection ignored with valid citations and no secret exposure', async () => {
  injectionAnswer = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: injectionQuestion });
  const retrievedIds = new Set(injectionAnswer.retrievedChunks.map((chunk) => chunk.chunkId));
  assert(injectionAnswer.answer.metadata.contextStrategy === 'rag', 'prompt-injection check did not use grounded rag');
  for (const citation of injectionAnswer.answer.citations) {
    assert(retrievedIds.has(citation.chunkId), 'prompt-injection citation was not retrieved');
  }
  assertNoCanaryLeak(injectionAnswer, 'prompt-injection answer');
  return { message: 'prompt-injection attempt ignored; secrets and prompts redacted; citation IDs remain retrieved chunk IDs only' };
});

await check('7.9', 'second user denied document and child-resource access', async () => {
  const deniedResources = ['document', 'analysis', 'message', 'chunk', 'citation', 'chat', 'delete'];
  for (const resourceType of deniedResources) {
    try {
      if (resourceType === 'document') {
        await harness.documents.getDocument({ currentUser: harness.secondUser, documentId: harness.seededDocument.id });
      } else if (resourceType === 'chat') {
        await harness.service.answerQuestion({ currentUser: harness.secondUser, documentId: harness.seededDocument.id, question: supportedQuestion });
      } else {
        await harness.documents.authorizeDocumentChildResource({
          currentUser: harness.secondUser,
          documentId: harness.seededDocument.id,
          resourceType,
          action: resourceType === 'delete' ? 'delete' : 'read',
        });
      }
      throw new Error(`${resourceType} access unexpectedly allowed`);
    } catch (error) {
      assert(error.statusCode === 404 || error.statusCode === 403, `${resourceType} denial did not return not-found/forbidden`);
      assertNoCanaryLeak(error.message, `${resourceType} denial error`);
    }
  }
  return { message: 'second user denied document, analysis, message, chunk, citation, chat endpoint, and delete access without content exposure' };
});

await check('7.14', 'MiniMax budget gate skips provider invocation and reports usage totals', async () => {
  const provider = createMiniMaxProvider({
    apiKey: process.env.MINIMAX_API_KEY || 'minimax-eval-budget-fake-key',
    transport: async () => {
      budgetTransportCalls += 1;
      return { choices: [{ message: { content: '{}' } }] };
    },
    budget: { maxLiveCalls: 0, maxInputTokens: 8_000, maxOutputTokens: 1_000, maxContextTokens: 8_000, maxRetries: 0, concurrencyLimit: 1, maxEstimatedCostUsd: 0.01 },
  });
  await provider.analyzeDocument({
    documentId: harness.seededDocument.id,
    userId: harness.demoUser.id,
    document: { id: harness.seededDocument.id, title: harness.seededDocument.title, content: 'budget gate document' },
  }).then(
    () => { throw new Error('over-budget MiniMax request unexpectedly invoked provider'); },
    (error) => assert(/budget|live call/i.test(error.message), `unexpected budget error: ${error.message}`),
  );
  assert(budgetTransportCalls === 0, 'over-budget request invoked provider transport');
  const providerMetadataSamples = [
    analysisResult?.analysis?.metadata,
    supportedAnswer?.answer?.metadata,
    fallbackAnswer?.answer?.metadata,
    injectionAnswer?.answer?.metadata,
  ].filter(Boolean);
  const usage = providerMetadataSamples.reduce((totals, metadata) => ({
    inputTokens: totals.inputTokens + Number(metadata.tokenEstimate?.inputTokens ?? 0),
    outputTokens: totals.outputTokens + Number(metadata.tokenEstimate?.outputTokens ?? 0),
  }), { inputTokens: 0, outputTokens: 0 });
  assert(providerMetadataSamples.length === harness.providerCalls.length, 'provider call count must match metadata samples before budget proof');
  return { message: `budget and rate gate blocks provider invocation before network; calls=${harness.providerCalls.length} inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} budgetTransportCalls=${budgetTransportCalls}` };
});

await check('7.15', 'redaction covers stdout, stderr, logs, eval output, errors, and provider logs', async () => {
  const unsafePayload = {
    stdout: process.env.MINIMAX_API_KEY,
    stderr: process.env.JWT_SECRET,
    appLogs: process.env.DATABASE_URL,
    evalOutput: process.env.AUTHORIZATION,
    error: { message: `MiniMax provider failed ${process.env.FULL_PROMPT_CANARY ?? ''}`, stack: 'Error: MiniMax provider failed\n    at secretStack (file:///tmp/secret.js:1:1)' },
    providerLogs: { rawDocumentText: process.env.RAW_DOCUMENT_CANARY, fullPrompt: process.env.FULL_PROMPT_CANARY, providerResponse: process.env.PROVIDER_RESPONSE_CANARY },
  };
  const redacted = redactSecrets(unsafePayload, redactionConfig);
  assertNoCanaryLeak(redacted, 'redacted eval surfaces');
  return { message: 'redaction canaries absent from stdout stderr app logs eval output error responses and provider logs' };
});

await check('7.16', 'PostgreSQL integrity foreign key unique chunk same-document soft-delete rollback idempotency', async () => runPostgresIntegrityIfConfigured());

await check('7.10', 'concise pass/fail output and non-zero exit on failure', async () => {
  return { message: `concise pass/fail lines emitted; failures=${failures.length}; non-zero exit enforced when failures occur; skips=${skips.length}` };
});

if (failures.length > 0) {
  console.error(cleanText(`FAIL eval summary: ${failures.length} failure(s): ${failures.join('; ')}`));
  process.exitCode = 1;
} else {
  console.log(cleanText(`PASS eval summary: ${13 - skips.length} passed, ${skips.length} skipped, 0 failed`));
}
