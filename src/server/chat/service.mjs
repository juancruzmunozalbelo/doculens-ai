import { randomUUID } from 'node:crypto';
import { PROMPT_VERSION } from '../ai/prompts/registry.mjs';
import { decideRetrievalStrategy } from '../retrieval/policy.mjs';
import { buildRetrievalMetadata } from '../retrieval/metadata.mjs';
import { redactSecrets } from '../security/redact.mjs';

const CHAT_TOP_K = 5;

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeValue(value, secrets) {
  if (typeof value === 'string') {
    return redactSecrets(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, secrets));
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeValue(item, secrets)]));
  }
  return value;
}

function safeProviderMetadata(metadata = {}, secrets) {
  const source = isObject(metadata) ? metadata : {};
  const safe = {};
  for (const key of [
    'provider',
    'model',
    'promptId',
    'promptVersion',
    'contextStrategy',
    'thinkingMode',
    'retrievalBackend',
    'backendFallbackReason',
    'fallbackReason',
    'providerResponseId',
    'tokenEstimate',
    'tokenEstimates',
    'tokenUsage',
  ]) {
    if (source[key] !== undefined) {
      safe[key] = sanitizeValue(source[key], secrets);
    }
  }
  return safe;
}

function documentForProvider(document) {
  const text = document?.text ?? document?.content ?? '';
  return {
    ...document,
    text,
  };
}

function secretsForProvider(secrets) {
  const providerSecrets = Object.fromEntries(secrets.map((value, index) => [`configuredSecret${index + 1}`, value]));
  Object.defineProperty(providerSecrets, 'toJSON', { value: () => ({}), enumerable: false });
  return providerSecrets;
}

function configuredSecrets(config) {
  return [
    config?.jwtSecret,
    config?.databaseUrl,
    config?.minimax?.apiKey,
    config?.minimaxApiKey,
  ].filter((value) => typeof value === 'string' && value.length > 0);
}

function tokenMetadata(metadata = {}) {
  const tokenEstimate = metadata.tokenEstimate ?? metadata.tokenEstimates ?? metadata.tokenUsage ?? null;
  return tokenEstimate;
}

function normalizeAnalysisResult(providerResult, { secrets }) {
  const source = isObject(providerResult?.analysis) ? providerResult.analysis : providerResult;
  if (!isObject(source)) {
    const error = new Error('AI provider returned invalid analysis');
    error.statusCode = 502;
    throw error;
  }

  const metadata = safeProviderMetadata({ ...(isObject(source.metadata) ? source.metadata : {}), ...(isObject(providerResult?.metadata) ? providerResult.metadata : {}) }, secrets);
  const summary = requireText(source.summary, 'analysis.summary');
  const analysis = {
    summary: redactSecrets(summary, secrets),
    entities: sanitizeValue(asArray(source.entities), secrets),
    obligations: sanitizeValue(asArray(source.obligations), secrets),
    risks: sanitizeValue(asArray(source.risks), secrets),
    uncertainties: sanitizeValue(asArray(source.uncertainties), secrets),
    metadata: {
      ...metadata,
      promptId: metadata.promptId ?? 'doculens.analysis',
      promptVersion: metadata.promptVersion ?? PROMPT_VERSION,
      contextStrategy: metadata.contextStrategy ?? 'full_document',
    },
  };

  if (typeof analysis.metadata.provider !== 'string' || analysis.metadata.provider.trim() === '') {
    const error = new Error('analysis metadata provider is required');
    error.statusCode = 502;
    throw error;
  }
  if (typeof analysis.metadata.model !== 'string' || analysis.metadata.model.trim() === '') {
    const error = new Error('analysis metadata model is required');
    error.statusCode = 502;
    throw error;
  }

  return analysis;
}

function normalizeProviderAnswer(providerResult = {}, { metadata, strategy, citations, secrets }) {
  const rawText = providerResult.text ?? providerResult.answer ?? providerResult.content ?? '';
  const providerMetadata = safeProviderMetadata(providerResult.metadata, secrets);
  const answerMetadata = sanitizeValue({
    ...providerMetadata,
    ...metadata,
    contextStrategy: strategy.contextStrategy,
    fallbackReason: strategy.fallbackReason ?? null,
    unsupportedReason: strategy.unsupportedReason ?? null,
    citationPolicy: strategy.contextStrategy === 'fallback'
      ? 'fallback_full_document_no_chunk_citations'
      : 'retrieved_chunk_ids_only',
  }, secrets);

  return {
    text: redactSecrets(String(rawText), secrets),
    citations: sanitizeValue(citations, secrets),
    uncertainty: providerResult.uncertainty ?? (strategy.contextStrategy === 'fallback' ? 'unknown' : null),
    metadata: answerMetadata,
  };
}

function validCitations(providerCitations, retrievedChunks, secrets) {
  const chunksByStableId = new Map(retrievedChunks.map((chunk) => [chunk.chunkId ?? chunk.id, chunk]));
  return asArray(providerCitations)
    .filter((citation) => chunksByStableId.has(citation?.chunkId))
    .map((citation, index) => ({
      chunkId: citation.chunkId,
      quote: redactSecrets(String(citation.quote ?? ''), secrets),
      citationIndex: index,
    }));
}

function unsupportedAnswer({ metadata, strategy, secrets }) {
  return {
    text: 'This question is not supported by the document.',
    unsupported: true,
    citations: [],
    uncertainty: null,
    metadata: sanitizeValue({
      ...metadata,
      contextStrategy: 'unsupported',
      unsupportedReason: strategy.unsupportedReason ?? 'outside_document_scope',
      citationPolicy: 'no_citations_for_unsupported_answer',
    }, secrets),
  };
}

function createInMemoryAnalysisRepository() {
  const saved = [];
  return {
    saved,
    async saveAnalysis(payload) {
      const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...payload };
      saved.push(record);
      return record;
    },
  };
}

function createInMemoryChatRepository() {
  const saved = [];
  return {
    saved,
    async saveMessage(payload) {
      const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...payload };
      saved.push(record);
      return record;
    },
  };
}

async function maybeSave(repository, payload) {
  if (repository && typeof repository.saveAnalysis === 'function') {
    return await repository.saveAnalysis(payload);
  }
  if (repository && typeof repository.saveMessage === 'function') {
    return await repository.saveMessage(payload);
  }
  return null;
}

async function loadOwnedDocument({ documents, currentUser, documentId, resourceType, action }) {
  if (documents && typeof documents.authorizeDocumentChildResource === 'function') {
    const authorization = await documents.authorizeDocumentChildResource({ currentUser, documentId, resourceType, action });
    if (authorization?.document) {
      return authorization.document;
    }
  }
  if (documents && typeof documents.getDocument === 'function') {
    return await documents.getDocument({ currentUser, documentId });
  }
  const error = new Error('Document not found');
  error.statusCode = 404;
  throw error;
}

export function createDocumentAiService({ documents, aiProvider, retrievalProvider, analysisRepository, chatRepository, config } = {}) {
  if (!aiProvider || typeof aiProvider.analyzeDocument !== 'function' || typeof aiProvider.answerQuestion !== 'function') {
    throw new Error('AI provider with analysis and chat methods is required');
  }
  if (!retrievalProvider || typeof retrievalProvider.retrieve !== 'function') {
    throw new Error('retrieval provider with retrieve is required');
  }

  const analysisStore = analysisRepository ?? createInMemoryAnalysisRepository();
  const chatStore = chatRepository ?? createInMemoryChatRepository();
  const secrets = configuredSecrets(config);

  async function analyzeDocument({ currentUser, documentId }) {
    const document = await loadOwnedDocument({ documents, currentUser, documentId, resourceType: 'analysis', action: 'create' });
    const providerDocument = documentForProvider(document);
    const providerResult = await aiProvider.analyzeDocument({
      documentId: document.id,
      userId: currentUser.id,
      document: providerDocument,
      prompt: { id: 'doculens.analysis', version: PROMPT_VERSION },
      context: { strategy: 'full_document', thinkingMode: 'standard' },
      secrets: secretsForProvider(secrets),
    });
    const analysis = normalizeAnalysisResult(providerResult, { secrets });
    const saved = await maybeSave(analysisStore, {
      documentId: document.id,
      userId: currentUser.id,
      analysis,
      metadata: analysis.metadata,
      tokenEstimate: tokenMetadata(analysis.metadata),
    });
    return { analysis, savedAnalysis: saved };
  }

  async function answerQuestion({ currentUser, documentId, question: rawQuestion }) {
    const question = requireText(rawQuestion, 'question');
    const document = await loadOwnedDocument({ documents, currentUser, documentId, resourceType: 'message', action: 'create' });
    const retrievalResult = await retrievalProvider.retrieve({
      documentId: document.id,
      userId: currentUser.id,
      query: question,
      limit: CHAT_TOP_K,
    });
    const retrievedChunks = asArray(retrievalResult?.retrievedChunks);
    const strategy = decideRetrievalStrategy({
      question,
      retrievalBackend: retrievalResult?.retrievalBackend,
      retrievedChunks,
      relevanceThreshold: retrievalResult?.scoreSummary?.relevanceThreshold,
    });
    if (retrievalResult?.scoreSummary) {
      strategy.retrievalScoreSummary = retrievalResult.scoreSummary;
    }
    const retrievalMetadata = buildRetrievalMetadata({ retrievalResult, strategy });

    if (strategy.contextStrategy === 'unsupported') {
      const answer = unsupportedAnswer({ metadata: retrievalMetadata, strategy, secrets });
      await maybeSave(chatStore, {
        documentId: document.id,
        userId: currentUser.id,
        question,
        answer,
        citations: [],
        metadata: answer.metadata,
        retrievedChunks: retrievalMetadata.retrievedChunks,
      });
      return { statusCode: 200, answer, retrievedChunks: retrievalMetadata.retrievedChunks };
    }

    const promptId = strategy.contextStrategy === 'fallback' ? 'doculens.fallback' : 'doculens.chat';
    const providerDocument = documentForProvider(document);
    const providerPayload = {
      documentId: document.id,
      userId: currentUser.id,
      question,
      prompt: { id: promptId, version: PROMPT_VERSION },
      contextStrategy: strategy.contextStrategy,
      chunks: strategy.contextStrategy === 'rag' ? retrievedChunks : [],
      document: strategy.contextStrategy === 'fallback' ? providerDocument : undefined,
      secrets: secretsForProvider(secrets),
      context: {
        strategy: strategy.contextStrategy,
        retrievalBackend: retrievalResult?.retrievalBackend,
        fallbackReason: strategy.fallbackReason,
        retrievedChunkIds: retrievalMetadata.retrievedChunkIds,
        retrievalScoreSummary: strategy.retrievalScoreSummary,
        chunks: strategy.contextStrategy === 'rag' ? retrievedChunks : [],
        document: strategy.contextStrategy === 'fallback' ? providerDocument : undefined,
        thinkingMode: 'standard',
      },
    };
    const providerResult = await aiProvider.answerQuestion(providerPayload);
    const acceptedCitations = strategy.contextStrategy === 'rag'
      ? validCitations(providerResult.citations, retrievedChunks, secrets)
      : [];
    const answer = normalizeProviderAnswer(providerResult, {
      metadata: retrievalMetadata,
      strategy,
      citations: acceptedCitations,
      secrets,
    });

    await maybeSave(chatStore, {
      documentId: document.id,
      userId: currentUser.id,
      question,
      answer,
      citations: acceptedCitations,
      metadata: answer.metadata,
      retrievedChunks: retrievalMetadata.retrievedChunks,
    });
    return { statusCode: 201, answer, retrievedChunks: retrievalMetadata.retrievedChunks };
  }

  return { analyzeDocument, answerQuestion, analysisRepository: analysisStore, chatRepository: chatStore };
}

export { createInMemoryAnalysisRepository, createInMemoryChatRepository };
