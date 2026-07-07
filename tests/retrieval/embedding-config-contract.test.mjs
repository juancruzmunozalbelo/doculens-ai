import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function pathToFileHref(modulePath) {
  return new URL(`file://${modulePath}`).href;
}

async function importRequired(relativePath, exportNames, purpose) {
  const modulePath = path.join(repoRoot, relativePath);
  try {
    const module = await import(`${pathToFileHref(modulePath)}?case=${encodeURIComponent(purpose)}`);
    for (const exportName of exportNames) {
      assert.equal(
        typeof module[exportName],
        'function',
        `${purpose} must export function ${exportName} from ${relativePath}`,
      );
    }
    return module;
  } catch (error) {
    assert.fail(`${purpose} is not implemented at ${relativePath}: ${error.message}`);
  }
}

function baseEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    DOCULENS_ALLOW_WEAK_JWT_SECRET: 'true',
    DATABASE_URL: 'postgresql://doculens_test:doculens_test@localhost:5432/doculens_test',
    AI_PROVIDER: 'minimax',
    MINIMAX_API_KEY: 'minimax-chat-key-still-required-for-answer-generation',
    MINIMAX_BASE_URL: 'https://api.minimax.io/v1',
    MINIMAX_MODEL: 'MiniMax-M3',
    JWT_SECRET: 'test-only-jwt-secret',
    RETRIEVAL_BACKEND: 'hybrid',
    EMBEDDING_PROVIDER: 'local_hashing',
    EMBEDDING_MODEL: 'doculens-local-hashing-v1',
    EMBEDDING_DIMENSIONS: '384',
    EMBEDDING_STRICT: 'false',
    ...overrides,
  };
}

test('server config accepts only the locked local-hashing vector retrieval contract without embedding provider credentials', async (t) => {
  const { loadServerConfigSync } = await importRequired(
    'apps/api/src/server/config/env.mjs',
    ['loadServerConfigSync'],
    'vector retrieval environment loader',
  );

  const acceptedBackends = ['lexical_fallback', 'pgvector', 'hybrid'];
  for (const backend of acceptedBackends) {
    await t.test(`${backend} backend`, () => {
      const config = loadServerConfigSync(baseEnv({
        RETRIEVAL_BACKEND: backend,
        EMBEDDING_STRICT: backend === 'lexical_fallback' ? 'false' : 'true',
      }));

      assert.equal(config.retrievalBackend, backend, 'top-level compatibility field must preserve the configured retrieval backend');
      assert.equal(config.retrieval.configuredBackend, backend, 'retrieval config must expose the operator-configured backend');
      assert.equal(config.retrieval.embedding.provider, 'local_hashing', 'only the no-cost local hashing provider is accepted for this change');
      assert.equal(config.retrieval.embedding.model, 'doculens-local-hashing-v1', 'the selected local hashing model must be explicit');
      assert.equal(config.retrieval.embedding.dimensions, 384, 'embedding dimensions must match the pgvector migration shape');
      assert.equal(
        Object.hasOwn(config.retrieval.embedding, 'apiKey'),
        false,
        'local hashing embeddings must not add or require a provider credential field',
      );
      assert.equal(
        config.retrieval.embedding.strict,
        backend === 'lexical_fallback' ? false : true,
        'EMBEDDING_STRICT must be parsed as a boolean operational mode rather than a string',
      );
    });
  }
});

test('server config fails closed for unsupported retrieval backend, embedding provider, model, dimensions, or strict mode', async (t) => {
  const { loadServerConfigSync } = await importRequired(
    'apps/api/src/server/config/env.mjs',
    ['loadServerConfigSync'],
    'vector retrieval environment validation',
  );

  const cases = [
    {
      name: 'unsupported retrieval backend',
      env: { RETRIEVAL_BACKEND: 'semantic_theater' },
      error: /RETRIEVAL_BACKEND.*(?:lexical_fallback|pgvector|hybrid)/i,
    },
    {
      name: 'unsupported embedding provider',
      env: { EMBEDDING_PROVIDER: 'minimax' },
      error: /unsupported embedding provider|EMBEDDING_PROVIDER/i,
    },
    {
      name: 'unsupported embedding model',
      env: { EMBEDDING_MODEL: 'doculens-local-hashing-v2' },
      error: /unsupported embedding model|EMBEDDING_MODEL/i,
    },
    {
      name: 'non-384 embedding dimension',
      env: { EMBEDDING_DIMENSIONS: '768' },
      error: /unsupported embedding dimensions|EMBEDDING_DIMENSIONS/i,
    },
    {
      name: 'non-integer embedding dimension',
      env: { EMBEDDING_DIMENSIONS: '384.5' },
      error: /EMBEDDING_DIMENSIONS.*(?:positive integer|384)|unsupported embedding dimensions/i,
    },
    {
      name: 'invalid strict mode',
      env: { EMBEDDING_STRICT: 'sometimes' },
      error: /EMBEDDING_STRICT.*(?:true|false)/i,
    },
  ];

  for (const currentCase of cases) {
    await t.test(currentCase.name, () => {
      assert.throws(
        () => loadServerConfigSync(baseEnv(currentCase.env)),
        currentCase.error,
        `${currentCase.name} must fail before startup can claim pgvector or hybrid retrieval`,
      );
    });
  }
});
