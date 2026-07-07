import {
  EMBEDDING_CONTRACT,
  normalizeEmbeddingConfig,
} from '../embeddings/provider.mjs';

const DEFAULT_MINIMAX_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MINIMAX_MODEL = 'MiniMax-M3';
const ALLOWED_PROVIDERS = new Set(['minimax']);
const ALLOWED_RETRIEVAL_BACKENDS = new Set(['lexical_fallback', 'pgvector', 'hybrid']);
const VECTOR_RETRIEVAL_BACKENDS = new Set(['pgvector', 'hybrid']);
const WEAK_JWT_SECRETS = new Set([
  '',
  'secret',
  'password',
  'changeme',
  'change_me',
  'default',
  'jwt_secret',
  'your_jwt_secret',
  'doculens',
  'development',
  'test',
]);

function requireString(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function normalizeDatabaseUrl(value) {
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return value;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  throw new Error('EMBEDDING_STRICT must be true or false');
}

function normalizePositiveIntegerEnv(env, key, fallback) {
  const value = env[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return numeric;
}

function normalizeRetrievalBackend(value) {
  const backend = String(value || 'lexical_fallback').trim().toLowerCase();
  if (!ALLOWED_RETRIEVAL_BACKENDS.has(backend)) {
    throw new Error('RETRIEVAL_BACKEND must be one of: lexical_fallback, pgvector, hybrid');
  }
  return backend;
}

function buildRetrievalConfig(env) {
  const configuredBackend = normalizeRetrievalBackend(env.RETRIEVAL_BACKEND);
  const vectorEnabled = VECTOR_RETRIEVAL_BACKENDS.has(configuredBackend);
  const embedding = normalizeEmbeddingConfig({
    provider: env.EMBEDDING_PROVIDER || EMBEDDING_CONTRACT.provider,
    model: env.EMBEDDING_MODEL || EMBEDDING_CONTRACT.model,
    dimensions: normalizePositiveIntegerEnv(env, 'EMBEDDING_DIMENSIONS', EMBEDDING_CONTRACT.dimensions),
    strict: normalizeBoolean(env.EMBEDDING_STRICT, false),
  });

  return Object.freeze({
    configuredBackend,
    effectiveBackend: configuredBackend === 'lexical_fallback' ? 'lexical_fallback' : 'lexical_fallback',
    backendFallbackReason: configuredBackend === 'lexical_fallback' ? 'retrieval_disabled' : 'preferred_backend_unavailable',
    vectorEnabled,
    embedding,
  });
}

function isExplicitWeakSecretTestMode(env) {
  return env.NODE_ENV === 'test' && env.DOCULENS_ALLOW_WEAK_JWT_SECRET === 'true';
}

function assertStrongJwtSecret(jwtSecret, env) {
  const normalized = jwtSecret.trim().toLowerCase();
  const looksLikePlaceholder = /^(?:<[^>]+>|change[_-]?me|your[_-]?jwt|jwt[_-]?secret)/i.test(jwtSecret.trim());
  const hasEnoughEntropyForRuntime = jwtSecret.length >= 32 && /[a-z]/.test(jwtSecret) && /[A-Z]/.test(jwtSecret) && /\d/.test(jwtSecret);

  if (isExplicitWeakSecretTestMode(env)) {
    return;
  }

  if (WEAK_JWT_SECRETS.has(normalized) || looksLikePlaceholder || !hasEnoughEntropyForRuntime) {
    throw new Error('JWT_SECRET is weak, default, or insecure outside explicit test mode');
  }
}

function buildServerConfig(env = process.env) {
  const databaseUrl = normalizeDatabaseUrl(requireString(env, 'DATABASE_URL'));
  const aiProvider = requireString(env, 'AI_PROVIDER').toLowerCase();
  if (!ALLOWED_PROVIDERS.has(aiProvider)) {
    throw new Error(`AI_PROVIDER must be one of: ${Array.from(ALLOWED_PROVIDERS).join(', ')}`);
  }

  const jwtSecret = requireString(env, 'JWT_SECRET');
  assertStrongJwtSecret(jwtSecret, env);

  const minimaxApiKey = requireString(env, 'MINIMAX_API_KEY');
  const minimaxBaseUrl = (env.MINIMAX_BASE_URL || DEFAULT_MINIMAX_BASE_URL).trim();
  const minimaxModel = (env.MINIMAX_MODEL || DEFAULT_MINIMAX_MODEL).trim();
  if (!/^https:\/\//i.test(minimaxBaseUrl)) {
    throw new Error('MINIMAX_BASE_URL must be an HTTPS URL');
  }
  if (minimaxModel !== DEFAULT_MINIMAX_MODEL) {
    throw new Error(`MINIMAX_MODEL must be ${DEFAULT_MINIMAX_MODEL} for the assessment contract`);
  }

  const retrieval = buildRetrievalConfig(env);

  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    databaseUrl,
    jwtSecret,
    aiProvider,
    retrievalBackend: retrieval.configuredBackend,
    retrieval,
    minimax: Object.freeze({
      apiKey: minimaxApiKey,
      baseUrl: minimaxBaseUrl,
      model: minimaxModel,
    }),
  });
}

export async function loadServerConfig(env = process.env) {
  return buildServerConfig(env);
}

export function loadServerConfigSync(env = process.env) {
  return buildServerConfig(env);
}

export const loadConfig = loadServerConfig;
