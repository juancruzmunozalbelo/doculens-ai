import { contentExcerptFor, normalizeScore } from './utils.mjs';

function publicMetadataChunk(chunk) {
  return {
    chunkId: chunk.chunkId ?? chunk.chunk_id,
    documentId: chunk.documentId ?? chunk.document_id,
    chunkIndex: chunk.chunkIndex ?? chunk.chunk_index,
    headingPath: [...(chunk.headingPath ?? chunk.heading_path ?? [])],
    contentExcerpt: contentExcerptFor({ content: chunk.content, contentExcerpt: chunk.contentExcerpt ?? chunk.content_excerpt }),
    tokenEstimate: chunk.tokenEstimate ?? chunk.token_estimate ?? null,
    normalizedScore: normalizeScore(chunk.normalizedScore ?? chunk.normalized_score ?? chunk.score),
    retrievalMetadata: { ...(chunk.retrievalMetadata ?? chunk.retrieval_metadata ?? {}) },
  };
}

export function buildRetrievalMetadata({ retrievalResult, strategy } = {}) {
  const retrievedChunks = (retrievalResult?.retrievedChunks ?? []).map(publicMetadataChunk);
  const retrievalBackend = strategy?.retrievalBackend ?? retrievalResult?.retrievalBackend ?? null;
  const configuredBackend = retrievalResult?.configuredBackend ?? retrievalBackend;
  const effectiveBackend = retrievalResult?.effectiveBackend ?? retrievalBackend;

  return {
    retrievedChunkIds: retrievedChunks.map((chunk) => chunk.chunkId),
    retrievalBackend,
    configuredBackend,
    effectiveBackend,
    backendProvenance: retrievalResult?.backendProvenance ?? null,
    backendFallbackReason: retrievalResult?.backendFallbackReason ?? null,
    fallbackReason: strategy?.fallbackReason ?? null,
    contextStrategy: strategy?.contextStrategy ?? null,
    unsupportedReason: strategy?.unsupportedReason ?? null,
    retrievalScoreSummary: strategy?.retrievalScoreSummary ?? retrievalResult?.scoreSummary ?? null,
    retrievedChunks,
  };
}
