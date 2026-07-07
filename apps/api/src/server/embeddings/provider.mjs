const LOCKED_PROVIDER = 'local_hashing';
const LOCKED_MODEL = 'doculens-local-hashing-v1';
const LOCKED_DIMENSIONS = 384;

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_TEXTS = 256;
const DEFAULT_MAX_CHARACTERS_PER_TEXT = 16_000;
const DEFAULT_MAX_TOTAL_CHARACTERS = 250_000;

export const EMBEDDING_PROVIDER_LOCAL_HASHING = LOCKED_PROVIDER;
export const EMBEDDING_MODEL_LOCAL_HASHING = LOCKED_MODEL;
export const EMBEDDING_DIMENSIONS_LOCAL_HASHING = LOCKED_DIMENSIONS;
export const EMBEDDING_CONTRACT = Object.freeze({
  provider: LOCKED_PROVIDER,
  model: LOCKED_MODEL,
  dimensions: LOCKED_DIMENSIONS,
});

export class EmbeddingError extends Error {
  constructor(message, { code = 'EMBEDDING_UNAVAILABLE', statusCode = 503, cause } = {}) {
    super(message);
    this.name = 'EmbeddingError';
    this.code = code;
    this.statusCode = statusCode;
    if (cause) {
      this.cause = cause;
    }
  }
}

function safeEmbeddingError(message, options) {
  return new EmbeddingError(message, options);
}

function normalizeProvider(value = LOCKED_PROVIDER) {
  return String(value).trim().toLowerCase();
}

function normalizeModel(value = LOCKED_MODEL) {
  return String(value).trim();
}

function normalizeDimensions(value = LOCKED_DIMENSIONS) {
  const numeric = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw safeEmbeddingError('embedding dimensions must be a positive integer', {
      code: 'EMBEDDING_DIMENSIONS_INVALID',
      statusCode: 400,
    });
  }
  return numeric;
}

export function normalizeEmbeddingConfig(config = {}) {
  const provider = normalizeProvider(config.provider);
  const model = normalizeModel(config.model);
  const dimensions = normalizeDimensions(config.dimensions ?? config.expectedDimensions);
  const strict = config.strict === true;

  if (provider !== LOCKED_PROVIDER) {
    throw safeEmbeddingError('unsupported embedding provider for vector retrieval', {
      code: 'EMBEDDING_PROVIDER_UNSUPPORTED',
      statusCode: 400,
    });
  }
  if (model !== LOCKED_MODEL) {
    throw safeEmbeddingError('unsupported embedding model for vector retrieval', {
      code: 'EMBEDDING_MODEL_UNSUPPORTED',
      statusCode: 400,
    });
  }
  if (dimensions !== LOCKED_DIMENSIONS) {
    throw safeEmbeddingError('unsupported embedding dimensions for vector retrieval', {
      code: 'EMBEDDING_DIMENSIONS_UNSUPPORTED',
      statusCode: 400,
    });
  }

  return Object.freeze({ provider, model, dimensions, strict });
}

function normalizeLimit(value, fallback, fieldName) {
  const numeric = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw safeEmbeddingError(`${fieldName} must be a positive integer`, {
      code: 'EMBEDDING_LIMIT_INVALID',
      statusCode: 400,
    });
  }
  return numeric;
}

function nowMs() {
  return Number(globalThis.performance?.now?.() ?? Date.now());
}

function assertWithinDeadline(deadlineMs) {
  if (Number.isFinite(deadlineMs) && nowMs() > deadlineMs) {
    throw safeEmbeddingError('embedding operation timed out', {
      code: 'EMBEDDING_TIMEOUT',
      statusCode: 503,
    });
  }
}

async function withTimeout(operation, deadlineMs) {
  const remainingMs = Math.max(1, Math.floor(deadlineMs - nowMs()));
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(safeEmbeddingError('embedding operation timed out', {
        code: 'EMBEDDING_TIMEOUT',
        statusCode: 503,
      }));
    }, remainingMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeTextInput(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw safeEmbeddingError('embedding text is required', {
      code: 'EMBEDDING_TEXT_REQUIRED',
      statusCode: 400,
    });
  }
  return text;
}

function assertTextBudgets(texts, { maxTexts, maxCharactersPerText, maxTotalCharacters }) {
  if (!Array.isArray(texts)) {
    throw safeEmbeddingError('embedding texts must be an array', {
      code: 'EMBEDDING_BATCH_INVALID',
      statusCode: 400,
    });
  }
  if (texts.length === 0) {
    return;
  }
  if (texts.length > maxTexts) {
    throw safeEmbeddingError('embedding batch exceeds configured text limit', {
      code: 'EMBEDDING_BATCH_LIMIT_EXCEEDED',
      statusCode: 413,
    });
  }

  let totalCharacters = 0;
  for (const text of texts) {
    const normalized = normalizeTextInput(text);
    if (normalized.length > maxCharactersPerText) {
      throw safeEmbeddingError('embedding text exceeds configured character limit', {
        code: 'EMBEDDING_TEXT_LIMIT_EXCEEDED',
        statusCode: 413,
      });
    }
    totalCharacters += normalized.length;
  }
  if (totalCharacters > maxTotalCharacters) {
    throw safeEmbeddingError('embedding batch exceeds configured character budget', {
      code: 'EMBEDDING_TOTAL_LIMIT_EXCEEDED',
      statusCode: 413,
    });
  }
}

function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalizedFeatureText(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordTokens(text) {
  const normalized = normalizedFeatureText(text);
  return normalized === '' ? [] : normalized.split(' ').filter(Boolean);
}

function addFeature(vector, feature, weight) {
  const hash = fnv1a32(feature);
  const index = hash % vector.length;
  const sign = (hash & 0x80000000) === 0 ? 1 : -1;
  vector[index] += sign * weight;
}

function charNgrams(token, minN = 3, maxN = 5) {
  const bounded = `^${token}$`;
  const grams = [];
  for (let size = minN; size <= maxN; size += 1) {
    if (bounded.length < size) {
      continue;
    }
    for (let index = 0; index <= bounded.length - size; index += 1) {
      grams.push(bounded.slice(index, index + size));
    }
  }
  return grams;
}

function l2Normalize(vector) {
  let squaredSum = 0;
  for (const value of vector) {
    squaredSum += value * value;
  }
  if (squaredSum === 0) {
    vector[0] = 1;
    return vector;
  }
  const norm = Math.sqrt(squaredSum);
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = Number((vector[index] / norm).toFixed(8));
  }
  return vector;
}

function hashTextToVector(text, dimensions) {
  const vector = new Array(dimensions).fill(0);
  const tokens = wordTokens(text);
  if (tokens.length === 0) {
    return l2Normalize(vector);
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    addFeature(vector, `w:${token}`, 1.0);
    for (const gram of charNgrams(token)) {
      addFeature(vector, `c:${gram}`, 0.35);
    }
    if (index + 1 < tokens.length) {
      addFeature(vector, `b:${token}_${tokens[index + 1]}`, 0.85);
    }
    if (index + 2 < tokens.length) {
      addFeature(vector, `t:${token}_${tokens[index + 1]}_${tokens[index + 2]}`, 0.55);
    }
  }

  return l2Normalize(vector);
}

function assertVectorDimensions(vector, expectedDimensions) {
  if (!Array.isArray(vector) || vector.length !== expectedDimensions || vector.some((value) => !Number.isFinite(Number(value)))) {
    throw safeEmbeddingError('embedding provider returned invalid vector dimensions', {
      code: 'EMBEDDING_DIMENSION_MISMATCH',
      statusCode: 503,
    });
  }
}

function normalizeEmbeddingResult(result, { expectedProvider, expectedModel, expectedDimensions }) {
  const vector = result?.vector;
  assertVectorDimensions(vector, expectedDimensions);
  const provider = normalizeProvider(result?.provider ?? expectedProvider);
  const model = normalizeModel(result?.model ?? expectedModel);
  const dimensions = normalizeDimensions(result?.dimensions ?? vector.length);
  if (provider !== expectedProvider || model !== expectedModel || dimensions !== expectedDimensions) {
    throw safeEmbeddingError('embedding provider returned unsupported metadata', {
      code: 'EMBEDDING_METADATA_MISMATCH',
      statusCode: 503,
    });
  }
  return Object.freeze({
    vector: vector.map((value) => Number(value)),
    provider,
    model,
    dimensions,
  });
}

function wrapEmbeddingProvider(rawProvider, options) {
  if (!rawProvider || typeof rawProvider.embedText !== 'function') {
    throw safeEmbeddingError('embedding provider must implement embedText', {
      code: 'EMBEDDING_PROVIDER_INVALID',
      statusCode: 400,
    });
  }

  const requestedProvider = typeof options.provider === 'string' ? options.provider : undefined;
  const config = normalizeEmbeddingConfig({
    provider: options.providerName ?? requestedProvider ?? rawProvider.provider ?? LOCKED_PROVIDER,
    model: options.model ?? rawProvider.model ?? LOCKED_MODEL,
    dimensions: options.expectedDimensions ?? options.dimensions ?? rawProvider.dimensions ?? LOCKED_DIMENSIONS,
    strict: options.strict,
  });
  const timeoutMs = normalizeLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS, 'embedding timeout');
  const maxTexts = normalizeLimit(options.maxTexts, DEFAULT_MAX_TEXTS, 'embedding maxTexts');
  const maxCharactersPerText = normalizeLimit(
    options.maxCharactersPerText ?? options.maxCharacters,
    DEFAULT_MAX_CHARACTERS_PER_TEXT,
    'embedding maxCharactersPerText',
  );
  const maxTotalCharacters = normalizeLimit(options.maxTotalCharacters, DEFAULT_MAX_TOTAL_CHARACTERS, 'embedding maxTotalCharacters');

  async function embedText(text, callOptions = {}) {
    const deadlineMs = nowMs() + normalizeLimit(callOptions.timeoutMs, timeoutMs, 'embedding timeout');
    const effectiveMaxCharactersPerText = normalizeLimit(
      callOptions.maxCharactersPerText ?? callOptions.maxCharacters,
      maxCharactersPerText,
      'embedding maxCharactersPerText',
    );
    const effectiveMaxTotalCharacters = normalizeLimit(callOptions.maxTotalCharacters, maxTotalCharacters, 'embedding maxTotalCharacters');
    assertTextBudgets([text], {
      maxTexts: 1,
      maxCharactersPerText: effectiveMaxCharactersPerText,
      maxTotalCharacters: effectiveMaxTotalCharacters,
    });
    assertWithinDeadline(deadlineMs);
    try {
      const result = await withTimeout(rawProvider.embedText(text, callOptions), deadlineMs);
      assertWithinDeadline(deadlineMs);
      return normalizeEmbeddingResult(result, {
        expectedProvider: config.provider,
        expectedModel: config.model,
        expectedDimensions: config.dimensions,
      });
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }
      throw safeEmbeddingError('embedding provider failed', {
        code: error?.code && String(error.code).startsWith('EMBEDDING_') ? error.code : 'EMBEDDING_PROVIDER_FAILED',
        statusCode: error?.statusCode ?? 503,
      });
    }
  }

  async function embedTexts(texts, callOptions = {}) {
    const deadlineMs = nowMs() + normalizeLimit(callOptions.timeoutMs, timeoutMs, 'embedding timeout');
    const effectiveMaxTexts = normalizeLimit(callOptions.maxTexts, maxTexts, 'embedding maxTexts');
    const effectiveMaxCharactersPerText = normalizeLimit(
      callOptions.maxCharactersPerText ?? callOptions.maxCharacters,
      maxCharactersPerText,
      'embedding maxCharactersPerText',
    );
    const effectiveMaxTotalCharacters = normalizeLimit(callOptions.maxTotalCharacters, maxTotalCharacters, 'embedding maxTotalCharacters');
    assertTextBudgets(texts, {
      maxTexts: effectiveMaxTexts,
      maxCharactersPerText: effectiveMaxCharactersPerText,
      maxTotalCharacters: effectiveMaxTotalCharacters,
    });
    assertWithinDeadline(deadlineMs);
    if (texts.length === 0) {
      return [];
    }
    if (typeof rawProvider.embedTexts === 'function') {
      try {
        const results = await withTimeout(rawProvider.embedTexts(texts, callOptions), deadlineMs);
        assertWithinDeadline(deadlineMs);
        if (!Array.isArray(results) || results.length !== texts.length) {
          throw safeEmbeddingError('embedding provider returned invalid batch result', {
            code: 'EMBEDDING_BATCH_RESULT_INVALID',
            statusCode: 503,
          });
        }
        return results.map((result) => normalizeEmbeddingResult(result, {
          expectedProvider: config.provider,
          expectedModel: config.model,
          expectedDimensions: config.dimensions,
        }));
      } catch (error) {
        if (error instanceof EmbeddingError) {
          throw error;
        }
        throw safeEmbeddingError('embedding provider failed', {
          code: error?.code && String(error.code).startsWith('EMBEDDING_') ? error.code : 'EMBEDDING_PROVIDER_FAILED',
          statusCode: error?.statusCode ?? 503,
        });
      }
    }

    const results = [];
    for (const text of texts) {
      assertWithinDeadline(deadlineMs);
      results.push(await embedText(text, { ...callOptions, timeoutMs: Math.max(1, Math.floor(deadlineMs - nowMs())) }));
    }
    return results;
  }

  return Object.freeze({
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    strict: config.strict,
    embedText,
    embedTexts,
    metadata: () => ({ provider: config.provider, model: config.model, dimensions: config.dimensions }),
  });
}

export function createLocalHashingEmbeddingProvider(options = {}) {
  const config = normalizeEmbeddingConfig(options);
  const localProvider = {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    async embedText(text) {
      normalizeTextInput(text);
      return {
        vector: hashTextToVector(text, config.dimensions),
        provider: config.provider,
        model: config.model,
        dimensions: config.dimensions,
      };
    },
    async embedTexts(texts) {
      return texts.map((text) => {
        normalizeTextInput(text);
        return {
          vector: hashTextToVector(text, config.dimensions),
          provider: config.provider,
          model: config.model,
          dimensions: config.dimensions,
        };
      });
    },
  };
  return wrapEmbeddingProvider(localProvider, { ...options, ...config });
}

export function createEmbeddingProvider(options = {}) {
  if (options.provider && typeof options.provider === 'object') {
    return wrapEmbeddingProvider(options.provider, options);
  }
  return createLocalHashingEmbeddingProvider(options.embedding ?? options);
}
