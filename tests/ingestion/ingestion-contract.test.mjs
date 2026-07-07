import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assessmentFixtureText = readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/full-stack-ai-engineer-assessment.txt'), 'utf8');
const assessmentManifest = JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/manifest.json'), 'utf8'));
const owner = Object.freeze({ id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com' });
const intruder = Object.freeze({ id: '22222222-2222-4222-8222-222222222222', email: 'intruder@example.com' });

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

function pathToFileHref(modulePath) {
  return new URL(`file://${modulePath}`).href;
}

function createRecordingDocumentRepository() {
  const rows = new Map();
  const createdPayloads = [];
  const deletedDocumentIds = [];
  const failedDocumentIds = [];

  return {
    createdPayloads,
    deletedDocumentIds,
    failedDocumentIds,
    async createForUser({ userId, title, content, status = 'ready' }) {
      const row = {
        id: `doc-${rows.size + 1}`,
        userId,
        title,
        content,
        sourceType: 'markdown',
        status,
        contentSha256: `sha-${rows.size + 1}`,
        tokenEstimate: content.split(/\s+/).filter(Boolean).length,
        metadata: {},
        createdAt: '2026-07-07T12:00:00.000Z',
        updatedAt: '2026-07-07T12:00:00.000Z',
      };
      createdPayloads.push({ userId, title, content, status });
      rows.set(row.id, row);
      return row;
    },
    async listForUser({ userId }) {
      return [...rows.values()].filter((row) => row.userId === userId && row.status !== 'failed');
    },
    async findByIdForUser({ documentId, userId }) {
      const row = rows.get(documentId);
      return row && row.userId === userId && row.status !== 'failed' ? row : null;
    },
    async deleteByIdForUser({ documentId, userId }) {
      const row = rows.get(documentId);
      if (!row || row.userId !== userId) {
        return false;
      }
      rows.delete(documentId);
      deletedDocumentIds.push(documentId);
      return true;
    },
    async markFailedForUser({ documentId, userId, reason }) {
      const row = rows.get(documentId);
      if (!row || row.userId !== userId) {
        return null;
      }
      row.status = 'failed';
      row.failureReason = reason;
      row.updatedAt = '2026-07-07T12:01:00.000Z';
      failedDocumentIds.push(documentId);
      return row;
    },
    unsafeGet(documentId) {
      return rows.get(documentId) ?? null;
    },
  };
}

function createRecordingChunkRepository({ failAfterFirstWrite = false } = {}) {
  const rows = new Map();
  const writes = [];

  return {
    writes,
    async createManyForDocument({ documentId, userId, chunks }) {
      writes.push({ documentId, userId, chunks });
      const existing = rows.get(documentId) ?? [];
      const seen = new Set(existing.map((chunk) => chunk.chunkId));
      const nextRows = [];
      for (const chunk of chunks) {
        if (seen.has(chunk.chunkId)) {
          throw new Error(`duplicate chunk id ${chunk.chunkId} for document ${documentId}`);
        }
        seen.add(chunk.chunkId);
        const row = { ...chunk, documentId, userId };
        nextRows.push(row);
        if (failAfterFirstWrite) {
          rows.set(documentId, existing.concat(row));
          throw new Error('chunk write failed after partial insert');
        }
      }
      rows.set(documentId, existing.concat(nextRows));
      return nextRows;
    },
    async listForDocumentForUser({ documentId, userId }) {
      return (rows.get(documentId) ?? []).filter((chunk) => chunk.userId === userId);
    },
    async deleteForDocument({ documentId }) {
      rows.delete(documentId);
    },
    unsafeRows(documentId) {
      return rows.get(documentId) ?? [];
    },
  };
}

test('Markdown/text normalization preserves headings while removing ingestion-hostile whitespace drift', async () => {
  const { normalizeDocumentText } = await importRequired(
    'apps/api/src/server/ingestion/normalization.mjs',
    ['normalizeDocumentText'],
    'Markdown/text normalization',
  );

  const raw = '\uFEFF# Services Agreement\r\n\r\nScope line with trailing spaces   \r\n\r\n\r\n## Fees\rFee line\t \r\n';

  assert.equal(
    normalizeDocumentText(raw),
    '# Services Agreement\n\nScope line with trailing spaces\n\n## Fees\nFee line',
    'normalization should strip BOM, normalize CRLF/CR to LF, trim line-end whitespace, collapse blank runs, and trim file edges',
  );
});

test('section-aware chunking emits deterministic owner-independent metadata for headings, indexes, stable IDs, and token estimates', async () => {
  const { normalizeDocumentText } = await importRequired(
    'apps/api/src/server/ingestion/normalization.mjs',
    ['normalizeDocumentText'],
    'Markdown/text normalization for chunk input',
  );
  const { chunkDocument } = await importRequired(
    'apps/api/src/server/ingestion/chunking.mjs',
    ['chunkDocument'],
    'Section-aware chunking',
  );

  const normalized = normalizeDocumentText(`# Master Services Agreement

Intro paragraph that belongs to the root section.

## Fees

Fees are due within thirty days of invoice receipt. Late fees accrue monthly.

## Termination

Either party may terminate after uncured material breach.`);

  const first = chunkDocument({ documentId: 'doc-alpha', content: normalized, maxTokens: 18 });
  const second = chunkDocument({ documentId: 'doc-alpha', content: normalized, maxTokens: 18 });
  const otherDocument = chunkDocument({ documentId: 'doc-beta', content: normalized, maxTokens: 18 });

  assert.ok(first.length >= 3, 'root, Fees, and Termination sections should produce traceable chunks');
  assert.deepEqual(first.map((chunk) => chunk.chunkIndex), first.map((_, index) => index), 'chunk indexes must be zero-based and ordered');
  assert.deepEqual(first.map((chunk) => chunk.chunkId), second.map((chunk) => chunk.chunkId), 'chunk IDs must be stable for the same document/content');
  assert.notDeepEqual(first.map((chunk) => chunk.chunkId), otherDocument.map((chunk) => chunk.chunkId), 'stable chunk IDs must be scoped by document to avoid cross-document collisions');
  assert.deepEqual(
    first.map((chunk) => chunk.headingPath),
    [
      ['Master Services Agreement'],
      ['Master Services Agreement', 'Fees'],
      ['Master Services Agreement', 'Termination'],
    ],
    'heading paths must preserve Markdown section ancestry for retrieval display and citations',
  );
  assert.ok(
    first.every((chunk) => Number.isInteger(chunk.tokenEstimate) && chunk.tokenEstimate > 0 && chunk.tokenEstimate <= 18),
    'each emitted chunk must carry a positive bounded token estimate',
  );
});

test('assessment extracted-text fixture normalizes and chunks into the committed golden-path structure', async () => {
  const { normalizeDocumentText } = await importRequired(
    'apps/api/src/server/ingestion/normalization.mjs',
    ['normalizeDocumentText'],
    'Markdown/text normalization for assessment fixture',
  );
  const { chunkDocument } = await importRequired(
    'apps/api/src/server/ingestion/chunking.mjs',
    ['chunkDocument'],
    'Section-aware chunking for assessment fixture',
  );

  const expectedTextSha = assessmentManifest.files.extractedText.sha256;
  const actualTextSha = createHash('sha256').update(assessmentFixtureText).digest('hex');
  assert.equal(actualTextSha, expectedTextSha, 'extracted assessment fixture text must match the manifest checksum used by provider/retrieval tests');

  const normalized = normalizeDocumentText(assessmentFixtureText);
  const chunks = chunkDocument({ documentId: 'doc-full-stack-ai-assessment-fixture', content: normalized });
  assert.ok(chunks.length >= assessmentManifest.chunkingExpectations.minimumChunkCount, 'assessment fixture must produce enough retrievable chunks for golden questions');
  assert.ok(
    chunks.reduce((sum, chunk) => sum + chunk.tokenEstimate, 0) >= assessmentManifest.chunkingExpectations.minimumTokenEstimate,
    'assessment fixture chunks must retain the expected amount of reviewer-visible content',
  );

  const headingPaths = chunks.map((chunk) => chunk.headingPath);
  for (const expectedHeading of assessmentManifest.chunkingExpectations.expectedHeadingPaths) {
    assert.ok(
      headingPaths.some((actualHeading) => JSON.stringify(actualHeading) === JSON.stringify(expectedHeading)),
      `assessment fixture chunks must include heading path ${expectedHeading.join(' > ')}`,
    );
  }
  for (const snippet of assessmentManifest.pageTextSnippets) {
    assert.match(
      chunks.map((chunk) => `${chunk.headingPath.join(' ')}\n${chunk.content ?? chunk.contentExcerpt ?? ''}`).join('\n'),
      new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `assessment fixture chunks must expose snippet: ${snippet}`,
    );
  }
});

test('document create pipeline normalizes content, persists chunks, and lists only owner-authorized chunk metadata', async () => {
  const { createDocumentService } = await importRequired(
    'apps/api/src/server/documents/service.mjs',
    ['createDocumentService'],
    'Document service ingestion pipeline',
  );

  const documents = createRecordingDocumentRepository();
  const chunks = createRecordingChunkRepository();
  const service = createDocumentService({
    documents,
    chunks,
    ingestion: {
      normalize: (content) => content.replace(/\r\n?/g, '\n').replace(/[\t ]+$/gm, '').trim(),
      chunk: ({ documentId, content }) => [
        {
          chunkId: `${documentId}:000`,
          chunkIndex: 0,
          headingPath: ['Services Agreement'],
          content,
          tokenEstimate: content.split(/\s+/).filter(Boolean).length,
        },
      ],
    },
  });

  const created = await service.createDocument({
    currentUser: owner,
    title: '  Services Agreement  ',
    content: '# Services Agreement\r\n\r\nPayment terms   \r\n',
  });
  const listedChunks = await service.listChunks({ currentUser: owner, documentId: created.id });

  assert.equal(documents.createdPayloads[0].content, '# Services Agreement\n\nPayment terms', 'documents must store normalized content, not raw submitted bytes');
  assert.equal(chunks.writes.length, 1, 'document creation must persist chunks in the same ingestion flow');
  assert.equal(chunks.writes[0].documentId, created.id, 'persisted chunks must be linked to the created document');
  assert.equal(chunks.writes[0].userId, owner.id, 'chunk writes must be scoped by current owner');
  assert.deepEqual(
    listedChunks.map(({ chunkId, headingPath, chunkIndex, tokenEstimate }) => ({ chunkId, headingPath, chunkIndex, tokenEstimate })),
    [
      {
        chunkId: `${created.id}:000`,
        headingPath: ['Services Agreement'],
        chunkIndex: 0,
        tokenEstimate: 5,
      },
    ],
    'retrieved chunks should expose stable ID, heading path, index, and token estimate only after owner authorization',
  );
  await assert.rejects(
    service.listChunks({ currentUser: intruder, documentId: created.id }),
    /Document not found|Forbidden/,
    'cross-owner chunk reads must fail through parent document ownership before exposing chunk content',
  );
});

test('failed chunk persistence leaves no partially retrievable chunks and either rolls back or marks the document failed', async () => {
  const { createDocumentService } = await importRequired(
    'apps/api/src/server/documents/service.mjs',
    ['createDocumentService'],
    'Document service failed-ingestion behavior',
  );

  const documents = createRecordingDocumentRepository();
  const chunks = createRecordingChunkRepository({ failAfterFirstWrite: true });
  const service = createDocumentService({
    documents,
    chunks,
    ingestion: {
      normalize: (content) => content.trim(),
      chunk: ({ documentId, content }) => [
        { chunkId: `${documentId}:000`, chunkIndex: 0, headingPath: ['Root'], content, tokenEstimate: 3 },
        { chunkId: `${documentId}:001`, chunkIndex: 1, headingPath: ['Root', 'Later'], content: 'later text', tokenEstimate: 2 },
      ],
    },
  });

  await assert.rejects(
    service.createDocument({ currentUser: owner, title: 'Rollback NDA', content: '# Root\n\nbody' }),
    /chunk write failed|ingestion failed/i,
    'a chunk persistence failure must surface as a failed document ingestion',
  );

  const createdId = documents.createdPayloads.length === 0 ? null : 'doc-1';
  if (createdId) {
    assert.deepEqual(chunks.unsafeRows(createdId), [], 'partial chunk rows must be rolled back or deleted after ingestion failure');
    const row = documents.unsafeGet(createdId);
    assert.ok(row === null || row.status === 'failed', 'failed ingestion must not leave a ready document with missing or partial chunks');
  }
});

test('chunk persistence contract rejects duplicate stable IDs, orphan documents, and cross-owner writes before retrieval can expose data', async () => {
  const { createInMemoryChunkRepository } = await importRequired(
    'apps/api/src/server/ingestion/chunk-repository.mjs',
    ['createInMemoryChunkRepository'],
    'Chunk repository integrity contract',
  );

  const documents = {
    async findByIdForUser({ documentId, userId }) {
      if (documentId === 'doc-owned' && userId === owner.id) {
        return { id: 'doc-owned', userId: owner.id, status: 'ready' };
      }
      if (documentId === 'doc-intruder' && userId === intruder.id) {
        return { id: 'doc-intruder', userId: intruder.id, status: 'ready' };
      }
      return null;
    },
  };
  const repository = createInMemoryChunkRepository({ documents });
  const chunk = { chunkId: 'stable-000', chunkIndex: 0, headingPath: ['Root'], content: 'owned text', tokenEstimate: 2 };

  await assert.rejects(
    repository.createManyForDocument({ documentId: 'missing-doc', userId: owner.id, chunks: [chunk] }),
    /document not found|foreign key|orphan/i,
    'orphan chunk writes must be rejected like a PostgreSQL document_id foreign key',
  );
  await assert.rejects(
    repository.createManyForDocument({ documentId: 'doc-intruder', userId: owner.id, chunks: [chunk] }),
    /document not found|forbidden|owner/i,
    'cross-owner chunk writes must be rejected before persisting document-derived content',
  );
  await assert.rejects(
    repository.createManyForDocument({ documentId: 'doc-owned', userId: owner.id, chunks: [chunk, { ...chunk, content: 'duplicate text' }] }),
    /duplicate|unique/i,
    'duplicate chunk IDs within the same document must be rejected like the PostgreSQL unique(document_id, chunk_id) constraint',
  );

  await repository.createManyForDocument({ documentId: 'doc-owned', userId: owner.id, chunks: [chunk] });
  await assert.rejects(
    repository.createManyForDocument({ documentId: 'doc-owned', userId: owner.id, chunks: [{ ...chunk, content: 'later duplicate' }] }),
    /duplicate|unique/i,
    'the repository must also reject duplicate stable IDs across separate writes for the same document',
  );
  assert.deepEqual(
    await repository.listForDocumentForUser({ documentId: 'doc-owned', userId: intruder.id }),
    [],
    'cross-owner listing must expose no chunks even when the stable ID is known',
  );
});

test('degraded embedding failures persist lexical chunks with safe fallback metadata and no vector-ready state', async () => {
  const { createDocumentService } = await importRequired(
    'apps/api/src/server/documents/service.mjs',
    ['createDocumentService'],
    'Document service degraded embedding failure behavior',
  );

  const documents = createRecordingDocumentRepository();
  const chunks = createRecordingChunkRepository();
  const rawTextCanary = 'RAW_EMBEDDING_TEXT_CANARY: proprietary document body must not leak';
  const embeddingProvider = {
    async embedTexts(texts) {
      assert.deepEqual(
        texts,
        [`# Root\n\n${rawTextCanary}`],
        'degraded ingestion must attempt to embed the same normalized chunk content it persists for lexical retrieval',
      );
      const error = new Error(`${rawTextCanary} provider failure`);
      error.code = 'EMBEDDING_PROVIDER_UNAVAILABLE';
      error.metadata = { rawText: rawTextCanary, vector: [0.111111, 0.222222] };
      throw error;
    },
  };
  const service = createDocumentService({
    documents,
    chunks,
    ingestion: {
      normalize: (content) => content.trim(),
      chunk: ({ documentId, content }) => [
        {
          chunkId: `${documentId}:000`,
          chunkIndex: 0,
          headingPath: ['Root'],
          content,
          tokenEstimate: 8,
        },
      ],
      embeddingProvider,
      embedding: {
        enabled: true,
        strict: false,
        provider: 'local_hashing',
        model: 'doculens-local-hashing-v1',
        dimensions: 384,
      },
    },
  });

  const created = await service.createDocument({
    currentUser: owner,
    title: 'Degraded embedding source',
    content: `# Root\n\n${rawTextCanary}`,
  });
  const persisted = chunks.unsafeRows(created.id);

  assert.equal(persisted.length, 1, 'degraded mode must keep the document lexically usable when embedding generation fails safely');
  assert.equal(persisted[0].content, `# Root\n\n${rawTextCanary}`, 'the lexical chunk content must still be persisted for fallback retrieval');
  assert.equal(persisted[0].embedding ?? null, null, 'a failed embedding operation must not persist a vector placeholder');
  assert.equal(persisted[0].embeddingProvider, 'local_hashing', 'failed embedding metadata must still identify the configured provider');
  assert.equal(persisted[0].embeddingModel, 'doculens-local-hashing-v1', 'failed embedding metadata must still identify the configured model');
  assert.equal(persisted[0].embeddingDimensions, 384, 'failed embedding metadata must preserve the configured dimension for diagnostics');
  assert.equal(persisted[0].embeddingStatus, 'failed', 'degraded chunks must be marked as not vector-ready');
  assert.equal(persisted[0].embeddingErrorCode, 'EMBEDDING_PROVIDER_UNAVAILABLE', 'degraded chunks must record a safe machine-readable embedding failure code');
  assert.equal(
    persisted[0].retrievalMetadata?.embedding?.fallbackReason,
    'embedding_unavailable',
    'retrieval metadata must route this document to honest lexical fallback rather than pgvector/hybrid',
  );
  const serializedMetadata = JSON.stringify({
    embeddingStatus: persisted[0].embeddingStatus,
    embeddingErrorCode: persisted[0].embeddingErrorCode,
    retrievalMetadata: persisted[0].retrievalMetadata,
  });
  assert.doesNotMatch(serializedMetadata, /RAW_EMBEDDING_TEXT_CANARY|proprietary document body|0\.111111|0\.222222/i, 'embedding failure metadata must not leak raw text or vector payloads');
});

test('strict embedding failures fail document ingestion closed without exposing partial vector-ready chunks', async () => {
  const { createDocumentService } = await importRequired(
    'apps/api/src/server/documents/service.mjs',
    ['createDocumentService'],
    'Document service strict embedding failure behavior',
  );

  const documents = createRecordingDocumentRepository();
  const chunks = createRecordingChunkRepository();
  const embeddingProvider = {
    async embedTexts() {
      const error = new Error('embedding provider unavailable for strict mode');
      error.code = 'EMBEDDING_PROVIDER_UNAVAILABLE';
      throw error;
    },
  };
  const service = createDocumentService({
    documents,
    chunks,
    ingestion: {
      normalize: (content) => content.trim(),
      chunk: ({ documentId, content }) => [
        { chunkId: `${documentId}:000`, chunkIndex: 0, headingPath: ['Root'], content, tokenEstimate: 4 },
      ],
      embeddingProvider,
      embedding: {
        enabled: true,
        strict: true,
        provider: 'local_hashing',
        model: 'doculens-local-hashing-v1',
        dimensions: 384,
      },
    },
  });

  await assert.rejects(
    service.createDocument({ currentUser: owner, title: 'Strict vector source', content: '# Root\n\nStrict body' }),
    /embedding provider unavailable|embedding generation failed|EMBEDDING_PROVIDER_UNAVAILABLE|ingestion failed/i,
    'strict mode must fail closed instead of publishing a lexical-only document as vector-ready',
  );

  assert.equal(chunks.writes.length, 0, 'strict mode must fail before chunk persistence when required embeddings cannot be produced');
  const row = documents.unsafeGet('doc-1');
  assert.ok(row === null || row.status === 'failed', 'strict embedding failure must not leave a ready document with no embeddings');
});
