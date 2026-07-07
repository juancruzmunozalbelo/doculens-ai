import {
  EMBEDDING_CONTRACT,
  EmbeddingError,
} from '../embeddings/provider.mjs';

const VECTOR_ENABLED_BACKENDS = new Set(['pgvector', 'hybrid']);

function embeddingConfigFrom(options = {}) {
  const embedding = options.embedding ?? {};
  const retrieval = options.retrieval ?? {};
  const provider = embedding.provider ?? options.embeddingProvider;
  const configuredBackend = retrieval.configuredBackend ?? retrieval.retrievalBackend ?? options.retrievalBackend;
  const enabled = embedding.enabled ?? options.enabled ?? VECTOR_ENABLED_BACKENDS.has(configuredBackend);
  return {
    enabled: Boolean(enabled),
    strict: Boolean(embedding.strict ?? options.strict),
    provider: embedding.providerName ?? embedding.providerId ?? provider?.provider ?? EMBEDDING_CONTRACT.provider,
    model: embedding.model ?? provider?.model ?? EMBEDDING_CONTRACT.model,
    dimensions: embedding.dimensions ?? provider?.dimensions ?? EMBEDDING_CONTRACT.dimensions,
    timeoutMs: embedding.timeoutMs,
    maxTexts: embedding.maxTexts,
    maxCharactersPerText: embedding.maxCharactersPerText ?? embedding.maxCharacters,
    maxTotalCharacters: embedding.maxTotalCharacters,
  };
}

function safeEmbeddingErrorCode(error) {
  const code = typeof error?.code === 'string' && error.code.startsWith('EMBEDDING_')
    ? error.code
    : 'EMBEDDING_PROVIDER_UNAVAILABLE';
  return code;
}

function embeddingInputForChunk(chunk) {
  const headings = Array.isArray(chunk.headingPath) ? chunk.headingPath.join(' > ') : '';
  return headings.trim() === '' ? chunk.content : `${headings}\n\n${chunk.content}`;
}

function metadataWithEmbedding(chunk, embeddingMetadata) {
  return {
    ...(chunk.retrievalMetadata ?? {}),
    embedding: embeddingMetadata,
  };
}

function successChunk(chunk, result) {
  const embeddingMetadata = {
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    status: 'ready',
    fallbackReason: null,
  };
  return {
    ...chunk,
    embedding: result.vector,
    embeddingProvider: result.provider,
    embeddingModel: result.model,
    embeddingDimensions: result.dimensions,
    embeddingStatus: 'ready',
    embeddingErrorCode: null,
    retrievalMetadata: metadataWithEmbedding(chunk, embeddingMetadata),
  };
}

function skippedChunk(chunk, config) {
  const embeddingMetadata = {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    status: 'skipped',
    fallbackReason: 'retrieval_disabled',
  };
  return {
    ...chunk,
    embeddingProvider: config.provider,
    embeddingModel: config.model,
    embeddingDimensions: config.dimensions,
    embeddingStatus: 'skipped',
    embeddingErrorCode: null,
    retrievalMetadata: metadataWithEmbedding(chunk, embeddingMetadata),
  };
}

function failedChunk(chunk, config, error) {
  const code = safeEmbeddingErrorCode(error);
  const embeddingMetadata = {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    status: 'failed',
    fallbackReason: 'embedding_unavailable',
    errorCode: code,
  };
  return {
    ...chunk,
    embeddingProvider: config.provider,
    embeddingModel: config.model,
    embeddingDimensions: config.dimensions,
    embeddingStatus: 'failed',
    embeddingErrorCode: code,
    retrievalMetadata: metadataWithEmbedding(chunk, embeddingMetadata),
  };
}

function strictEmbeddingError(error) {
  if (error instanceof EmbeddingError) {
    return error;
  }
  return new EmbeddingError('embedding generation failed', {
    code: safeEmbeddingErrorCode(error),
    statusCode: error?.statusCode ?? 503,
  });
}

export async function enrichChunksWithEmbeddings(chunks, options = {}) {
  if (!Array.isArray(chunks)) {
    throw new Error('chunks must be an array');
  }

  const config = embeddingConfigFrom(options);
  if (!config.enabled) {
    return chunks.map((chunk) => skippedChunk(chunk, config));
  }

  const embeddingProvider = options.embeddingProvider ?? options.provider;
  if (!embeddingProvider || typeof embeddingProvider.embedTexts !== 'function') {
    const error = new EmbeddingError('embedding provider is unavailable', {
      code: 'EMBEDDING_PROVIDER_UNAVAILABLE',
      statusCode: 503,
    });
    if (config.strict) {
      throw error;
    }
    return chunks.map((chunk) => failedChunk(chunk, config, error));
  }

  try {
    const texts = chunks.map(embeddingInputForChunk);
    const embeddings = await embeddingProvider.embedTexts(texts, {
      timeoutMs: config.timeoutMs,
      maxTexts: config.maxTexts,
      maxCharactersPerText: config.maxCharactersPerText,
      maxTotalCharacters: config.maxTotalCharacters,
    });
    if (!Array.isArray(embeddings) || embeddings.length !== chunks.length) {
      throw new EmbeddingError('embedding provider returned invalid batch result', {
        code: 'EMBEDDING_BATCH_RESULT_INVALID',
        statusCode: 503,
      });
    }
    return chunks.map((chunk, index) => successChunk(chunk, embeddings[index]));
  } catch (error) {
    if (config.strict) {
      throw strictEmbeddingError(error);
    }
    return chunks.map((chunk) => failedChunk(chunk, config, error));
  }
}

export function embeddingCoverageForChunks(chunks) {
  const total = Array.isArray(chunks) ? chunks.length : 0;
  const ready = Array.isArray(chunks) ? chunks.filter((chunk) => chunk.embeddingStatus === 'ready').length : 0;
  const failed = Array.isArray(chunks) ? chunks.filter((chunk) => chunk.embeddingStatus === 'failed').length : 0;
  const skipped = Array.isArray(chunks) ? chunks.filter((chunk) => chunk.embeddingStatus === 'skipped').length : 0;
  const status = total === 0
    ? 'empty'
    : ready === total
      ? 'ready'
      : failed > 0
        ? 'failed'
        : skipped === total
          ? 'skipped'
          : 'partial';
  return Object.freeze({ total, ready, failed, skipped, status });
}
