import { randomUUID } from 'node:crypto';
import { PROMPT_VERSION } from '../ai/prompts/registry.mjs';
import { decideRetrievalStrategy } from '../retrieval/policy.mjs';
import { buildRetrievalMetadata } from '../retrieval/metadata.mjs';
import { redactSecrets } from '../security/redact.mjs';

const CHAT_TOP_K = 5;

const DISPLAY_COPY = Object.freeze({
  grounded: {
    label: 'Based on this document',
    message: 'Based on this document.',
  },
  insufficient_evidence: {
    label: 'Not enough evidence',
    message: 'Not enough evidence in this document yet. Ask a more specific question about obligations, risks, parties, dates, or sections in the selected source.',
  },
  unsupported: {
    label: 'Outside this document',
    message: 'Outside this document. Ask about obligations, risks, parties, dates, or terms contained in the selected source.',
  },
});

const SENSITIVE_DISPLAY_PATTERNS = Object.freeze([
  { label: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: '[REDACTED:AWS_ACCESS_KEY]' },
  { label: 'API key', pattern: /\bsk-(?:minimax[_-]?)?[A-Za-z0-9_-]{16,}\b/gi, replacement: '[REDACTED:API_KEY]' },
  { label: 'JWT token', pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replacement: '[REDACTED:JWT]' },
  { label: 'database URL password', pattern: /postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@([^\s'")]+)/gi, replacement: 'postgresql://$1:[REDACTED:DATABASE_PASSWORD]@$3' },
  { label: 'credential value', pattern: /\b(?:api[_-]?key|secret(?:[_-]?key)?|password|passwd|token|authorization)\s*[:=]\s*["']?[^\s'",;]{8,}["']?/gi, replacement: '[REDACTED:CREDENTIAL]' },
]);

const UNSAFE_DISPLAY_KEY_PATTERN = /(?:chain.*thought|hidden.*reasoning|internal.*policy|system.*policy|system.*prompt|developer.*instruction|raw.*provider|provider.*payload|provider.*response|response.*id|reasoning|think)/i;

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

function sanitizeMetadataValue(value, secrets) {
  if (typeof value === 'string') {
    return redactSecrets(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadataValue(item, secrets));
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeMetadataValue(item, secrets)]));
  }
  return value;
}

function redactCredentialLikeText(value) {
  const warnings = new Set();
  let text = String(value ?? '');
  for (const { label, pattern, replacement } of SENSITIVE_DISPLAY_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      warnings.add(`${label} redacted from AI display output`);
      pattern.lastIndex = 0;
      text = text.replace(pattern, replacement);
    }
  }
  return { text, warnings: [...warnings] };
}

function displayTextFromJsonFence(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  if (!fence) {
    return text;
  }
  const inner = fence[1].trim();
  try {
    const parsed = JSON.parse(inner);
    for (const key of ['answer', 'summary', 'final', 'content', 'text']) {
      if (typeof parsed?.[key] === 'string' && parsed[key].trim() !== '') {
        return parsed[key];
      }
    }
  } catch {
    // Fall through and show only the unfenced prose.
  }
  return inner;
}

function displayTextFromJsonPayload(text) {
  const trimmed = String(text ?? '').trim();
  if (!/^[{[]/.test(trimmed)) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed);
    for (const key of ['answer', 'summary', 'final', 'content', 'text']) {
      if (typeof parsed?.[key] === 'string' && parsed[key].trim() !== '') {
        return parsed[key];
      }
    }
  } catch {
    return null;
  }
  return null;
}

function stripHiddenReasoning(value) {
  const original = String(value ?? '');
  const fencedPayload = original.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  const fencedDisplay = fencedPayload ? displayTextFromJsonPayload(fencedPayload[1]) : null;
  if (fencedDisplay) {
    return fencedDisplay.trim();
  }
  const rawJsonDisplay = displayTextFromJsonPayload(original);
  if (rawJsonDisplay) {
    return rawJsonDisplay.trim();
  }


  let text = displayTextFromJsonFence(original)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/gi, (_, inner) => displayTextFromJsonPayload(inner) ?? '');

  const finalAnswer = text.match(/(?:^|\n)\s*(?:final\s+answer|answer)\s*:\s*([\s\S]+)$/i);
  if (finalAnswer && /\b(?:chain[-\s]?of[-\s]?thought|hidden reasoning|reasoning|internal analysis)\b/i.test(text.slice(0, finalAnswer.index))) {
    text = finalAnswer[1];
  }

  text = text
    .replace(/^\s*(?:chain[-\s]?of[-\s]?thought|hidden reasoning|reasoning trace|internal analysis|internal policy|system prompt|developer instructions?)\s*:.*$/gim, '')
    .replace(/^\s*.*\b(?:as an ai|system|developer)\b.*\b(?:instruction|prompt|policy|message)\b.*$/gim, '')
    .replace(/^\s*.*\b(?:cannot|can't|won't)\b.*\b(?:chain[-\s]?of[-\s]?thought|hidden reasoning|system prompt|developer instruction|internal policy)\b.*$/gim, '')
    .replace(/<\/?(?:system|developer|policy|hidden_reasoning|provider_payload)[^>]*>/gi, '')
    .replace(/["']?\b(?:providerResponseId|provider_response_id|response_id)\b["']?\s*[:=]\s*["']?[A-Za-z0-9._:-]+["']?/gi, '')
    .replace(/\bRAW_PROVIDER_PAYLOAD[\w:-]*\b/gi, '[REDACTED:PROVIDER_PAYLOAD]')
    .replace(/\bSYSTEM_POLICY[\w:-]*\b/gi, '[REDACTED:POLICY]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  text = displayTextFromJsonPayload(text) ?? text;

  return text.trim();
}

function sanitizeDisplayText(value, secrets, fallback = '') {
  const redacted = redactSecrets(String(value ?? ''), secrets);
  const withoutReasoning = stripHiddenReasoning(redacted);
  const credentialSafe = redactCredentialLikeText(withoutReasoning);
  return {
    text: credentialSafe.text.trim() || fallback,
    warnings: credentialSafe.warnings,
  };
}

function sanitizeDisplayValue(value, secrets, warnings) {
  if (typeof value === 'string') {
    const sanitized = sanitizeDisplayText(value, secrets);
    warnings.push(...sanitized.warnings);
    return sanitized.text;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item, secrets, warnings));
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !UNSAFE_DISPLAY_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeDisplayValue(item, secrets, warnings)]));
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
    'tokenEstimate',
    'tokenEstimates',
    'tokenUsage',
  ]) {
    if (source[key] !== undefined) {
      safe[key] = sanitizeMetadataValue(source[key], secrets);
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
  const displayWarnings = [];
  const sanitizedSummary = sanitizeDisplayText(requireText(source.summary, 'analysis.summary'), secrets, 'Analysis summary unavailable.');
  displayWarnings.push(...sanitizedSummary.warnings);
  const analysis = {
    summary: sanitizedSummary.text,
    entities: sanitizeDisplayValue(asArray(source.entities), secrets, displayWarnings),
    obligations: sanitizeDisplayValue(asArray(source.obligations), secrets, displayWarnings),
    risks: sanitizeDisplayValue(asArray(source.risks), secrets, displayWarnings),
    uncertainties: sanitizeDisplayValue(asArray(source.uncertainties), secrets, displayWarnings),
    displayWarnings: [...new Set(displayWarnings)],
    metadata: {
      ...metadata,
      promptId: metadata.promptId ?? 'doculens.analysis',
      promptVersion: metadata.promptVersion ?? PROMPT_VERSION,
      contextStrategy: metadata.contextStrategy ?? 'full_document',
      displaySafety: {
        sanitized: true,
        redactionWarnings: [...new Set(displayWarnings)],
      },
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

function scoreSummaryFrom(metadata = {}, strategy = {}) {
  return strategy.retrievalScoreSummary ?? metadata.retrievalScoreSummary ?? null;
}

function buildDisplayState({ metadata, strategy, citations }) {
  const scoreSummary = scoreSummaryFrom(metadata, strategy);
  const passingChunks = Number(scoreSummary?.passingChunks ?? 0);
  const topScore = Number(scoreSummary?.topScore ?? scoreSummary?.maxScore ?? 0);
  const relevanceThreshold = scoreSummary?.relevanceThreshold ?? null;
  const citationCount = asArray(citations).length;

  if (strategy.contextStrategy === 'unsupported') {
    return {
      kind: 'unsupported',
      label: DISPLAY_COPY.unsupported.label,
      message: DISPLAY_COPY.unsupported.message,
      reason: strategy.unsupportedReason ?? 'outside_document_scope',
      citationCount: 0,
      passingChunks,
      relevanceThreshold,
    };
  }

  if (strategy.contextStrategy === 'fallback') {
    if (citationCount === 0 || passingChunks <= 0 || topScore <= 0) {
      return {
        kind: 'insufficient_evidence',
        label: DISPLAY_COPY.insufficient_evidence.label,
        message: DISPLAY_COPY.insufficient_evidence.message,
        reason: strategy.fallbackReason ?? 'fallback_full_document',
        citationCount,
        passingChunks,
        relevanceThreshold,
      };
    }
  }

  if (citationCount === 0 || passingChunks <= 0 || topScore <= 0) {
    return {
      kind: 'insufficient_evidence',
      label: DISPLAY_COPY.insufficient_evidence.label,
      message: DISPLAY_COPY.insufficient_evidence.message,
      reason: citationCount === 0 ? 'empty_citations' : 'no_passing_retrieved_chunks',
      citationCount,
      passingChunks,
      relevanceThreshold,
    };
  }

  return {
    kind: 'grounded',
    label: DISPLAY_COPY.grounded.label,
    message: DISPLAY_COPY.grounded.message,
    reason: null,
    citationCount,
    passingChunks,
    relevanceThreshold,
  };
}

function citationPolicyFor(displayState, strategy) {
  if (displayState.kind === 'unsupported') {
    return 'no_citations_for_unsupported_answer';
  }
  if (displayState.kind === 'insufficient_evidence') {
    return 'insufficient_evidence_no_grounded_citations';
  }
  if (strategy.contextStrategy === 'fallback') {
    return 'fallback_full_document_no_chunk_citations';
  }
  return 'retrieved_chunk_ids_only';
}

function normalizeProviderAnswer(providerResult = {}, { metadata, strategy, citations, secrets }) {
  const rawText = providerResult.text ?? providerResult.answer ?? providerResult.content ?? '';
  const providerMetadata = safeProviderMetadata(providerResult.metadata, secrets);
  const displayWarnings = [];
  const sanitizedText = sanitizeDisplayText(String(rawText), secrets, DISPLAY_COPY.insufficient_evidence.message);
  displayWarnings.push(...sanitizedText.warnings);
  const sanitizedCitations = sanitizeDisplayValue(citations, secrets, displayWarnings);
  const displayState = buildDisplayState({ metadata, strategy, citations: sanitizedCitations });
  const answerText = displayState.kind === 'insufficient_evidence'
    ? DISPLAY_COPY.insufficient_evidence.message
    : sanitizedText.text;
  const answerMetadata = sanitizeMetadataValue({
    ...providerMetadata,
    ...metadata,
    retrievedChunks: undefined,
    contextStrategy: strategy.contextStrategy,
    fallbackReason: strategy.fallbackReason ?? displayState.reason ?? null,
    unsupportedReason: strategy.unsupportedReason ?? null,
    displayState,
    displaySafety: {
      sanitized: true,
      redactionWarnings: [...new Set(displayWarnings)],
    },
    citationPolicy: citationPolicyFor(displayState, strategy),
  }, secrets);

  delete answerMetadata.retrievedChunks;

  return {
    text: answerText,
    displayText: answerText,
    displayState,
    displayWarnings: [...new Set(displayWarnings)],
    citations: sanitizedCitations,
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
      quote: sanitizeDisplayText(String(citation.quote ?? ''), secrets).text,
      citationIndex: index,
    }));
}

function fallbackCitationFromRetrievedChunk(retrievedChunks, secrets) {
  const chunk = retrievedChunks[0];
  const chunkId = chunk?.chunkId ?? chunk?.id;
  if (typeof chunkId !== 'string' || chunkId.trim() === '') {
    return [];
  }
  const quoteSource = typeof chunk.contentExcerpt === 'string' && chunk.contentExcerpt.trim() !== ''
    ? chunk.contentExcerpt
    : typeof chunk.content === 'string'
      ? chunk.content
      : '';
  return [{
    chunkId,
    quote: sanitizeDisplayText(quoteSource.slice(0, 240), secrets).text,
    citationIndex: 0,
  }];
}

function sanitizeRetrievedChunks(retrievedChunks, secrets) {
  const warnings = [];
  return asArray(retrievedChunks).map((chunk) => sanitizeDisplayValue(chunk, secrets, warnings));
}

function unsupportedAnswer({ metadata, strategy, secrets }) {
  const displayState = buildDisplayState({ metadata, strategy, citations: [] });
  const displayWarnings = [];
  const answerMetadata = sanitizeMetadataValue({
    ...metadata,
    retrievedChunks: undefined,
    contextStrategy: 'unsupported',
    unsupportedReason: strategy.unsupportedReason ?? 'outside_document_scope',
    displayState,
    displaySafety: {
      sanitized: true,
      redactionWarnings: displayWarnings,
    },
    citationPolicy: 'no_citations_for_unsupported_answer',
  }, secrets);
  delete answerMetadata.retrievedChunks;
  return {
    text: DISPLAY_COPY.unsupported.message,
    displayText: DISPLAY_COPY.unsupported.message,
    displayState,
    displayWarnings,
    unsupported: true,
    citations: [],
    uncertainty: null,
    metadata: answerMetadata,
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
    const safeRetrievedChunks = sanitizeRetrievedChunks(retrievalMetadata.retrievedChunks, secrets);
    const safeRetrievalMetadata = { ...retrievalMetadata, retrievedChunks: safeRetrievedChunks };

    if (strategy.contextStrategy === 'unsupported') {
      const answer = unsupportedAnswer({ metadata: safeRetrievalMetadata, strategy, secrets });
      await maybeSave(chatStore, {
        documentId: document.id,
        userId: currentUser.id,
        question,
        answer,
        citations: [],
        metadata: answer.metadata,
        retrievedChunks: safeRetrievedChunks,
      });
      return { statusCode: 200, answer, retrievedChunks: safeRetrievedChunks };
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
    const validProviderCitations = strategy.contextStrategy === 'rag'
      ? validCitations(providerResult.citations, retrievedChunks, secrets)
      : [];
    const acceptedCitations = strategy.contextStrategy === 'rag' && validProviderCitations.length === 0
      ? fallbackCitationFromRetrievedChunk(retrievedChunks, secrets)
      : validProviderCitations;
    const answer = normalizeProviderAnswer(providerResult, {
      metadata: safeRetrievalMetadata,
      strategy,
      citations: acceptedCitations,
      secrets,
    });

    await maybeSave(chatStore, {
      documentId: document.id,
      userId: currentUser.id,
      question,
      answer,
      citations: answer.citations,
      metadata: answer.metadata,
      retrievedChunks: safeRetrievedChunks,
    });
    return { statusCode: 201, answer, retrievedChunks: safeRetrievedChunks };
  }

  return { analyzeDocument, answerQuestion, analysisRepository: analysisStore, chatRepository: chatStore };
}

export { createInMemoryAnalysisRepository, createInMemoryChatRepository };
