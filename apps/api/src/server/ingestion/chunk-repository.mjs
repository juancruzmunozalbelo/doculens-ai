function assertChunkShape(chunk) {
  if (!chunk || typeof chunk !== 'object') {
    throw new Error('chunk must be an object');
  }
  if (typeof chunk.chunkId !== 'string' || chunk.chunkId.trim() === '') {
    throw new Error('chunkId is required');
  }
  if (!Number.isInteger(chunk.chunkIndex) || chunk.chunkIndex < 0) {
    throw new Error('chunkIndex must be a non-negative integer');
  }
  if (!Array.isArray(chunk.headingPath) || chunk.headingPath.some((heading) => typeof heading !== 'string')) {
    throw new Error('headingPath must be an array of strings');
  }
  if (typeof chunk.content !== 'string' || chunk.content.trim() === '') {
    throw new Error('chunk content is required');
  }
  if (!Number.isInteger(chunk.tokenEstimate) || chunk.tokenEstimate <= 0) {
    throw new Error('tokenEstimate must be a positive integer');
  }
  if (chunk.embedding !== undefined && chunk.embedding !== null) {
    if (!Array.isArray(chunk.embedding) || chunk.embedding.some((value) => !Number.isFinite(Number(value)))) {
      throw new Error('chunk embedding must be a numeric array');
    }
  }
}

function publicChunk(row) {
  return {
    id: row.id,
    documentId: row.documentId,
    userId: row.userId,
    chunkId: row.chunkId,
    chunkIndex: row.chunkIndex,
    headingPath: [...row.headingPath],
    content: row.content,
    tokenEstimate: row.tokenEstimate,
    embedding: row.embedding ?? null,
    embeddingProvider: row.embeddingProvider ?? null,
    embeddingModel: row.embeddingModel ?? null,
    embeddingDimensions: row.embeddingDimensions ?? null,
    embeddingStatus: row.embeddingStatus ?? null,
    embeddingErrorCode: row.embeddingErrorCode ?? null,
    retrievalMetadata: row.retrievalMetadata ?? {},
    createdAt: row.createdAt,
  };
}

async function requireOwnedDocument({ documents, documentId, userId }) {
  if (!documents || typeof documents.findByIdForUser !== 'function') {
    throw new Error('documents repository with findByIdForUser is required for chunk integrity');
  }
  const document = await documents.findByIdForUser({ documentId, userId });
  if (!document) {
    const error = new Error('document not found or forbidden for chunk write');
    error.statusCode = 404;
    throw error;
  }
  if (document.status === 'failed') {
    const error = new Error('document is failed and cannot accept chunks');
    error.statusCode = 409;
    throw error;
  }
  return document;
}

export function createInMemoryChunkRepository({ documents } = {}) {
  const chunksByDocument = new Map();
  let nextId = 1;

  return {
    async createManyForDocument({ documentId, userId, chunks }) {
      await requireOwnedDocument({ documents, documentId, userId });
      if (!Array.isArray(chunks)) {
        throw new Error('chunks must be an array');
      }

      const existing = chunksByDocument.get(documentId) ?? [];
      const seen = new Set(existing.map((chunk) => chunk.chunkId));
      const nextRows = [];
      for (const chunk of chunks) {
        assertChunkShape(chunk);
        if (seen.has(chunk.chunkId)) {
          const error = new Error(`duplicate chunk id ${chunk.chunkId} for document ${documentId}`);
          error.statusCode = 409;
          throw error;
        }
        seen.add(chunk.chunkId);
        nextRows.push({
          id: `chunk-${nextId++}`,
          documentId,
          userId,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          headingPath: [...chunk.headingPath],
          content: chunk.content,
          tokenEstimate: chunk.tokenEstimate,
          embedding: Array.isArray(chunk.embedding) ? [...chunk.embedding] : null,
          embeddingProvider: chunk.embeddingProvider ?? null,
          embeddingModel: chunk.embeddingModel ?? null,
          embeddingDimensions: chunk.embeddingDimensions ?? null,
          embeddingStatus: chunk.embeddingStatus ?? null,
          embeddingErrorCode: chunk.embeddingErrorCode ?? null,
          retrievalMetadata: chunk.retrievalMetadata ?? {},
          createdAt: new Date().toISOString(),
        });
      }

      chunksByDocument.set(documentId, existing.concat(nextRows));
      return nextRows.map(publicChunk);
    },

    async listForDocumentForUser({ documentId, userId }) {
      if (!documents || typeof documents.findByIdForUser !== 'function') {
        return [];
      }
      const document = await documents.findByIdForUser({ documentId, userId });
      if (!document) {
        return [];
      }
      return (chunksByDocument.get(documentId) ?? [])
        .filter((chunk) => chunk.userId === userId)
        .sort((left, right) => left.chunkIndex - right.chunkIndex)
        .map(publicChunk);
    },

    async deleteForDocument({ documentId }) {
      chunksByDocument.delete(documentId);
    },
  };
}
