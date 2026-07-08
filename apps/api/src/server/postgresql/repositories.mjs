import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { BACKEND_PROVENANCE } from '../retrieval/utils.mjs';

function contentSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function tokenEstimate(content) {
  return String(content).split(/\s+/).filter(Boolean).length;
}

const VECTOR_DIMENSIONS = 384;
const VECTOR_PROVIDER = 'local_hashing';
const VECTOR_MODEL = 'doculens-local-hashing-v1';
const HYBRID_VECTOR_WEIGHT = 0.75;
const HYBRID_LEXICAL_WEIGHT = 0.20;
const HYBRID_HEADING_WEIGHT = 0.05;


function vectorLiteral(embedding, expectedDimensions = VECTOR_DIMENSIONS) {
  if (!Array.isArray(embedding) || embedding.length !== expectedDimensions) {
    const error = new Error(`embedding must be a ${expectedDimensions}-dimension vector`);
    error.code = 'EMBEDDING_DIMENSION_MISMATCH';
    throw error;
  }

  return JSON.stringify(embedding.map((value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      const error = new Error('embedding contains a non-finite value');
      error.code = 'EMBEDDING_INVALID_VALUE';
      throw error;
    }
    return numeric;
  }));
}

function chunkEmbeddingMetadata(chunk) {
  return {
    provider: chunk.embeddingProvider ?? chunk.embedding_provider ?? null,
    model: chunk.embeddingModel ?? chunk.embedding_model ?? null,
    dimensions: chunk.embeddingDimensions ?? chunk.embedding_dimensions ?? null,
    status: chunk.embeddingStatus ?? chunk.embedding_status ?? (Array.isArray(chunk.embedding) ? 'ready' : null),
    metadata: chunk.embeddingMetadata ?? chunk.embedding_metadata ?? {},
  };
}

function missingChunkEmbeddingsError() {
  const error = new Error('missing chunk embeddings for repository preferred retrieval');
  error.code = 'MISSING_CHUNK_EMBEDDINGS';
  return error;
}

function payloadVariable(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function parsePsqlJson(stdout) {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    return null;
  }
  return JSON.parse(trimmed);
}

function psqlEnvironment(databaseUrl) {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || databaseName === '') {
    throw new Error('DATABASE_URL must include PostgreSQL host and database name');
  }

  const env = {
    ...process.env,
    PGDATABASE: databaseName,
    PGHOST: url.hostname,
  };
  if (url.port) {
    env.PGPORT = url.port;
  }
  if (url.username) {
    env.PGUSER = decodeURIComponent(url.username);
  }
  if (url.password) {
    env.PGPASSWORD = decodeURIComponent(url.password);
  }
  const sslMode = url.searchParams.get('sslmode');
  if (sslMode) {
    env.PGSSLMODE = sslMode;
  }
  return env;
}

async function queryJson({ databaseUrl, sql, payload }) {
  const args = [
    '--no-align',
    '--tuples-only',
    '--quiet',
    '--set',
    'ON_ERROR_STOP=1',
  ];
  const script = `\\set payload '${payloadVariable(payload)}'\n${sql}\n`;
  const env = psqlEnvironment(databaseUrl);

  return await new Promise((resolve, reject) => {
    const child = spawn('psql', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(script);
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new Error(`Unable to run PostgreSQL query: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`PostgreSQL query failed with exit code ${code}: ${stderr.trim()}`));
        return;
      }
      try {
        resolve(parsePsqlJson(stdout));
      } catch (error) {
        reject(new Error(`PostgreSQL query returned invalid JSON: ${error.message}`));
      }
    });
  });
}

const userJson = `json_build_object(
  'id', id::text,
  'email', email,
  'passwordHash', password_hash,
  'displayName', display_name,
  'createdAt', created_at,
  'updatedAt', updated_at
)`;

const documentJson = `json_build_object(
  'id', id::text,
  'userId', user_id::text,
  'title', title,
  'content', content,
  'sourceType', source_type,
  'status', status,
  'tokenEstimate', token_estimate,
  'metadata', metadata,
  'createdAt', created_at,
  'updatedAt', updated_at
)`;

const chunkJson = `json_build_object(
  'id', c.id::text,
  'documentId', c.document_id::text,
  'userId', d.user_id::text,
  'chunkId', c.chunk_id,
  'chunkIndex', c.chunk_index,
  'headingPath', c.heading_path,
  'content', c.content,
  'tokenEstimate', c.token_estimate,
  'retrievalMetadata', c.retrieval_metadata,
  'embeddingProvider', c.embedding_provider,
  'embeddingModel', c.embedding_model,
  'embeddingDimensions', c.embedding_dimensions,
  'embeddingStatus', c.embedding_status,
  'embeddingMetadata', c.embedding_metadata,
  'embeddedAt', c.embedded_at,
  'createdAt', c.created_at
)`;

const analysisJson = `json_build_object(
  'id', a.id::text,
  'documentId', a.document_id::text,
  'summary', a.summary,
  'sections', coalesce(a.provider_metadata->'sections', '[]'::jsonb),
  'entities', a.entities,
  'requirements', coalesce(a.provider_metadata->'requirements', '[]'::jsonb),
  'obligations', a.obligations,
  'deliverables', coalesce(a.provider_metadata->'deliverables', '[]'::jsonb),
  'risks', a.risks,
  'uncertainties', a.uncertainties,
  'recommendedQuestions', coalesce(a.provider_metadata->'recommendedQuestions', '[]'::jsonb),
  'metadata', jsonb_build_object(
    'provider', a.provider,
    'model', a.model,
    'promptId', a.prompt_id,
    'promptVersion', a.prompt_version,
    'contextStrategy', a.context_strategy,
    'thinkingMode', a.thinking_mode,
    'tokenEstimate', a.token_estimate,
    'tokenUsage', jsonb_build_object('input', a.input_tokens, 'output', a.output_tokens)
  ) || a.provider_metadata,
  'createdAt', a.created_at
)`;

const messageJson = `json_build_object(
  'id', m.id::text,
  'documentId', m.document_id::text,
  'userId', m.user_id::text,
  'role', m.role,
  'content', m.content,
  'metadata', m.metadata || jsonb_build_object(
    'provider', m.provider,
    'model', m.model,
    'promptId', m.prompt_id,
    'promptVersion', m.prompt_version,
    'contextStrategy', m.context_strategy,
    'fallbackReason', m.fallback_reason,
    'retrievalScoreSummary', m.retrieval_score_summary,
    'retrievedChunkIds', m.retrieved_chunk_ids,
    'tokenEstimate', m.token_estimate,
    'tokenUsage', jsonb_build_object('input', m.input_tokens, 'output', m.output_tokens)
  ),
  'createdAt', m.created_at
)`;

export function createPostgreSqlRepositories({ databaseUrl } = {}) {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for PostgreSQL repositories');
  }

  const query = (sql, payload = {}) => queryJson({ databaseUrl, sql, payload });

  const users = {
    async createUser({ email, passwordHash, displayName }) {
      const row = await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), inserted as (
           insert into users (email, password_hash, display_name)
           select lower(data->>'email'), data->>'passwordHash', data->>'displayName'
           from input
           on conflict (email) do nothing
           returning ${userJson} as created_user
         )
         select coalesce((select json_build_object('user', inserted.created_user) from inserted), '{"user":null}'::json);`,
        { email, passwordHash, displayName },
      );
      if (!row?.user) {
        const error = new Error('User already exists');
        error.statusCode = 409;
        throw error;
      }
      return row.user;
    },
    async findByEmail(email) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce((
           select ${userJson}
           from users, input
           where email = lower(input.data->>'email')
         ), 'null'::json);`,
        { email },
      );
    },
    async findById(id) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce((
           select ${userJson}
           from users, input
           where id = (input.data->>'id')::uuid
         ), 'null'::json);`,
        { id },
      );
    },
  };

  const documentsRepository = {
    async createForUser({ userId, title, content, status = 'ready', sourceType = 'markdown', metadata = {} }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         insert into documents (user_id, title, content, source_type, status, content_sha256, token_estimate, metadata)
         select
           (data->>'userId')::uuid,
           data->>'title',
           data->>'content',
           coalesce(data->>'sourceType', 'markdown'),
           data->>'status',
           data->>'contentSha256',
           (data->>'tokenEstimate')::integer,
           coalesce(data->'metadata', '{}'::jsonb)
         from input
         returning ${documentJson};`,
        {
          userId,
          title,
          content,
          status,
          sourceType,
          metadata,
          contentSha256: contentSha256(content),
          tokenEstimate: tokenEstimate(content),
        },
      );
    },
    async listForUser({ userId }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce(json_agg(${documentJson} order by created_at desc), '[]'::json)
         from documents, input
         where user_id = (input.data->>'userId')::uuid
           and status <> 'failed'
           and deleted_at is null;`,
        { userId },
      );
    },
    async findByIdForUser({ documentId, userId }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce((
           select ${documentJson}
           from documents, input
           where id = (input.data->>'documentId')::uuid
             and user_id = (input.data->>'userId')::uuid
            and status <> 'failed'
            and deleted_at is null
         ), 'null'::json);`,
        { documentId, userId },
      );
    },
    async updateTitleForUser({ documentId, userId, title }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), updated as (
           update documents
           set title = data->>'title',
               updated_at = now()
           from input
           where id = (input.data->>'documentId')::uuid
             and user_id = (input.data->>'userId')::uuid
             and status <> 'failed'
             and deleted_at is null
           returning ${documentJson} as document
         )
         select coalesce((select document from updated), 'null'::json);`,
        { documentId, userId, title },
      );
    },
    async deleteByIdForUser({ documentId, userId }) {
      const row = await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), updated as (
           update documents
           set deleted_at = now(), updated_at = now()
           from input
           where id = (input.data->>'documentId')::uuid
             and user_id = (input.data->>'userId')::uuid
             and deleted_at is null
           returning true as deleted
         )
         select to_json(coalesce((select deleted from updated), false));`,
        { documentId, userId },
      );
      return row === true;
    },
    async markFailedForUser({ documentId, userId, reason }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), updated as (
           update documents
           set status = 'failed',
               metadata = jsonb_set(metadata, '{failureReason}', to_jsonb(data->>'reason'), true),
               updated_at = now()
           from input
           where id = (input.data->>'documentId')::uuid
             and user_id = (input.data->>'userId')::uuid
             and deleted_at is null
           returning ${documentJson} as document
         )
         select coalesce((select document from updated), 'null'::json);`,
        { documentId, userId, reason },
      );
    },
  };

  const chunksRepository = {
    async createManyForDocument({ documentId, userId, chunks }) {
      if (!Array.isArray(chunks)) {
        throw new Error('chunks must be an array');
      }
      const seen = new Set();
      for (const chunk of chunks) {
        if (typeof chunk.chunkId !== 'string' || chunk.chunkId.trim() === '') {
          throw new Error('chunkId is required');
        }
        if (seen.has(chunk.chunkId)) {
          const error = new Error(`duplicate chunk id ${chunk.chunkId} for document ${documentId}`);
          error.statusCode = 409;
          throw error;
        }
        seen.add(chunk.chunkId);
      }
      const preparedChunks = chunks.map((chunk) => {
        const metadata = chunkEmbeddingMetadata(chunk);
        const hasEmbedding = Array.isArray(chunk.embedding);
        return {
          ...chunk,
          embedding: hasEmbedding ? vectorLiteral(chunk.embedding, metadata.dimensions ?? VECTOR_DIMENSIONS) : null,
          embeddingProvider: metadata.provider ?? (hasEmbedding ? VECTOR_PROVIDER : null),
          embeddingModel: metadata.model ?? (hasEmbedding ? VECTOR_MODEL : null),
          embeddingDimensions: metadata.dimensions ?? (hasEmbedding ? VECTOR_DIMENSIONS : null),
          embeddingStatus: metadata.status ?? (hasEmbedding ? 'ready' : null),
          embeddingMetadata: metadata.metadata ?? {},
        };
      });


      const authorized = await documentsRepository.findByIdForUser({ documentId, userId });
      if (!authorized) {
        const error = new Error('document not found or forbidden for chunk write');
        error.statusCode = 404;
        throw error;
      }
      if (chunks.length === 0) {
        return [];
      }

      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), chunk_input as (
           select
             (data->>'documentId')::uuid as document_id,
             jsonb_array_elements(data->'chunks') as chunk
           from input
         ), inserted as (
           insert into document_chunks (
             document_id, chunk_id, chunk_index, heading_path, content, content_sha256,
             token_estimate, retrieval_metadata, embedding, embedding_provider, embedding_model,
             embedding_dimensions, embedding_status, embedding_metadata, embedded_at
           )
           select
             chunk_input.document_id,
             chunk->>'chunkId',
             (chunk->>'chunkIndex')::integer,
             coalesce(array(select jsonb_array_elements_text(chunk->'headingPath')), array[]::text[]),
             chunk->>'content',
             encode(digest(chunk->>'content', 'sha256'), 'hex'),
             (chunk->>'tokenEstimate')::integer,
             coalesce(chunk->'retrievalMetadata', '{}'::jsonb),
             nullif(chunk->>'embedding', '')::vector,
             chunk->>'embeddingProvider',
             chunk->>'embeddingModel',
             nullif(chunk->>'embeddingDimensions', '')::integer,
             chunk->>'embeddingStatus',
             coalesce(chunk->'embeddingMetadata', '{}'::jsonb),
             case when chunk ? 'embedding' and chunk->>'embedding' is not null then now() else null end
           from chunk_input
           returning *
         ), coverage as (
           select
             document_id,
             count(*)::integer as total_chunks,
             count(*) filter (where embedding is not null)::integer as embedded_chunks,
             max(embedding_provider) filter (where embedding is not null) as provider,
             max(embedding_model) filter (where embedding is not null) as model,
             max(embedding_dimensions) filter (where embedding is not null) as dimensions
           from document_chunks
           where document_id = (select document_id from chunk_input limit 1)
           group by document_id
         ), updated_document as (
           update documents d
           set embedding_provider = coverage.provider,
               embedding_model = coverage.model,
               embedding_dimensions = coverage.dimensions,
               embedding_status = case
                 when coverage.total_chunks = 0 then null
                 when coverage.embedded_chunks = coverage.total_chunks then 'ready'
                 when coverage.embedded_chunks > 0 then 'partial'
                 else null
               end,
               embedding_chunks_total = coverage.total_chunks,
               embedding_chunks_embedded = coverage.embedded_chunks,
               embedding_coverage = jsonb_build_object(
                 'totalChunks', coverage.total_chunks,
                 'embeddedChunks', coverage.embedded_chunks,
                 'missingChunks', greatest(coverage.total_chunks - coverage.embedded_chunks, 0)
               ),
               embedding_updated_at = case when coverage.embedded_chunks > 0 then now() else d.embedding_updated_at end,
               updated_at = now()
           from coverage
           where d.id = coverage.document_id
           returning true
         )
         select coalesce(json_agg(${chunkJson} order by c.chunk_index), '[]'::json)
         from inserted c
         join documents d on d.id = c.document_id;`,
        { documentId, chunks: preparedChunks },
      );
    },

    async listForDocumentForUser({ documentId, userId }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce(json_agg(${chunkJson} order by c.chunk_index), '[]'::json)
         from document_chunks c
         join documents d on d.id = c.document_id
         join input on true
         where c.document_id = (input.data->>'documentId')::uuid
           and d.user_id = (input.data->>'userId')::uuid
           and d.status <> 'failed'
           and d.deleted_at is null;`,
        { documentId, userId },
      );
    },

    async checkVectorReadiness({ expectedDimensions = VECTOR_DIMENSIONS, strict = false } = {}) {
      const readiness = await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), expected as (
           select (data->>'expectedDimensions')::integer as dimensions from input
         ), checks as (
           select
             exists(select 1 from pg_extension where extname = 'vector') as extension_installed,
             exists(select 1 from pg_type where typname = 'vector') as vector_type_available,
             exists(
               select 1
               from pg_operator op
               join pg_type left_type on left_type.oid = op.oprleft
               join pg_type right_type on right_type.oid = op.oprright
               where op.oprname = '<=>'
                 and left_type.typname = 'vector'
                 and right_type.typname = 'vector'
             ) as cosine_operator_available,
             exists(
               select 1
               from pg_attribute attr
               join pg_class rel on rel.oid = attr.attrelid
               join pg_namespace nsp on nsp.oid = rel.relnamespace
               join expected on true
               where nsp.nspname = 'public'
                 and rel.relname = 'document_chunks'
                 and attr.attname = 'embedding'
                 and format_type(attr.atttypid, attr.atttypmod) = ('vector(' || expected.dimensions::text || ')')
                 and not attr.attnotnull
             ) as column_dimension_ready,
             exists(
               select 1
               from pg_indexes
               where schemaname = 'public'
                 and tablename = 'document_chunks'
                 and indexname = 'document_chunks_embedding_hnsw_idx'
                 and indexdef ilike '%embedding%'
                 and indexdef ilike '%vector_cosine_ops%'
                 and indexdef ilike '%where (embedding is not null)%'
             ) as index_ready
         )
         select json_build_object(
           'extensionInstalled', extension_installed,
           'vectorTypeAvailable', vector_type_available,
           'cosineOperatorAvailable', cosine_operator_available,
           'columnDimensionReady', column_dimension_ready,
           'indexReady', index_ready,
           'ready', extension_installed and vector_type_available and cosine_operator_available and column_dimension_ready and index_ready
         )
         from checks;`,
        { expectedDimensions },
      );
      if (!readiness?.ready && strict) {
        const failed = Object.entries(readiness ?? {})
          .filter(([key, value]) => key !== 'ready' && value === false)
          .map(([key]) => key);
        const error = new Error(`pgvector readiness check failed: ${failed.join(', ')}`);
        error.code = 'PGVECTOR_PREFLIGHT_FAILED';
        error.readiness = readiness;
        throw error;
      }
      return readiness;
    },

    async embeddingCoverageForDocumentForUser({ documentId, userId }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         select coalesce((
           select json_build_object(
             'totalChunks', count(*)::integer,
             'embeddedChunks', count(*) filter (where c.embedding is not null)::integer
           )
           from document_chunks c
           join documents d on d.id = c.document_id
           where c.document_id = (input.data->>'documentId')::uuid
             and d.user_id = (input.data->>'userId')::uuid
             and d.status <> 'failed'
             and d.deleted_at is null
         ), json_build_object('totalChunks', 0, 'embeddedChunks', 0))
         from input;`,
        { documentId, userId },
      );
    },

    async searchByVectorForDocumentForUser({ documentId, userId, embedding, limit }) {
      await this.checkVectorReadiness({ expectedDimensions: VECTOR_DIMENSIONS, strict: true });
      const coverage = await this.embeddingCoverageForDocumentForUser({ documentId, userId });
      if ((coverage?.totalChunks ?? 0) > 0 && coverage.embeddedChunks < coverage.totalChunks) {
        throw missingChunkEmbeddingsError();
      }
      if ((coverage?.totalChunks ?? 0) === 0) {
        return [];
      }

      const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : 4;
      const queryEmbedding = vectorLiteral(embedding);
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), query_vector as (
           select
             (data->>'embedding')::vector as embedding,
             greatest(1, (data->>'limit')::integer) as result_limit
           from input
         ), ranked as (
           select c.*, c.embedding <=> query_vector.embedding as distance
           from document_chunks c
           join documents d on d.id = c.document_id
           join query_vector on true
           join input on true
           where c.document_id = (input.data->>'documentId')::uuid
             and d.user_id = (input.data->>'userId')::uuid
             and d.status <> 'failed'
             and d.deleted_at is null
             and c.embedding is not null
           order by distance asc, c.chunk_index asc
           limit (select result_limit from query_vector)
         )
         select coalesce(json_agg(json_build_object(
           'id', c.id::text,
           'documentId', c.document_id::text,
           'userId', d.user_id::text,
           'chunkId', c.chunk_id,
           'chunkIndex', c.chunk_index,
           'headingPath', c.heading_path,
           'content', c.content,
           'tokenEstimate', c.token_estimate,
           'normalizedScore', round(greatest(0, least(1, 1 - c.distance))::numeric, 3)::float,
           'vectorScore', round(greatest(0, least(1, 1 - c.distance))::numeric, 3)::float,
           'retrievalMetadata', c.retrieval_metadata || jsonb_build_object(
             'backendProvenance', '${BACKEND_PROVENANCE.postgresqlRepository}',
             'scoreComponents', jsonb_build_object(
               'vector', round(greatest(0, least(1, 1 - c.distance))::numeric, 3)::float
             )
           ),
           'createdAt', c.created_at
         ) order by c.distance asc, c.chunk_index asc), '[]'::json)
         from ranked c
         join documents d on d.id = c.document_id;`,
        { documentId, userId, embedding: queryEmbedding, limit: boundedLimit },
      );
    },

    async searchHybridForDocumentForUser({ documentId, userId, query: searchText, embedding, limit }) {
      await this.checkVectorReadiness({ expectedDimensions: VECTOR_DIMENSIONS, strict: true });
      const coverage = await this.embeddingCoverageForDocumentForUser({ documentId, userId });
      if ((coverage?.totalChunks ?? 0) > 0 && coverage.embeddedChunks < coverage.totalChunks) {
        throw missingChunkEmbeddingsError();
      }
      if ((coverage?.totalChunks ?? 0) === 0) {
        return [];
      }

      const boundedLimit = Number.isInteger(limit) && limit > 0 ? limit : 4;
      const queryEmbedding = vectorLiteral(embedding);
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), query_terms as (
           select
             (data->>'embedding')::vector as embedding,
             greatest(1, (data->>'limit')::integer) as result_limit,
             array(
               select distinct term
               from regexp_split_to_table(lower(coalesce(data->>'query', '')), '[^a-z0-9-]+') term
               where length(term) > 2
             ) as terms
           from input
         ), scored as (
           select
             c.*,
             c.embedding <=> query_terms.embedding as distance,
             greatest(0, least(1, 1 - (c.embedding <=> query_terms.embedding))) as vector_score,
             case when cardinality(query_terms.terms) = 0 then 0 else (
               select count(*)::float / cardinality(query_terms.terms)
               from unnest(query_terms.terms) term
               where lower(array_to_string(c.heading_path, ' ') || ' ' || c.content) like '%' || term || '%'
             ) end as lexical_score,
             case when cardinality(query_terms.terms) = 0 then 0 else (
               select count(*)::float / cardinality(query_terms.terms)
               from unnest(query_terms.terms) term
               where lower(array_to_string(c.heading_path, ' ')) like '%' || term || '%'
             ) end as heading_match_score
           from document_chunks c
           join documents d on d.id = c.document_id
           join query_terms on true
           join input on true
           where c.document_id = (input.data->>'documentId')::uuid
             and d.user_id = (input.data->>'userId')::uuid
             and d.status <> 'failed'
             and d.deleted_at is null
             and c.embedding is not null
         ), ranked as (
           select
             scored.*,
             greatest(0, least(1,
               (${HYBRID_VECTOR_WEIGHT} * vector_score) +
               (${HYBRID_LEXICAL_WEIGHT} * lexical_score) +
               (${HYBRID_HEADING_WEIGHT} * heading_match_score)
             )) as hybrid_score
           from scored
           order by hybrid_score desc, chunk_index asc
           limit (select result_limit from query_terms)
         )
         select coalesce(json_agg(json_build_object(
           'id', c.id::text,
           'documentId', c.document_id::text,
           'userId', d.user_id::text,
           'chunkId', c.chunk_id,
           'chunkIndex', c.chunk_index,
           'headingPath', c.heading_path,
           'content', c.content,
           'tokenEstimate', c.token_estimate,
           'normalizedScore', round(c.hybrid_score::numeric, 3)::float,
           'vectorScore', round(c.vector_score::numeric, 3)::float,
           'lexicalScore', round(greatest(0, least(1, c.lexical_score))::numeric, 3)::float,
           'headingMatchScore', round(greatest(0, least(1, c.heading_match_score))::numeric, 3)::float,
           'hybridScore', round(c.hybrid_score::numeric, 3)::float,
           'retrievalMetadata', c.retrieval_metadata || jsonb_build_object(
             'backendProvenance', '${BACKEND_PROVENANCE.postgresqlRepository}',
             'scoreComponents', jsonb_build_object(
               'vector', round(c.vector_score::numeric, 3)::float,
               'lexical', round(greatest(0, least(1, c.lexical_score))::numeric, 3)::float,
               'heading', round(greatest(0, least(1, c.heading_match_score))::numeric, 3)::float,
               'hybrid', round(c.hybrid_score::numeric, 3)::float
             )
           ),
           'createdAt', c.created_at
         ) order by c.hybrid_score desc, c.chunk_index asc), '[]'::json)
         from ranked c
         join documents d on d.id = c.document_id;`,
        { documentId, userId, query: searchText, embedding: queryEmbedding, limit: boundedLimit },
      );
    },

    async deleteForDocument({ documentId }) {
      await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), deleted as (
           delete from document_chunks
           using input
           where document_id = (input.data->>'documentId')::uuid
           returning true
         )
         select to_json(coalesce((select bool_or(true) from deleted), false));`,
        { documentId },
      );
    },
  };

  const analysisRepository = {
    async saveAnalysis({ documentId, userId, analysis, metadata = analysis?.metadata ?? {} }) {
      await documentsRepository.findByIdForUser({ documentId, userId }).then((document) => {
        if (!document) {
          const error = new Error('document not found or forbidden for analysis write');
          error.statusCode = 404;
          throw error;
        }
      });
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), inserted as (
           insert into document_analyses (
             document_id, summary, entities, obligations, risks, uncertainties,
             provider, model, prompt_id, prompt_version, context_strategy, thinking_mode,
             input_tokens, output_tokens, token_estimate, provider_metadata
           )
           select
             (data->>'documentId')::uuid,
             data->'analysis'->>'summary',
             coalesce(data->'analysis'->'entities', '[]'::jsonb),
             coalesce(data->'analysis'->'obligations', '[]'::jsonb),
             coalesce(data->'analysis'->'risks', '[]'::jsonb),
             coalesce(data->'analysis'->'uncertainties', '[]'::jsonb),
             data->'metadata'->>'provider',
             data->'metadata'->>'model',
             coalesce(data->'metadata'->>'promptId', 'doculens.analysis'),
             data->'metadata'->>'promptVersion',
             coalesce(data->'metadata'->>'contextStrategy', 'full_document'),
             data->'metadata'->>'thinkingMode',
             nullif(coalesce(data->'metadata'->'tokenUsage'->>'input', data->'metadata'->'tokenEstimate'->>'input'), '')::integer,
             nullif(coalesce(data->'metadata'->'tokenUsage'->>'output', data->'metadata'->'tokenEstimate'->>'output'), '')::integer,
             case when jsonb_typeof(data->'metadata'->'tokenEstimate') = 'number' then (data->'metadata'->>'tokenEstimate')::integer else null end,
             data->'metadata' || jsonb_build_object(
               'sections', coalesce(data->'analysis'->'sections', '[]'::jsonb),
               'requirements', coalesce(data->'analysis'->'requirements', '[]'::jsonb),
               'deliverables', coalesce(data->'analysis'->'deliverables', '[]'::jsonb),
               'recommendedQuestions', coalesce(data->'analysis'->'recommendedQuestions', '[]'::jsonb)
             )
           from input
           returning *
         )
         select ${analysisJson}
         from inserted a;`,
        { documentId, userId, analysis, metadata },
      );
    },
  };

  const chatRepository = {
    async saveMessage({ documentId, userId, answer, citations = [], metadata = answer?.metadata ?? {} }) {
      await documentsRepository.findByIdForUser({ documentId, userId }).then((document) => {
        if (!document) {
          const error = new Error('document not found or forbidden for chat write');
          error.statusCode = 404;
          throw error;
        }
      });
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         ), inserted_message as (
           insert into chat_messages (
             document_id, user_id, role, content, provider, model, prompt_id, prompt_version,
             context_strategy, fallback_reason, retrieval_score_summary, retrieved_chunk_ids,
             token_estimate, input_tokens, output_tokens, metadata
           )
           select
             (data->>'documentId')::uuid,
             (data->>'userId')::uuid,
             'assistant',
             data->'answer'->>'text',
             data->'metadata'->>'provider',
             data->'metadata'->>'model',
             data->'metadata'->>'promptId',
             data->'metadata'->>'promptVersion',
             coalesce(data->'metadata'->>'contextStrategy', 'rag'),
             data->'metadata'->>'fallbackReason',
             coalesce(data->'metadata'->'retrievalScoreSummary', '{}'::jsonb),
             coalesce(array(select jsonb_array_elements_text(data->'metadata'->'retrievedChunkIds')), array[]::text[]),
             case when jsonb_typeof(data->'metadata'->'tokenEstimate') = 'number' then (data->'metadata'->>'tokenEstimate')::integer else null end,
             nullif(coalesce(data->'metadata'->'tokenUsage'->>'input', data->'metadata'->'tokenEstimate'->>'input'), '')::integer,
             nullif(coalesce(data->'metadata'->'tokenUsage'->>'output', data->'metadata'->'tokenEstimate'->>'output'), '')::integer,
             data->'metadata'
           from input
           returning *
         ), citation_input as (
           select
             inserted_message.id as message_id,
             (input.data->>'documentId')::uuid as document_id,
             citation,
             ordinality - 1 as citation_index
           from input
           join inserted_message on true
           left join lateral jsonb_array_elements(coalesce(input.data->'citations', '[]'::jsonb)) with ordinality as c(citation, ordinality) on true
         ), inserted_citations as (
           insert into message_citations (document_id, message_id, chunk_id, chunk_stable_id, quote, citation_index, metadata)
           select
             citation_input.document_id,
             citation_input.message_id,
             chunks.id,
             citation_input.citation->>'chunkId',
             citation_input.citation->>'quote',
             citation_input.citation_index,
             citation_input.citation
           from citation_input
           join document_chunks chunks
             on chunks.document_id = citation_input.document_id
            and chunks.chunk_id = citation_input.citation->>'chunkId'
           where citation_input.citation is not null
           returning true
         )
         select ${messageJson}
         from inserted_message m;`,
        { documentId, userId, answer, citations, metadata },
      );
    },
  };

  return { users, documentsRepository, chunksRepository, analysisRepository, chatRepository };

}
