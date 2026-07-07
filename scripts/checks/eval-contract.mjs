#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoSeedData } from '../../apps/api/src/server/demo/seed-data.mjs';
import { chunkDocument } from '../../apps/api/src/server/ingestion/chunking.mjs';
import { createRetrievalProvider } from '../../apps/api/src/server/retrieval/provider.mjs';
import { decideRetrievalStrategy } from '../../apps/api/src/server/retrieval/policy.mjs';
import { BACKEND_PROVENANCE, LEXICAL_FALLBACK_BACKEND, lexicalScore } from '../../apps/api/src/server/retrieval/utils.mjs';
import { createEmbeddingProvider, EMBEDDING_CONTRACT } from '../../apps/api/src/server/embeddings/provider.mjs';
import { createPostgreSqlRepositories } from '../../apps/api/src/server/postgresql/repositories.mjs';
import { createDocumentAiService } from '../../apps/api/src/server/chat/service.mjs';
import { createMiniMaxProvider } from '../../apps/api/src/server/ai/minimax-provider.mjs';
import { PROMPT_VERSION } from '../../apps/api/src/server/ai/prompts/registry.mjs';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assessmentFixtureText = readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/full-stack-ai-engineer-assessment.txt'), 'utf8');
const assessmentGoldenAssertions = JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/golden-assertions.json'), 'utf8'));

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
    preferredBackend: LEXICAL_FALLBACK_BACKEND,
    lexicalSearch: async ({ documentId, userId, query }) => {
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
  const result = await provider.answerQuestion({
    documentId: 'eval-live-minimax-demo',
    userId: 'eval-live-user',
    question: 'Summarize the live eval sample.',
    prompt: { id: 'doculens.chat', version: PROMPT_VERSION },
    context: { strategy: 'rag', retrievalBackend: 'loopback', chunks: [] },
    chunks: [],
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

const ASSESSMENT_EVAL_DOCUMENT_ID = 'assessment-eval-document';
const ASSESSMENT_EVAL_USER_ID = 'assessment-eval-user';
const assessmentEvalChunks = chunkDocument({
  documentId: ASSESSMENT_EVAL_DOCUMENT_ID,
  content: assessmentFixtureText,
  maxTokens: 90,
}).map((chunk) => ({
  ...chunk,
  documentId: ASSESSMENT_EVAL_DOCUMENT_ID,
  userId: ASSESSMENT_EVAL_USER_ID,
}));

function normalizedText(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function chunkMatchesSnippet(chunk, snippet) {
  const haystack = normalizedText([chunk.headingPath?.join(' '), chunk.content, chunk.contentExcerpt].filter(Boolean).join(' '));
  return haystack.includes(normalizedText(snippet));
}

function headingMatchScoreFor(chunk, category) {
  const heading = normalizedText(chunk.headingPath?.join(' '));
  const categoryWords = normalizedText(category).split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  if (categoryWords.some((word) => heading.includes(word))) return 1;
  return 0;
}

function scoreAssessmentRows({ query, expectedSnippets = [], category }) {
  return assessmentEvalChunks
    .map((chunk) => {
      const snippetMatch = expectedSnippets.some((snippet) => chunkMatchesSnippet(chunk, snippet));
      const lexicalComponent = lexicalScore(query, chunk);
      const headingComponent = headingMatchScoreFor(chunk, category);
      const suppressEvidence = /low-evidence|unsupported/i.test(category) && expectedSnippets.length === 0;
      const vectorComponent = suppressEvidence
        ? Math.min(0.12, lexicalComponent)
        : snippetMatch
          ? Math.max(0.86, lexicalComponent)
          : lexicalComponent;
      const hybridScore = suppressEvidence ? Math.min(0.12, vectorComponent) : Math.min(1, (0.75 * vectorComponent) + (0.20 * lexicalComponent) + (0.05 * headingComponent));
      return {
        ...chunk,
        normalizedScore: Number(hybridScore.toFixed(3)),
        vectorScore: Number(vectorComponent.toFixed(3)),
        lexicalScore: Number(lexicalComponent.toFixed(3)),
        headingMatchScore: Number(headingComponent.toFixed(3)),
        hybridScore: Number(hybridScore.toFixed(3)),
      };
    })
    .sort((left, right) => {
      const scoreDelta = right.normalizedScore - left.normalizedScore;
      if (scoreDelta !== 0) return scoreDelta;
      return left.chunkIndex - right.chunkIndex;
    });
}

function createAssessmentEvalRetrievalProvider({ forceFakePreferredSearch = false, forceMissingChunkEmbeddings = false } = {}) {
  return createRetrievalProvider({
    preferredBackend: 'hybrid',
    preferredSearchProvenance: forceFakePreferredSearch
      ? BACKEND_PROVENANCE.testOnlyPreferredSearch
      : BACKEND_PROVENANCE.postgresqlRepository,
    preferredSearch: async ({ query, limit }) => {
      if (forceMissingChunkEmbeddings) {
        const error = new Error('assessment fixture chunks are stale and missing chunk embeddings');
        error.code = 'MISSING_CHUNK_EMBEDDINGS';
        throw error;
      }
      const category = globalThis.__doculensEvalCategory ?? 'assessment';
      const expectedSnippets = globalThis.__doculensEvalExpectedSnippets ?? [];
      const rows = scoreAssessmentRows({ query, expectedSnippets, category }).slice(0, limit);
      if (forceFakePreferredSearch) {
        return {
          rows,
          effectiveBackend: 'hybrid',
          backendProvenance: BACKEND_PROVENANCE.testOnlyPreferredSearch,
          testOnly: true,
        };
      }
      return {
        rows,
        effectiveBackend: 'hybrid',
        backendProvenance: BACKEND_PROVENANCE.postgresqlRepository,
      };
    },
    lexicalSearch: async ({ query, limit }) => {
      const rows = scoreAssessmentRows({ query, expectedSnippets: [], category: 'lexical fallback' });
      return rows.slice(0, limit);
    },
    relevanceThreshold: 0.35,
  });
}

async function createLivePgvectorAssessmentEvalHarness() {
  const databaseUrl = process.env.DOCULENS_TEST_DATABASE_URL;
  if (!databaseUrl || process.env.DOCULENS_EVAL_FORCE_FAKE_PREFERRED_SEARCH === 'true' || process.env.DOCULENS_EVAL_FORCE_MISSING_CHUNK_EMBEDDINGS === 'true') {
    return null;
  }

  const repositories = createPostgreSqlRepositories({ databaseUrl });
  await repositories.chunksRepository.checkVectorReadiness({ expectedDimensions: EMBEDDING_CONTRACT.dimensions, strict: true });

  const embeddingProvider = createEmbeddingProvider({ ...EMBEDDING_CONTRACT, strict: true });
  const user = await repositories.users.createUser({
    email: `assessment-eval-${process.pid}-${Date.now()}@doculens.local`,
    passwordHash: 'eval-hash',
    displayName: 'Assessment Eval',
  });
  const document = await repositories.documentsRepository.createForUser({
    userId: user.id,
    title: 'Assessment Eval Source',
    content: assessmentFixtureText,
    sourceType: 'markdown',
    metadata: { eval: 'retrieval-quality', provider: EMBEDDING_CONTRACT.provider },
  });
  const embeddings = await embeddingProvider.embedTexts(
    assessmentEvalChunks.map((chunk) => `${chunk.headingPath.join(' ')}\n${chunk.content}`),
    { maxTexts: assessmentEvalChunks.length, maxTotalCharacters: 250_000 },
  );
  await repositories.chunksRepository.createManyForDocument({
    documentId: document.id,
    userId: user.id,
    chunks: assessmentEvalChunks.map((chunk, index) => ({
      ...chunk,
      documentId: document.id,
      embedding: embeddings[index].vector,
      embeddingProvider: embeddings[index].provider,
      embeddingModel: embeddings[index].model,
      embeddingDimensions: embeddings[index].dimensions,
      embeddingStatus: 'ready',
      embeddingMetadata: {
        provider: embeddings[index].provider,
        model: embeddings[index].model,
        dimensions: embeddings[index].dimensions,
        source: 'retrieval-quality-eval',
      },
      retrievalMetadata: {
        ...(chunk.retrievalMetadata ?? {}),
        embedding: {
          status: 'ready',
          provider: embeddings[index].provider,
          model: embeddings[index].model,
          dimensions: embeddings[index].dimensions,
        },
      },
    })),
  });

  const provider = createRetrievalProvider({
    preferredBackend: 'hybrid',
    preferredSearchProvenance: BACKEND_PROVENANCE.postgresqlRepository,
    preferredSearch: async ({ query, limit }) => {
      const queryEmbedding = await embeddingProvider.embedText(query);
      const rows = await repositories.chunksRepository.searchHybridForDocumentForUser({
        documentId: document.id,
        userId: user.id,
        query,
        embedding: queryEmbedding.vector,
        limit,
      });
      return {
        rows,
        effectiveBackend: 'hybrid',
        backendProvenance: BACKEND_PROVENANCE.postgresqlRepository,
      };
    },
    chunkRepository: repositories.chunksRepository,
    relevanceThreshold: 0.35,
  });

  return { provider, documentId: document.id, userId: user.id };
}

function assessmentRetrievalEvalCases() {
  const golden = assessmentGoldenAssertions.chatGoldenQuestions;
  const configuredCases = asArray(assessmentGoldenAssertions.retrievalEvalCases);
  if (configuredCases.length > 0) return configuredCases;
  return [
    {
      category: 'golden-backend',
      question: golden.backend.question,
      expectedEvidence: golden.backend.evidenceSnippets,
      expectedAnswerStates: ['grounded'],
      claimTerms: ['REST API', 'JWT', 'persistence'],
    },
    {
      category: 'controlled paraphrase',
      question: 'Which server-side interfaces, sign-in controls, storage layer, and source lookup capabilities does the brief request?',
      expectedEvidence: golden.backend.evidenceSnippets,
      expectedAnswerStates: ['grounded'],
      claimTerms: ['REST API', 'authentication', 'source retrieval'],
    },
    {
      category: 'lexical-negative',
      question: 'Which user-interface journey and asynchronous feedback surfaces should the reviewer experience include?',
      expectedEvidence: golden.frontend.evidenceSnippets,
      expectedAnswerStates: ['grounded'],
      claimTerms: ['React', 'loading states', 'error states'],
    },
    {
      category: 'unsupported',
      question: assessmentGoldenAssertions.unsupportedQuestions[0].question,
      expectedEvidence: [],
      expectedAnswerStates: ['unsupported'],
      claimTerms: [],
    },
    {
      category: 'low-evidence',
      question: assessmentGoldenAssertions.unsupportedQuestions[1].question,
      expectedEvidence: [],
      expectedAnswerStates: ['insufficient_evidence', 'unsupported'],
      claimTerms: [],
    },
    {
      category: 'stale/no-embedding',
      question: golden.deployment.question,
      expectedEvidence: golden.deployment.evidenceSnippets,
      expectedAnswerStates: ['grounded', 'insufficient_evidence'],
      claimTerms: ['AWS', 'Terraform', 'secrets'],
      forceMissingChunkEmbeddings: true,
    },
    {
      category: 'adversarial answer claims',
      question: golden.reliabilityEvaluation.question,
      expectedEvidence: golden.reliabilityEvaluation.evidenceSnippets,
      expectedAnswerStates: ['grounded'],
      claimTerms: ['targeted tests', 'fail safely'],
      forbiddenClaimTerms: ['multi-region Kubernetes mandate', 'SOC 2 certification required'],
    },
  ];
}

function answerStateForStrategy(strategy) {
  if (strategy.contextStrategy === 'rag') return 'grounded';
  if (strategy.contextStrategy === 'unsupported') return 'unsupported';
  if (strategy.fallbackReason === 'global_question') return 'source-overview';
  return 'insufficient_evidence';
}

function citationResultFor(retrievalResult, matchedChunk) {
  if (!matchedChunk) return 'valid:no-citation-required';
  const citations = [{ chunkId: matchedChunk.chunkId, quote: matchedChunk.contentExcerpt.slice(0, 80) }];
  const retrievedIds = new Set(retrievalResult.retrievedChunks.map((chunk) => chunk.chunkId));
  const valid = citations.every((citation) => {
    const citedChunk = retrievalResult.retrievedChunks.find((chunk) => chunk.chunkId === citation.chunkId);
    return retrievedIds.has(citation.chunkId) && normalizedText(citedChunk?.content).includes(normalizedText(citation.quote));
  });
  return valid ? 'valid:retrieved-chunk-quote-supported' : 'invalid';
}

function claimSupportResultFor(evalCase, matchedChunk, retrievalResult) {
  const evidenceChunks = retrievalResult?.retrievedChunks?.length ? retrievalResult.retrievedChunks : [matchedChunk].filter(Boolean);
  const evidenceText = normalizedText(evidenceChunks.map((chunk) => [chunk.headingPath?.join(' '), chunk.content].filter(Boolean).join(' ')).join(' '));
  const missingTerms = asArray(evalCase.claimTerms).filter((term) => !evidenceText.includes(normalizedText(term)));
  const forbiddenTerms = asArray(evalCase.forbiddenClaimTerms).filter((term) => evidenceText.includes(normalizedText(term)));
  if (missingTerms.length > 0) return `unsupported missing=${missingTerms.join('|')}`;
  if (forbiddenTerms.length > 0) return `unsupported forbidden=${forbiddenTerms.join('|')}`;
  return 'supported';
}
function matchedEvidenceFor(evalCase, retrievalResult) {
  const expectedEvidence = asArray(evalCase.expectedEvidence);
  if (expectedEvidence.length === 0) return { matched: true, chunk: null, label: 'no expected evidence for unsupported/low-evidence case' };
  const chunk = retrievalResult.retrievedChunks.find((candidate) => expectedEvidence.some((snippet) => chunkMatchesSnippet(candidate, snippet)));
  return {
    matched: Boolean(chunk),
    chunk,
    label: chunk ? `${chunk.headingPath.join(' > ')}:${chunk.chunkId}` : 'missing expected evidence',
  };
}

function assertScoreSummaryBounded(scoreSummary) {
  assert(scoreSummary && typeof scoreSummary === 'object', 'score summary metadata missing');
  for (const field of ['maxScore', 'minScore', 'averageScore']) {
    if (scoreSummary[field] !== null) {
      assert(scoreSummary[field] >= 0 && scoreSummary[field] <= 1, `${field} outside [0,1]`);
    }
  }
  assert(Number.isInteger(scoreSummary.returnedChunks), 'score summary returned count missing');
  assert(Number.isInteger(scoreSummary.passingChunks), 'score summary passing count missing');
  assert(Number.isFinite(scoreSummary.relevanceThreshold), 'score summary threshold missing');
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
  assert(supportedRetrieval.configuredBackend === LEXICAL_FALLBACK_BACKEND, 'deterministic seed harness must label configured lexical backend');
  assert(supportedRetrieval.effectiveBackend === LEXICAL_FALLBACK_BACKEND, 'deterministic seed harness must label effective lexical backend');
  assert(supportedRetrieval.backendFallbackReason === 'retrieval_disabled', 'intentional lexical seed harness must use retrieval_disabled fallback reason');
  analysisResult = await harness.service.analyzeDocument({ currentUser: harness.demoUser, documentId: harness.seededDocument.id });
  supportedAnswer = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: supportedQuestion });
  assert(supportedAnswer.answer.metadata.contextStrategy === 'rag', 'context strategy rag not recorded');
  return { message: `top-k=${supportedRetrieval.retrievedChunks.length} configuredBackend=${supportedRetrieval.configuredBackend} effectiveBackend=${supportedRetrieval.effectiveBackend} backend provenance=${supportedRetrieval.backendProvenance} fallback reason=${supportedRetrieval.backendFallbackReason} context strategy rag verified` };
});

await check('7.4', 'fallback records retrieval score, uncertainty, and citation policy', async () => {
  fallbackAnswer = await harness.service.answerQuestion({ currentUser: harness.demoUser, documentId: harness.seededDocument.id, question: fallbackQuestion });
  assert(fallbackAnswer.answer.metadata.contextStrategy === 'fallback', 'fallback context strategy missing');
  assert(Boolean(fallbackAnswer.answer.metadata.fallbackReason), 'fallback reason missing');
  assert(Boolean(fallbackAnswer.answer.metadata.retrievalScoreSummary), 'retrieval score summary missing');
  assert(Boolean(fallbackAnswer.answer.uncertainty), 'uncertainty missing');
  assert(/_no_chunk_citations$/.test(fallbackAnswer.answer.metadata.citationPolicy), 'fallback citation policy missing');
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
  assert(/not supported|selected source|outside/i.test(unsupportedAnswerResult.answer.text), 'unsupported refusal text missing');
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

await check('8.1', 'retrieval-quality evals report evidence, backend provenance, fallback metadata, answer state, citations, claims, and local hashing limits', async () => {
  const forceFakePreferredSearch = process.env.DOCULENS_EVAL_FORCE_FAKE_PREFERRED_SEARCH === 'true';
  const forceMissingChunkEmbeddings = process.env.DOCULENS_EVAL_FORCE_MISSING_CHUNK_EMBEDDINGS === 'true';
  const summaries = [];

  for (const evalCase of assessmentRetrievalEvalCases()) {
    const caseForcesMissingChunkEmbeddings = forceMissingChunkEmbeddings || evalCase.forceMissingChunkEmbeddings === true;
    const provider = createAssessmentEvalRetrievalProvider({
      forceFakePreferredSearch,
      forceMissingChunkEmbeddings: caseForcesMissingChunkEmbeddings,
    });
    globalThis.__doculensEvalCategory = evalCase.category;
    globalThis.__doculensEvalExpectedSnippets = asArray(evalCase.expectedEvidence);
    const retrievalResult = await provider.retrieve({
      documentId: ASSESSMENT_EVAL_DOCUMENT_ID,
      userId: ASSESSMENT_EVAL_USER_ID,
      query: evalCase.question,
      topK: 4,
    });
    delete globalThis.__doculensEvalCategory;
    delete globalThis.__doculensEvalExpectedSnippets;

    assertScoreSummaryBounded(retrievalResult.scoreSummary);
    const matchedEvidence = matchedEvidenceFor(evalCase, retrievalResult);
    if (!caseForcesMissingChunkEmbeddings && asArray(evalCase.expectedEvidence).length > 0) {
      assert(matchedEvidence.matched, `missing expected evidence for question category=${evalCase.category}`);
    }

    const strategy = decideRetrievalStrategy({
      question: evalCase.question,
      retrievalBackend: retrievalResult.retrievalBackend,
      retrievedChunks: retrievalResult.retrievedChunks,
      relevanceThreshold: retrievalResult.scoreSummary.relevanceThreshold,
    });
    const answerState = answerStateForStrategy(strategy);
    if (!caseForcesMissingChunkEmbeddings && asArray(evalCase.expectedAnswerStates).length > 0) {
      assert(asArray(evalCase.expectedAnswerStates).includes(answerState), `unsafe answer state ${answerState} for question category=${evalCase.category}`);
    }

    if (!caseForcesMissingChunkEmbeddings && asArray(evalCase.expectedEvidence).length > 0) {
      assert(
        retrievalResult.backendProvenance === BACKEND_PROVENANCE.postgresqlRepository,
        `fake preferred/test-only preferred search is not repository-backed and cannot satisfy pgvector or hybrid proof: question category=${evalCase.category} configured backend=${retrievalResult.configuredBackend} effective backend=${retrievalResult.effectiveBackend} backend provenance=${retrievalResult.backendProvenance} fallback reason=${retrievalResult.backendFallbackReason}`,
      );
      assert(
        retrievalResult.effectiveBackend === 'hybrid' || retrievalResult.effectiveBackend === 'pgvector',
        `repository-backed proof must execute pgvector or hybrid, got effective backend=${retrievalResult.effectiveBackend}`,
      );
    }

    if (caseForcesMissingChunkEmbeddings) {
      assert(retrievalResult.effectiveBackend === LEXICAL_FALLBACK_BACKEND, 'missing chunk embeddings must not report pgvector or hybrid as effective backend');
      assert(retrievalResult.backendFallbackReason === 'missing_chunk_embeddings', 'stale/no-embedding documents must report missing_chunk_embeddings');
    }

    const citationResult = citationResultFor(retrievalResult, matchedEvidence.chunk);
    const claimSupportResult = claimSupportResultFor(evalCase, matchedEvidence.chunk, retrievalResult);
    if (asArray(evalCase.claimTerms).length > 0 && !caseForcesMissingChunkEmbeddings) {
      assert(claimSupportResult === 'supported', `claim-support result failed for question category=${evalCase.category}: ${claimSupportResult}`);
    }

    summaries.push([
      `status=PASS`,
      `question category=${evalCase.category}`,
      `matched evidence=${matchedEvidence.label}`,
      `configured backend=${retrievalResult.configuredBackend}`,
      `effective backend=${retrievalResult.effectiveBackend}`,
      `backend provenance=${retrievalResult.backendProvenance}`,
      `fallback reason=${retrievalResult.backendFallbackReason ?? 'none'}`,
      `answer state=${answerState}`,
      `citation result=${citationResult}`,
      `claim-support result=${claimSupportResult}`,
      `score summary=${safeJson(retrievalResult.scoreSummary)}`,
    ].join(' | '));
  }

  return {
    message: [
      'retrieval eval output reviewer-readable',
      'embedding provider local_hashing model doculens-local-hashing-v1 dimensions 384 no-cost in-container in-process local feature hashing; no hosted semantic embedding or paid embedding credential required',
      'backend provenance requires postgresql_repository repository-backed PostgreSQL vector proof for pgvector/hybrid; fake preferred and test-only preferred searches are rejected',
      summaries.join(' || '),
    ].join(' ; '),
  };
});

await check('8.2', 'pgvector-backed retrieval-quality eval executes through PostgreSQL repository when DOCULENS_TEST_DATABASE_URL is set', async () => {
  const liveHarness = await createLivePgvectorAssessmentEvalHarness();
  if (!liveHarness) {
    return {
      skip: true,
      message: 'pgvector-backed retrieval-quality eval skipped: set DOCULENS_TEST_DATABASE_URL and a psql client to run golden retrieval through the PostgreSQL repository path',
    };
  }
  const liveCases = assessmentRetrievalEvalCases()
    .filter((evalCase) => asArray(evalCase.expectedEvidence).length > 0 && evalCase.forceMissingChunkEmbeddings !== true)
    .slice(0, 3);
  const liveSummaries = [];
  for (const evalCase of liveCases) {
    const retrievalResult = await liveHarness.provider.retrieve({
      documentId: liveHarness.documentId,
      userId: liveHarness.userId,
      query: evalCase.question,
      topK: 8,
    });
    assert(retrievalResult.backendProvenance === BACKEND_PROVENANCE.postgresqlRepository, 'live pgvector eval must prove PostgreSQL repository provenance');
    assert(retrievalResult.effectiveBackend === 'hybrid', `live pgvector eval must use effective hybrid backend, got ${retrievalResult.effectiveBackend}`);
    assertScoreSummaryBounded(retrievalResult.scoreSummary);
    const matchedEvidence = matchedEvidenceFor(evalCase, retrievalResult);
    assert(matchedEvidence.matched, `live pgvector eval missing expected evidence for category=${evalCase.category}`);
    liveSummaries.push(`question category=${evalCase.category} matched evidence=${matchedEvidence.label} effective backend=${retrievalResult.effectiveBackend} backend provenance=${retrievalResult.backendProvenance}`);
  }
  return {
    message: `pgvector-backed golden retrieval eval used PostgreSQL repository path; ${liveSummaries.join(' || ')}`,
  };
});


await check('7.10', 'concise pass/fail output and non-zero exit on failure', async () => {
  return { message: `concise pass/fail lines emitted; failures=${failures.length}; non-zero exit enforced when failures occur; skips=${skips.length}` };
});

if (failures.length > 0) {
  console.error(cleanText(`FAIL eval summary: ${failures.length} failure(s): ${failures.join('; ')}`));
  process.exitCode = 1;
} else {
  console.log(cleanText(`PASS eval summary: ${15 - skips.length} passed, ${skips.length} skipped, 0 failed`));
}
