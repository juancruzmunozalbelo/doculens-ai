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

  return {
    retrievedChunkIds: retrievedChunks.map((chunk) => chunk.chunkId),
    retrievalBackend,
    backendFallbackReason: retrievalResult?.backendFallbackReason ?? null,
    contextStrategy: strategy?.contextStrategy ?? null,
    fallbackReason: strategy?.fallbackReason ?? null,
    unsupportedReason: strategy?.unsupportedReason ?? null,
    retrievalScoreSummary: strategy?.retrievalScoreSummary ?? retrievalResult?.scoreSummary ?? null,
    retrievedChunks,
  };
}
