import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationSql = readFileSync(path.join(repoRoot, 'db/migrations/001_foundation_schema.sql'), 'utf8');

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

function runPsql(databaseUrl, sql) {
  return spawnSync('psql', ['--no-align', '--tuples-only', '--quiet', '--set', 'ON_ERROR_STOP=1'], {
    cwd: repoRoot,
    env: databaseEnv(databaseUrl),
    input: sql,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function assertPsqlOk(result, label) {
  assert.equal(result.status, 0, `${label} failed: ${result.stderr || result.stdout}`);
}

const integritySql = `
create schema if not exists doculens_eval_integrity;
set search_path to doculens_eval_integrity, public;
${migrationSql}
truncate table ai_prompts, message_citations, chat_messages, document_analyses, document_chunks, documents, users restart identity cascade;

insert into users (id, email, password_hash, display_name) values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', 'hash', 'Owner'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.test', 'hash', 'Other');
insert into documents (id, user_id, title, content, content_sha256, token_estimate) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Owner Doc', 'owner content', 'sha-owner', 2),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Other Doc', 'other content', 'sha-other', 2);
insert into document_chunks (id, document_id, chunk_id, chunk_index, heading_path, content, content_sha256, token_estimate) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'chunk-stable', 0, array['Owner'], 'owner chunk', 'sha-c1', 2),
  ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'chunk-stable', 0, array['Other'], 'other chunk', 'sha-c2', 2);
insert into chat_messages (id, document_id, user_id, role, content, context_strategy) values
  ('aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'assistant', 'owner answer', 'rag');

-- Same-document citation succeeds.
insert into message_citations (document_id, message_id, chunk_id, chunk_stable_id, quote, citation_index) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'chunk-stable', 'owner chunk', 0);

-- Duplicate stable chunk ID within one document is rejected but same stable ID in another document is allowed above.
do $$
begin
  begin
    insert into document_chunks (document_id, chunk_id, chunk_index, heading_path, content, content_sha256, token_estimate)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'chunk-stable', 1, array['Owner'], 'duplicate', 'sha-dup', 1);
    raise exception 'duplicate chunk ID was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- Orphan child records are rejected.
do $$
begin
  begin
    insert into document_chunks (document_id, chunk_id, chunk_index, content, content_sha256)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'orphan', 0, 'orphan', 'sha-orphan');
    raise exception 'orphan chunk was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Cross-document citation is rejected by same-document constraints.
do $$
begin
  begin
    insert into message_citations (document_id, message_id, chunk_id, chunk_stable_id, quote, citation_index)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-2222-4222-8222-aaaaaaaaaaaa', 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'chunk-stable', 'wrong document', 1);
    raise exception 'cross-document citation was accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Soft-deleted documents are hidden from read/list, chunk, and citation visibility filters.
update documents
set deleted_at = now(), updated_at = now()
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

select case when exists (
  select 1
  from documents
  where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and user_id = '11111111-1111-4111-8111-111111111111'
    and status <> 'failed'
    and deleted_at is null
) then 'soft_delete_document_visible' else 'soft_delete_document_hidden' end;

select case when exists (
  select 1
  from document_chunks c
  join documents d on d.id = c.document_id
  where c.document_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and d.user_id = '11111111-1111-4111-8111-111111111111'
    and d.status <> 'failed'
    and d.deleted_at is null
) then 'soft_delete_chunk_visible' else 'soft_delete_chunk_hidden' end;

select case when exists (
  select 1
  from message_citations mc
  join documents d on d.id = mc.document_id
  where mc.document_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    and d.user_id = '11111111-1111-4111-8111-111111111111'
    and d.status <> 'failed'
    and d.deleted_at is null
) then 'soft_delete_citation_visible' else 'soft_delete_citation_hidden' end;

-- Rollback preserves no partial child state.
begin;
  insert into documents (id, user_id, title, content, content_sha256, token_estimate)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'Rollback Doc', 'partial', 'sha-rollback', 1);
  insert into document_chunks (document_id, chunk_id, chunk_index, content, content_sha256)
  values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'partial', 0, 'partial', 'sha-partial');
rollback;
select case when exists (select 1 from documents where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') then 'rollback_failed' else 'rollback_ok' end;
`;

function hasPsqlClient() {
  const result = spawnSync('psql', ['--version'], { encoding: 'utf8' });
  return !(result.error && result.error.code === 'ENOENT') && result.status === 0;
}

test('PostgreSQL integrity rejects orphan, duplicate, cross-document, and soft-delete visibility regressions and preserves rollback semantics', (t) => {
  const databaseUrl = process.env.DOCULENS_TEST_DATABASE_URL;
  if (!databaseUrl) {
    t.skip('SKIP PostgreSQL integrity live check: set DOCULENS_TEST_DATABASE_URL to run foreign keys, unique chunk IDs, same-document citations, soft-delete visibility, rollback, and migration idempotency checks.');
    return;
  }
  if (!hasPsqlClient()) {
    t.skip('SKIP PostgreSQL integrity live check: psql client is required to run DOCULENS_TEST_DATABASE_URL checks.');
    return;
  }

  const first = runPsql(databaseUrl, integritySql);
  assertPsqlOk(first, 'PostgreSQL integrity contract');
  assert.match(first.stdout, /rollback_ok/, 'transaction rollback must leave no partial document or chunk records');
  assert.match(first.stdout, /soft_delete_document_hidden/, 'soft-deleted document must be hidden from read/list filters');
  assert.match(first.stdout, /soft_delete_chunk_hidden/, 'soft-deleted document chunks must be hidden from visibility filters');
  assert.match(first.stdout, /soft_delete_citation_hidden/, 'soft-deleted document citations must be hidden from visibility filters');

  const second = runPsql(databaseUrl, integritySql);
  assertPsqlOk(second, 'PostgreSQL migration/reset idempotency contract');
  assert.match(second.stdout, /rollback_ok/, 'integrity contract must be idempotent on repeat runs');
  assert.match(second.stdout, /soft_delete_document_hidden/, 'soft-delete document visibility check must be idempotent');
  assert.match(second.stdout, /soft_delete_chunk_hidden/, 'soft-delete chunk visibility check must be idempotent');
  assert.match(second.stdout, /soft_delete_citation_hidden/, 'soft-delete citation visibility check must be idempotent');
});
