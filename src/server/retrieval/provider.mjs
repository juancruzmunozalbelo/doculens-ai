import {
  DEFAULT_RELEVANCE_THRESHOLD,
  LEXICAL_FALLBACK_BACKEND,
  SUPPORTED_PREFERRED_BACKENDS,
  boundedTopK,
  buildScoreSummary,
  contentExcerptFor,
  lexicalScore,
  normalizeScore,
  requireNonEmptyString,
  retrievalUnavailableReason,
} from './utils.mjs';

function normalizePreferredBackend(preferredBackend = 'hybrid') {
  if (SUPPORTED_PREFERRED_BACKENDS.has(preferredBackend)) {
    return preferredBackend;
  }
  if (preferredBackend === LEXICAL_FALLBACK_BACKEND) {
    return preferredBackend;
  }
  throw new Error('preferredBackend must be pgvector, hybrid, or lexical_fallback');
}

function metadataForBackend(backend, backendFallbackReason) {
  return backendFallbackReason
    ? { backend, backendFallbackReason }
    : { backend };
}

function citationReadyChunk(row, { backend, backendFallbackReason }) {
  return {
    id: row.id,
    documentId: row.documentId ?? row.document_id,
    userId: row.userId ?? row.user_id,
    chunkId: row.chunkId ?? row.chunk_id,
    chunkIndex: row.chunkIndex ?? row.chunk_index,
    headingPath: [...(row.headingPath ?? row.heading_path ?? [])],
    content: row.content,
    contentExcerpt: contentExcerptFor({ content: row.content, contentExcerpt: row.contentExcerpt ?? row.content_excerpt }),
    tokenEstimate: row.tokenEstimate ?? row.token_estimate ?? null,
    normalizedScore: normalizeScore(row.normalizedScore ?? row.normalized_score ?? row.score),
    retrievalMetadata: metadataForBackend(backend, backendFallbackReason),
  };
}

function sortByScoreThenIndex(left, right) {
  const scoreDelta = normalizeScore(right.normalizedScore ?? right.normalized_score ?? right.score)
    - normalizeScore(left.normalizedScore ?? left.normalized_score ?? left.score);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return (left.chunkIndex ?? left.chunk_index ?? Number.MAX_SAFE_INTEGER)
    - (right.chunkIndex ?? right.chunk_index ?? Number.MAX_SAFE_INTEGER);
}

function rowBelongsToScope(row, { documentId, userId }) {
  const rowDocumentId = row.documentId ?? row.document_id;
  const rowUserId = row.userId ?? row.user_id;
  return rowDocumentId === documentId && rowUserId === userId;
}


function rowsToResult({ rows, backend, backendFallbackReason, relevanceThreshold, documentId, userId, limit }) {
  const scopedRows = rows.filter((row) => rowBelongsToScope(row, { documentId, userId })).slice(0, limit);
  const retrievedChunks = scopedRows.map((row) => citationReadyChunk(row, { backend, backendFallbackReason }));
  return {
    retrievalBackend: backend,
    backendFallbackReason,
    retrievedChunks,
    scoreSummary: buildScoreSummary({ retrievedChunks, relevanceThreshold }),
  };
}

function lexicalSearchFromRepository(chunkRepository) {
  if (!chunkRepository || typeof chunkRepository.listForDocumentForUser !== 'function') {
    return null;
  }

  return async ({ documentId, userId, query, limit }) => {
    const chunks = await chunkRepository.listForDocumentForUser({ documentId, userId });
    return chunks
      .map((chunk) => ({ ...chunk, score: lexicalScore(query, chunk) }))
      .sort((left, right) => {
        const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return (left.chunkIndex ?? Number.MAX_SAFE_INTEGER) - (right.chunkIndex ?? Number.MAX_SAFE_INTEGER);
      })
      .slice(0, limit);
  };
}

async function runPreferredSearch({ preferredSearch, documentId, userId, query, limit }) {
  if (typeof preferredSearch !== 'function') {
    const error = new Error('preferred retrieval backend is unavailable');
    error.code = 'PREFERRED_RETRIEVAL_UNAVAILABLE';
    throw error;
  }
  return await preferredSearch({ documentId, userId, query, limit });
}

export function createRetrievalProvider({
  preferredBackend = 'hybrid',
  preferredSearch,
  lexicalSearch,
  chunkRepository,
  chunks,
  relevanceThreshold = DEFAULT_RELEVANCE_THRESHOLD,
} = {}) {
  const configuredPreferredBackend = normalizePreferredBackend(preferredBackend);
  const configuredLexicalSearch = lexicalSearch ?? lexicalSearchFromRepository(chunkRepository ?? chunks);

  async function retrieve({ documentId, userId, query, topK, limit } = {}) {
    requireNonEmptyString(documentId, 'documentId');
    requireNonEmptyString(userId, 'userId');
    requireNonEmptyString(query, 'query');
    const boundedLimit = boundedTopK(topK ?? limit);

    if (configuredPreferredBackend === LEXICAL_FALLBACK_BACKEND) {
      if (typeof configuredLexicalSearch !== 'function') {
        throw new Error('lexical fallback search is required when preferredBackend is lexical_fallback');
      }
      const rows = await configuredLexicalSearch({ documentId, userId, query, limit: boundedLimit });
      return rowsToResult({
        rows: [...rows].sort(sortByScoreThenIndex),
        backend: LEXICAL_FALLBACK_BACKEND,
        backendFallbackReason: 'embedding_unavailable',
        relevanceThreshold,
        documentId,
        userId,
        limit: boundedLimit,
      });
    }

    try {
      const rows = await runPreferredSearch({ preferredSearch, documentId, userId, query, limit: boundedLimit });
      return rowsToResult({
        rows,
        backend: configuredPreferredBackend,
        backendFallbackReason: null,
        relevanceThreshold,
        documentId,
        userId,
        limit: boundedLimit,
      });
    } catch (error) {
      const backendFallbackReason = retrievalUnavailableReason(error);
      if (!backendFallbackReason) {
        throw error;
      }
      if (typeof configuredLexicalSearch !== 'function') {
        const fallbackError = new Error('lexical fallback search is required when preferred retrieval is unavailable');
        fallbackError.cause = error;
        fallbackError.code = 'LEXICAL_FALLBACK_UNAVAILABLE';
        throw fallbackError;
      }

      const rows = await configuredLexicalSearch({ documentId, userId, query, limit: boundedLimit });
      return rowsToResult({
        rows: [...rows].sort(sortByScoreThenIndex),
        backend: LEXICAL_FALLBACK_BACKEND,
        backendFallbackReason,
        relevanceThreshold,
        documentId,
        userId,
        limit: boundedLimit,
      });
    }
  }

  return { retrieve };
}
