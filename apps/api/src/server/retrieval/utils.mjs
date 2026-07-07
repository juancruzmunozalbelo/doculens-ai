export const DEFAULT_RELEVANCE_THRESHOLD = 0.55;
export const DEFAULT_TOP_K = 4;
export const LEXICAL_FALLBACK_BACKEND = 'lexical_fallback';
export const SUPPORTED_PREFERRED_BACKENDS = new Set(['pgvector', 'hybrid']);
export const BACKEND_PROVENANCE = Object.freeze({
  lexicalFallback: 'lexical_fallback',
  postgresqlRepository: 'postgresql_repository',
  testOnlyPreferredSearch: 'test_only_preferred_search',
  unavailable: 'unavailable',
});

export const FALLBACK_REASONS = Object.freeze({
  retrievalDisabled: 'retrieval_disabled',
  embeddingUnavailable: 'embedding_unavailable',
  missingChunkEmbeddings: 'missing_chunk_embeddings',
  vectorUnavailable: 'vector_unavailable',
  preferredBackendUnavailable: 'preferred_backend_unavailable',
});

const LEXICAL_STOPWORDS = new Set([
  'what',
  'which',
  'where',
  'when',
  'does',
  'this',
  'that',
  'the',
  'and',
  'for',
  'from',
  'with',
  'list',
  'show',
  'tell',
  'about',
  'source',
  'document',
  'file',
  'pdf',
]);


const MAX_EXCERPT_LENGTH = 240;

export function boundedTopK(topK = DEFAULT_TOP_K) {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error('topK must be a positive integer');
  }
  return topK;
}

export function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}

export function roundScore(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return null;
  }
  return Number(Number(value).toFixed(3));
}

export function normalizeScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return roundScore(numeric);
}

export function contentExcerptFor({ content, contentExcerpt } = {}) {
  const source = typeof contentExcerpt === 'string' && contentExcerpt.trim() !== '' ? contentExcerpt : String(content ?? '');
  if (source.length <= MAX_EXCERPT_LENGTH) {
    return source;
  }
  return `${source.slice(0, MAX_EXCERPT_LENGTH - 3)}...`;
}

export function buildScoreSummary({ retrievedChunks = [], relevanceThreshold = DEFAULT_RELEVANCE_THRESHOLD } = {}) {
  const threshold = Number.isFinite(Number(relevanceThreshold)) ? Number(relevanceThreshold) : DEFAULT_RELEVANCE_THRESHOLD;
  const scores = retrievedChunks
    .map((chunk) => normalizeScore(chunk.normalizedScore ?? chunk.score))
    .filter((score) => score !== null);

  if (scores.length === 0) {
    return {
      maxScore: null,
      minScore: null,
      averageScore: null,
      returnedChunks: retrievedChunks.length,
      passingChunks: 0,
      relevanceThreshold: threshold,
    };
  }

  const total = scores.reduce((sum, score) => sum + score, 0);
  return {
    maxScore: roundScore(Math.max(...scores)),
    minScore: roundScore(Math.min(...scores)),
    averageScore: roundScore(total / scores.length),
    returnedChunks: retrievedChunks.length,
    passingChunks: scores.filter((score) => score >= threshold).length,
    relevanceThreshold: threshold,
  };
}

export function retrievalUnavailableReason(error) {
  const code = typeof error?.code === 'string' ? error.code.toUpperCase() : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  const combined = `${code} ${message}`;

  if (/RETRIEVAL[_\s-]?DISABLED|LEXICAL[_\s-]?ONLY/i.test(combined)) {
    return FALLBACK_REASONS.retrievalDisabled;
  }
  if (/MISSING[_\s-]?CHUNK[_\s-]?EMBEDDINGS|CHUNK[_\s-]?EMBEDDINGS[_\s-]?MISSING|NO[_\s-]?CHUNK[_\s-]?EMBEDDINGS|STALE[_\s-]?EMBEDDINGS/i.test(combined)) {
    return FALLBACK_REASONS.missingChunkEmbeddings;
  }
  if (/EMBEDDING/i.test(combined)) {
    return FALLBACK_REASONS.embeddingUnavailable;
  }
  if (/PREFERRED[_\s-]?RETRIEVAL|PREFERRED[_\s-]?BACKEND|TEST[_\s-]?ONLY[_\s-]?PREFERRED|FAKE[_\s-]?PREFERRED/i.test(combined)) {
    return FALLBACK_REASONS.preferredBackendUnavailable;
  }
  if (/PGVECTOR|VECTOR/i.test(combined)) {
    return FALLBACK_REASONS.vectorUnavailable;
  }
  return null;
}

export function lexicalTerms(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !LEXICAL_STOPWORDS.has(term));
}

export function lexicalScore(query, chunk) {
  const queryTerms = new Set(lexicalTerms(query));
  if (queryTerms.size === 0) {
    return 0;
  }

  const searchableText = [chunk.headingPath?.join(' '), chunk.content, chunk.contentExcerpt].filter(Boolean).join(' ');
  const chunkTerms = new Set(lexicalTerms(searchableText));
  let matches = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) {
      matches += 1;
    }
  }
  return roundScore(matches / queryTerms.size) ?? 0;
}
