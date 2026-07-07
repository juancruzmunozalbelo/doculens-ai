import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationsDir = path.join(repoRoot, 'db/migrations');
const migrationSql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => readFileSync(path.join(migrationsDir, name), 'utf8'))
  .join('\n\n');

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const ownerDocumentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherDocumentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function databaseEnv(databaseUrl) {
  const url = new URL(databaseUrl);
  const env = {
    ...process.env,
    PGHOST: url.hostname,
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
  if (url.port) env.PGPORT = url.port;
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

function hasPsqlClient() {
  const result = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  return !(result.error && result.error.code === 'ENOENT') && result.status === 0;
}

function runPsql(databaseUrl, sql) {
  return spawnSync('psql', ['--no-align', '--tuples-only', '--quiet', '--set', 'ON_ERROR_STOP=1'], {
    cwd: repoRoot,
    env: databaseEnv(databaseUrl),
    input: sql,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

function assertPsqlOk(result, label) {
  assert.equal(result.status, 0, `${label} failed: ${result.stderr || result.stdout}`);
}

function liveDatabaseOrSkip(t) {
  const databaseUrl = process.env.DOCULENS_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip('SKIP pgvector live check: set DOCULENS_TEST_DATABASE_URL to a PostgreSQL database with the pgvector extension available.');
    return null;
  }
  if (!hasPsqlClient()) {
    t.skip('SKIP pgvector live check: psql client is required to run DOCULENS_TEST_DATABASE_URL checks.');
    return null;
  }
  return databaseUrl;
}

function makeVector(nonZeroEntries = {}) {
  const values = Array.from({ length: 384 }, () => 0);
  for (const [index, value] of Object.entries(nonZeroEntries)) {
    values[Number(index)] = value;
  }
  return values;
}

function vectorLiteral(vector) {
  return `'[${vector.join(',')}]'`;
}

function assertBoundedScore(value, label) {
  assert.equal(typeof value, 'number', `${label} must be numeric`);
  assert.ok(value >= 0 && value <= 1, `${label} must be bounded between 0 and 1; received ${value}`);
}

function assertApproximatelyEqual(actual, expected, label, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${label}: expected ${expected}, received ${actual}`);
}

const unitX = makeVector({ 0: 1 });
const unitY = makeVector({ 1: 1 });
const diagonal = makeVector({ 0: Math.SQRT1_2, 1: Math.SQRT1_2 });

const contractDataSql = `
${migrationSql}

delete from message_citations where document_id in ('${ownerDocumentId}', '${otherDocumentId}');
delete from chat_messages where document_id in ('${ownerDocumentId}', '${otherDocumentId}');
delete from document_chunks where document_id in ('${ownerDocumentId}', '${otherDocumentId}');
delete from documents where id in ('${ownerDocumentId}', '${otherDocumentId}');
delete from users where id in ('${ownerId}', '${otherUserId}');

insert into users (id, email, password_hash, display_name) values
  ('${ownerId}', 'pgvector-owner@example.test', 'hash', 'Vector Owner'),
  ('${otherUserId}', 'pgvector-other@example.test', 'hash', 'Vector Other');

insert into documents (
  id,
  user_id,
  title,
  content,
  content_sha256,
  token_estimate,
  embedding_provider,
  embedding_model,
  embedding_dimensions,
  embedding_status,
  embedding_chunks_total,
  embedding_chunks_embedded,
  embedding_coverage,
  embedding_updated_at
) values
  ('${ownerDocumentId}', '${ownerId}', 'Owner Vector Document', 'owner vector content', 'sha-owner-vector', 3, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', 4, 4, '{\"totalChunks\":4,\"embeddedChunks\":4}'::jsonb, now()),
  ('${otherDocumentId}', '${otherUserId}', 'Other Tenant Vector Document', 'other tenant secret', 'sha-other-vector', 3, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', 1, 1, '{\"totalChunks\":1,\"embeddedChunks\":1}'::jsonb, now());

insert into document_chunks (
  id,
  document_id,
  chunk_id,
  chunk_index,
  heading_path,
  content,
  content_sha256,
  token_estimate,
  retrieval_metadata,
  embedding,
  embedding_provider,
  embedding_model,
  embedding_dimensions,
  embedding_status,
  embedding_metadata,
  embedded_at
) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '${ownerDocumentId}', 'owner-tie-2', 2, array['Vector Proof', 'Alpha Evidence'], 'alpha vector evidence later chunk', 'sha-owner-tie-2', 5, '{}'::jsonb, ${vectorLiteral(unitX)}, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', '{}'::jsonb, now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '${ownerDocumentId}', 'owner-tie-0', 0, array['Vector Proof', 'Alpha Evidence'], 'alpha vector evidence earlier chunk', 'sha-owner-tie-0', 5, '{}'::jsonb, ${vectorLiteral(unitX)}, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', '{}'::jsonb, now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '${ownerDocumentId}', 'owner-diagonal', 1, array['Vector Proof', 'Hybrid'], 'alpha hybrid requirements with heading support', 'sha-owner-diagonal', 6, '{}'::jsonb, ${vectorLiteral(diagonal)}, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', '{}'::jsonb, now()),
  ('aaaaaaaa-0000-4000-8000-000000000005', '${ownerDocumentId}', 'owner-far', 4, array['Vector Proof', 'Unrelated'], 'beta unrelated vector evidence', 'sha-owner-far', 4, '{}'::jsonb, ${vectorLiteral(unitY)}, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', '{}'::jsonb, now()),
  ('bbbbbbbb-0000-4000-8000-000000000001', '${otherDocumentId}', 'other-tenant-closest', 0, array['Other Tenant', 'Secret'], 'alpha other tenant closer vector must never leak or consume top-k', 'sha-other-closest', 10, '{}'::jsonb, ${vectorLiteral(unitX)}, 'local_hashing', 'doculens-local-hashing-v1', 384, 'ready', '{}'::jsonb, now());
`;

test('pgvector migration creates vector(384) embedding storage, metadata columns, partial index, and remains idempotent', (t) => {
  const databaseUrl = liveDatabaseOrSkip(t);
  if (!databaseUrl) return;

  const schemaSql = `
${migrationSql}
${migrationSql}
select case when exists (select 1 from pg_extension where extname = 'vector') then 'vector_extension_ok' else 'vector_extension_missing' end;
select case when exists (
  select 1
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  where c.relname = 'document_chunks'
    and a.attname = 'embedding'
    and not a.attisdropped
    and format_type(a.atttypid, a.atttypmod) = 'vector(384)'
) then 'embedding_vector_384_ok' else 'embedding_vector_384_missing' end;
select case when not exists (
  select expected.column_name
  from unnest(array['embedding_provider', 'embedding_model', 'embedding_dimensions', 'embedding_status', 'embedding_metadata', 'embedded_at']) as expected(column_name)
  except
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'document_chunks'
) then 'chunk_embedding_metadata_ok' else 'chunk_embedding_metadata_missing' end;
select case when not exists (
  select expected.column_name
  from unnest(array['embedding_provider', 'embedding_model', 'embedding_dimensions', 'embedding_status', 'embedding_chunks_total', 'embedding_chunks_embedded', 'embedding_coverage', 'embedding_updated_at']) as expected(column_name)
  except
  select column_name
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'documents'
) then 'document_embedding_coverage_ok' else 'document_embedding_coverage_missing' end;
select case when exists (
  select 1
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'document_chunks'
    and lower(indexdef) like '%embedding%'
    and (lower(indexdef) like '% using hnsw %' or lower(indexdef) like '% using ivfflat %')
    and lower(indexdef) like '%where%embedding is not null%'
) then 'partial_vector_index_ok' else 'partial_vector_index_missing' end;
`;

  const result = runPsql(databaseUrl, schemaSql);
  assertPsqlOk(result, 'pgvector migration contract');
  assert.match(result.stdout, /vector_extension_ok/, 'migration must enable the pgvector extension');
  assert.match(result.stdout, /embedding_vector_384_ok/, 'document_chunks.embedding must be vector(384)');
  assert.match(result.stdout, /chunk_embedding_metadata_ok/, 'chunk embedding provider/model/dimension/status plus embedding_metadata and embedded_at columns must exist');
  assert.match(result.stdout, /document_embedding_coverage_ok/, 'document embedding provider/model/dimension/status and coverage counter/metadata columns must exist');
  assert.match(result.stdout, /partial_vector_index_ok/, 'migration must create a partial pgvector index over non-null chunk embeddings');
});

test('PostgreSQL repository vector search orders by cosine similarity and scopes tenants before limit', async (t) => {
  const databaseUrl = liveDatabaseOrSkip(t);
  if (!databaseUrl) return;

  const setup = runPsql(databaseUrl, contractDataSql);
  assertPsqlOk(setup, 'pgvector repository fixture setup');

  const { createPostgreSqlRepositories } = await import('../../apps/api/src/server/postgresql/repositories.mjs');
  const repositories = createPostgreSqlRepositories({ databaseUrl });

  assert.equal(
    typeof repositories.chunksRepository.checkVectorReadiness,
    'function',
    'chunksRepository must expose checkVectorReadiness for startup pgvector preflight checks',
  );
  assert.equal(
    typeof repositories.chunksRepository.searchByVectorForDocumentForUser,
    'function',
    'chunksRepository must expose repository-backed vector search for RetrievalProvider wiring',
  );

  const readiness = await repositories.chunksRepository.checkVectorReadiness({ expectedDimensions: 384 });
  assert.notEqual(readiness?.ready, false, `pgvector readiness must pass before repository-backed vector proof executes: ${JSON.stringify(readiness)}`);

  const rows = await repositories.chunksRepository.searchByVectorForDocumentForUser({
    documentId: ownerDocumentId,
    userId: ownerId,
    embedding: unitX,
    limit: 2,
  });

  assert.deepEqual(
    rows.map((row) => row.chunkId),
    ['owner-tie-0', 'owner-tie-2'],
    'vector search must apply document/user filters before LIMIT and break equal-score ties by stable chunk_index',
  );
  assert.ok(rows.every((row) => row.documentId === ownerDocumentId && row.userId === ownerId), 'vector rows must remain scoped to the requested owner document');
  assert.ok(rows.every((row) => row.chunkId !== 'other-tenant-closest'), 'cross-tenant closer vectors must never be returned');
  for (const row of rows) {
    assertBoundedScore(row.normalizedScore, `${row.chunkId} normalizedScore`);
    assertApproximatelyEqual(row.normalizedScore, 1, `${row.chunkId} exact cosine similarity score`);
    assert.equal(row.retrievalMetadata?.backendProvenance, 'postgresql_repository', 'vector rows must identify repository-backed PostgreSQL provenance');
  }
});

test('PostgreSQL repository hybrid search reports bounded score components and the fixed hybrid formula', async (t) => {
  const databaseUrl = liveDatabaseOrSkip(t);
  if (!databaseUrl) return;

  const setup = runPsql(databaseUrl, contractDataSql);
  assertPsqlOk(setup, 'pgvector hybrid repository fixture setup');

  const { createPostgreSqlRepositories } = await import('../../apps/api/src/server/postgresql/repositories.mjs');
  const repositories = createPostgreSqlRepositories({ databaseUrl });
  assert.equal(
    typeof repositories.chunksRepository.searchHybridForDocumentForUser,
    'function',
    'chunksRepository must expose repository-backed hybrid search for RetrievalProvider wiring',
  );

  const rows = await repositories.chunksRepository.searchHybridForDocumentForUser({
    documentId: ownerDocumentId,
    userId: ownerId,
    query: 'alpha hybrid requirements',
    embedding: unitX,
    limit: 4,
  });

  assert.ok(rows.length >= 3, 'hybrid search must return embedded owner chunks for formula and tie-order proof');
  assert.ok(rows.every((row) => row.documentId === ownerDocumentId && row.userId === ownerId), 'hybrid rows must remain scoped to the requested owner document');
  assert.ok(rows.every((row) => row.chunkId !== 'other-tenant-closest'), 'hybrid search must exclude cross-tenant chunks before ranking and limit');

  const observedOrder = rows.map((row) => row.chunkId);
  const expectedOrder = [...rows]
    .sort((left, right) => (right.normalizedScore - left.normalizedScore) || (left.chunkIndex - right.chunkIndex))
    .map((row) => row.chunkId);
  assert.deepEqual(observedOrder, expectedOrder, 'hybrid rows must be ordered by bounded hybrid score and stable chunk_index ties');

  for (const row of rows) {
    assert.equal(row.retrievalMetadata?.backendProvenance, 'postgresql_repository', 'hybrid rows must identify repository-backed PostgreSQL provenance');
    const components = row.retrievalMetadata?.scoreComponents;
    assert.equal(typeof components, 'object', `${row.chunkId} must include hybrid component score metadata`);
    for (const key of ['vector', 'lexical', 'heading']) {
      assertBoundedScore(components[key], `${row.chunkId} ${key} component`);
    }
    const expectedScore = (0.75 * components.vector) + (0.20 * components.lexical) + (0.05 * components.heading);
    assertBoundedScore(row.normalizedScore, `${row.chunkId} hybrid normalizedScore`);
    assertApproximatelyEqual(row.normalizedScore, expectedScore, `${row.chunkId} hybrid formula`, 1e-3);
  }
});
