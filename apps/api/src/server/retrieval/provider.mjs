import {
  BACKEND_PROVENANCE,
  DEFAULT_RELEVANCE_THRESHOLD,
  FALLBACK_REASONS,
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

function metadataForBackend({
  configuredBackend,
  effectiveBackend,
  backendProvenance,
  backendFallbackReason,
  componentScores,
}) {
  return {
    backend: effectiveBackend,
    configuredBackend,
    effectiveBackend,
    backendProvenance,
    backendFallbackReason: backendFallbackReason ?? null,
    ...(componentScores ? { componentScores } : {}),
  };
}

function componentScoresForRow(row) {
  const vectorScore = row.vectorScore ?? row.vector_score;
  const lexicalComponentScore = row.lexicalScore ?? row.lexical_score;
  const headingMatchScore = row.headingMatchScore ?? row.heading_match_score;
  const hybridScore = row.hybridScore ?? row.hybrid_score;
  const components = {};
  if (vectorScore !== undefined) components.vectorScore = normalizeScore(vectorScore);
  if (lexicalComponentScore !== undefined) components.lexicalScore = normalizeScore(lexicalComponentScore);
  if (headingMatchScore !== undefined) components.headingMatchScore = normalizeScore(headingMatchScore);
  if (hybridScore !== undefined) components.hybridScore = normalizeScore(hybridScore);
  return Object.keys(components).length > 0 ? components : null;
}

function citationReadyChunk(row, backendContext) {
  const componentScores = componentScoresForRow(row);
  const backendMetadata = metadataForBackend({ ...backendContext, componentScores });
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
    retrievalMetadata: { ...(row.retrievalMetadata ?? row.retrieval_metadata ?? {}), ...backendMetadata },
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


function rowsToResult({
  rows,
  configuredBackend,
  effectiveBackend,
  backendProvenance,
  backendFallbackReason,
  relevanceThreshold,
  documentId,
  userId,
  limit,
}) {
  const scopedRows = rows.filter((row) => rowBelongsToScope(row, { documentId, userId })).slice(0, limit);
  const backendContext = {
    configuredBackend,
    effectiveBackend,
    backendProvenance,
    backendFallbackReason,
  };
  const retrievedChunks = scopedRows.map((row) => citationReadyChunk(row, backendContext));
  return {
    retrievalBackend: effectiveBackend,
    configuredBackend,
    effectiveBackend,
    backendProvenance,
    backendFallbackReason: backendFallbackReason ?? null,
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

function normalizePreferredSearchResult(rawResult, { configuredBackend, preferredSearchProvenance }) {
  const rawRows = Array.isArray(rawResult)
    ? rawResult
    : (rawResult?.rows ?? rawResult?.chunks ?? rawResult?.retrievedChunks);
  if (!Array.isArray(rawRows)) {
    const error = new Error('preferred retrieval backend returned an invalid row set');
    error.code = 'PREFERRED_BACKEND_UNAVAILABLE';
    throw error;
  }

  const declaredProvenance = rawResult?.backendProvenance
    ?? rawResult?.provenance
    ?? rawResult?.retrievalMetadata?.backendProvenance
    ?? preferredSearchProvenance
    ?? (Array.isArray(rawResult) ? BACKEND_PROVENANCE.testOnlyPreferredSearch : null);
  const backendProvenance = rawResult?.testOnly === true
    ? BACKEND_PROVENANCE.testOnlyPreferredSearch
    : declaredProvenance;
  const effectiveBackend = rawResult?.effectiveBackend ?? rawResult?.retrievalBackend ?? configuredBackend;

  if (effectiveBackend !== configuredBackend || backendProvenance !== BACKEND_PROVENANCE.postgresqlRepository) {
    const error = new Error('preferred retrieval backend did not provide repository-backed vector provenance');
    error.code = backendProvenance === BACKEND_PROVENANCE.testOnlyPreferredSearch
      ? 'TEST_ONLY_PREFERRED_RETRIEVAL'
      : 'PREFERRED_BACKEND_UNAVAILABLE';
    throw error;
  }

  return {
    rows: rawRows,
    effectiveBackend,
    backendProvenance,
  };
}

async function runPreferredSearch({ preferredSearch, documentId, userId, query, limit, configuredBackend, preferredSearchProvenance }) {
  if (typeof preferredSearch !== 'function') {
    const error = new Error('preferred retrieval backend is unavailable');
    error.code = 'PREFERRED_RETRIEVAL_UNAVAILABLE';
    throw error;
  }
  const rawResult = await preferredSearch({ documentId, userId, query, limit });
  return normalizePreferredSearchResult(rawResult, { configuredBackend, preferredSearchProvenance });
}

export function createRetrievalProvider({
  preferredBackend = 'hybrid',
  preferredSearch,
  preferredSearchProvenance,
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
        configuredBackend: configuredPreferredBackend,
        effectiveBackend: LEXICAL_FALLBACK_BACKEND,
        backendProvenance: BACKEND_PROVENANCE.lexicalFallback,
        backendFallbackReason: FALLBACK_REASONS.retrievalDisabled,
        relevanceThreshold,
        documentId,
        userId,
        limit: boundedLimit,
      });
    }

    try {
      const preferredResult = await runPreferredSearch({
        preferredSearch,
        documentId,
        userId,
        query,
        limit: boundedLimit,
        configuredBackend: configuredPreferredBackend,
        preferredSearchProvenance,
      });
      return rowsToResult({
        rows: preferredResult.rows,
        configuredBackend: configuredPreferredBackend,
        effectiveBackend: preferredResult.effectiveBackend,
        backendProvenance: preferredResult.backendProvenance,
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
        configuredBackend: configuredPreferredBackend,
        effectiveBackend: LEXICAL_FALLBACK_BACKEND,
        backendProvenance: BACKEND_PROVENANCE.lexicalFallback,
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
