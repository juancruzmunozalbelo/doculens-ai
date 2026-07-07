import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEXT_CANARY = 'RAW_EMBEDDING_TEXT_CANARY: reviewer document text must not leak';
const VECTOR_CANARY = 0.123456789;

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

function vectorNorm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function assertSafeEmbeddingError(error) {
  const serialized = JSON.stringify({
    message: error?.message,
    code: error?.code,
    metadata: error?.metadata,
    cause: error?.cause && { message: error.cause.message, code: error.cause.code, metadata: error.cause.metadata },
  });
  assert.doesNotMatch(serialized, /RAW_EMBEDDING_TEXT_CANARY|reviewer document text must not leak/i, 'embedding errors must not leak raw input text');
  assert.doesNotMatch(serialized, /0\.123456789|\[\s*0\.123456789/i, 'embedding errors must not leak raw vectors or provider payloads');
}

test('local hashing embeddings are deterministic, 384-dimensional, and L2-normalized without network/provider secrets', async () => {
  const { createLocalHashingEmbeddingProvider } = await importRequired(
    'apps/api/src/server/embeddings/provider.mjs',
    ['createLocalHashingEmbeddingProvider'],
    'local hashing embedding provider',
  );

  const provider = createLocalHashingEmbeddingProvider({ dimensions: 384 });
  const first = await provider.embedText('Payment terms require invoices to be paid within thirty days.');
  const second = await provider.embedText('Payment terms require invoices to be paid within thirty days.');
  const normalizedEquivalent = await provider.embedText(' payment   TERMS require invoices to be paid within thirty days. ');

  assert.equal(first.provider, 'local_hashing', 'embedding metadata must identify the no-cost local provider');
  assert.equal(first.model, 'doculens-local-hashing-v1', 'embedding metadata must identify the locked local model');
  assert.equal(first.dimensions, 384, 'embedding metadata dimensions must match the pgvector column shape');
  assert.equal(first.vector.length, 384, 'local hashing vectors must have the locked migration dimension');
  assert.ok(first.vector.every((value) => Number.isFinite(value)), 'embedding vectors must contain only finite numeric components');
  assert.ok(Math.abs(vectorNorm(first.vector) - 1) < 1e-6, 'non-empty local hashing vectors must be L2-normalized');
  assert.deepEqual(second.vector, first.vector, 'embedding the same text twice must produce byte-stable deterministic vectors');
  assert.deepEqual(
    normalizedEquivalent.vector,
    first.vector,
    'local hashing must normalize casing and whitespace before feature hashing so ingestion/query drift does not change vectors',
  );
});

test('embedTexts batches inputs in order and enforces text-count and character budgets before provider work', async () => {
  const { createEmbeddingProvider, createLocalHashingEmbeddingProvider } = await importRequired(
    'apps/api/src/server/embeddings/provider.mjs',
    ['createEmbeddingProvider', 'createLocalHashingEmbeddingProvider'],
    'bounded embedding provider wrapper',
  );

  const inner = createLocalHashingEmbeddingProvider({ dimensions: 384 });
  const provider = createEmbeddingProvider({ provider: inner, providerName: 'local_hashing', expectedDimensions: 384, maxTexts: 2, maxCharacters: 64 });
  const batch = await provider.embedTexts([
    'Alpha renewal obligations are due in April.',
    'Beta termination obligations survive for two years.',
  ]);

  assert.equal(batch.length, 2, 'embedTexts must return one embedding result per input text');
  assert.deepEqual(
    batch[0],
    await provider.embedText('Alpha renewal obligations are due in April.'),
    'the first batch result must match embedText for the first input',
  );
  assert.deepEqual(
    batch[1],
    await provider.embedText('Beta termination obligations survive for two years.'),
    'the second batch result must match embedText for the second input',
  );

  await assert.rejects(
    () => provider.embedTexts(['one', 'two', 'three']),
    (error) => {
      assert.match(error.code ?? error.message, /EMBEDDING_TEXT_LIMIT|EMBEDDING_BATCH_LIMIT|MAX_TEXT/i, 'too many texts must produce a safe budget error code');
      assertSafeEmbeddingError(error);
      return true;
    },
    'embedTexts must fail closed before processing more texts than the configured batch budget',
  );

  await assert.rejects(
    () => provider.embedText(`${TEXT_CANARY} ${'x'.repeat(80)}`),
    (error) => {
      assert.match(error.code ?? error.message, /EMBEDDING_TEXT_LIMIT|MAX_CHAR/i, 'oversized text must produce a safe text-budget error code');
      assertSafeEmbeddingError(error);
      return true;
    },
    'embedding must reject text that exceeds the synchronous character budget',
  );
});

test('embedding wrapper rejects provider-returned dimension mismatches and redacts unsafe provider payloads', async () => {
  const { createEmbeddingProvider } = await importRequired(
    'apps/api/src/server/embeddings/provider.mjs',
    ['createEmbeddingProvider'],
    'embedding provider validation wrapper',
  );

  const fakeProvider = {
    async embedText() {
      return {
        vector: [VECTOR_CANARY, VECTOR_CANARY],
        provider: 'local_hashing',
        model: 'doculens-local-hashing-v1',
        dimensions: 2,
      };
    },
    async embedTexts(texts) {
      return Promise.all(texts.map((text) => this.embedText(text)));
    },
  };
  const provider = createEmbeddingProvider({ provider: fakeProvider, providerName: 'local_hashing', expectedDimensions: 384, timeoutMs: 1000 });

  await assert.rejects(
    () => provider.embedText(TEXT_CANARY),
    (error) => {
      assert.match(error.code ?? error.message, /EMBEDDING_DIMENSION|DIMENSION_MISMATCH/i, 'dimension mismatch must use a machine-readable safe code');
      assertSafeEmbeddingError(error);
      return true;
    },
    'provider-returned vectors whose length does not match the configured dimension must not be stored or queried',
  );
});

test('embedding wrapper converts provider latency past the configured deadline into redaction-safe timeout failures', async () => {
  const { createEmbeddingProvider } = await importRequired(
    'apps/api/src/server/embeddings/provider.mjs',
    ['createEmbeddingProvider'],
    'embedding timeout wrapper',
  );

  const slowProvider = {
    async embedText() {
      const stopAt = performance.now() + 20;
      while (performance.now() < stopAt) {
        // Busy loop only inside this fake provider so the wrapper can observe that the deadline elapsed.
      }
      return {
        vector: Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0)),
        provider: 'local_hashing',
        model: 'doculens-local-hashing-v1',
        dimensions: 384,
      };
    },
  };
  const provider = createEmbeddingProvider({ provider: slowProvider, providerName: 'local_hashing', expectedDimensions: 384, timeoutMs: 1 });

  await assert.rejects(
    () => provider.embedText(TEXT_CANARY),
    (error) => {
      assert.match(error.code ?? error.message, /EMBEDDING_TIMEOUT|TIMEOUT/i, 'provider timeout must surface as a safe embedding timeout code');
      assertSafeEmbeddingError(error);
      return true;
    },
    'embedding calls must fail closed when the provider exceeds the configured timeout',
  );
});
