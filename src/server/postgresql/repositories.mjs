import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

function contentSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function tokenEstimate(content) {
  return String(content).split(/\s+/).filter(Boolean).length;
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
    '--set',
    `payload=${payloadVariable(payload)}`,
    '--command',
    sql,
  ];
  const env = psqlEnvironment(databaseUrl);

  return await new Promise((resolve, reject) => {
    const child = spawn('psql', args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
           returning ${userJson} as user
         )
         select coalesce((select json_build_object('user', user) from inserted), '{"user":null}'::json);`,
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
    async createForUser({ userId, title, content }) {
      return await query(
        `with input as (
           select convert_from(decode(:'payload', 'base64'), 'utf8')::jsonb data
         )
         insert into documents (user_id, title, content, content_sha256, token_estimate, metadata)
         select
           (data->>'userId')::uuid,
           data->>'title',
           data->>'content',
           data->>'contentSha256',
           (data->>'tokenEstimate')::integer,
           '{}'::jsonb
         from input
         returning ${documentJson};`,
        {
          userId,
          title,
          content,
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
             and deleted_at is null
         ), 'null'::json);`,
        { documentId, userId },
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
  };

  return { users, documentsRepository };
}
