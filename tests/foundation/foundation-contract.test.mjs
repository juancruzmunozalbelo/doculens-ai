import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function readRequired(relativePath, purpose) {
  try {
    return await readFile(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

async function importRequired(relativePath, exportNames, purpose) {
  const modulePath = path.join(repoRoot, relativePath);
  try {
    const imported = await import(`${pathToFileURL(modulePath).href}?foundation=${Date.now()}`);
    for (const exportName of exportNames) {
      if (typeof imported[exportName] === 'function') {
        return imported[exportName];
      }
    }
    assert.fail(`${purpose} must export one of: ${exportNames.join(', ')}`);
  } catch (error) {
    if (error && (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT')) {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

function parseEnvExample(contents) {
  const entries = new Map();
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    assert.notEqual(separator, -1, `.env.example line ${index + 1} must use KEY=value syntax`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    assert.match(key, /^[A-Z][A-Z0-9_]*$/, `.env.example line ${index + 1} has an invalid key`);
    assert.equal(entries.has(key), false, `.env.example must not define ${key} more than once`);
    entries.set(key, value);
  }
  return entries;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadMigrationSql() {
  const migrationsDir = path.join(repoRoot, 'db/migrations');
  let entries;
  try {
    entries = await readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      assert.fail('PostgreSQL migrations are missing at db/migrations');
    }
    throw error;
  }

  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
  assert.notEqual(sqlFiles.length, 0, 'db/migrations must contain at least one SQL migration');

  const migrationTexts = await Promise.all(
    sqlFiles.map(async (fileName) => readFile(path.join(migrationsDir, fileName), 'utf8')),
  );
  return migrationTexts.join('\n');
}

test('package scripts expose the foundation development, database, test, eval, and verification commands', async () => {
  const packageJson = JSON.parse(await readRequired('package.json', 'Node package manifest'));
  const scripts = packageJson.scripts ?? {};
  const requiredScripts = new Map([
    ['dev', 'local app scaffold command'],
    ['db:migrate', 'PostgreSQL migration command'],
    ['db:reset', 'PostgreSQL reset command'],
    ['db:seed', 'PostgreSQL demo seed command'],
    ['test:unit', 'unit test command'],
    ['test:integration', 'integration test command'],
    ['test:e2e', 'Playwright E2E command'],
    ['smoke:markitdown', 'MarkItDown smoke command'],
    ['eval', 'reliability eval command'],
    ['verify', 'combined verification command'],
    ['guard:tdd', 'TDD guardrail command'],
  ]);

  for (const [scriptName, label] of requiredScripts) {
    assert.equal(typeof scripts[scriptName], 'string', `${label}: package.json scripts.${scriptName} is required`);
    assert.match(scripts[scriptName], /\S/, `${label}: package.json scripts.${scriptName} must not be empty`);
    assert.doesNotMatch(
      scripts[scriptName],
      /\b(?:true|exit\s+0)\b|TODO|placeholder|not implemented/i,
      `${label}: package.json scripts.${scriptName} must be wired to a real command, not a no-op`,
    );
  }
});

test('.env.example documents only placeholders for PostgreSQL, MiniMax, and JWT configuration', async () => {
  const envExample = parseEnvExample(await readRequired('.env.example', 'placeholder environment example'));
  const requiredKeys = [
    'DATABASE_URL',
    'AI_PROVIDER',
    'MINIMAX_API_KEY',
    'MINIMAX_BASE_URL',
    'MINIMAX_MODEL',
    'JWT_SECRET',
  ];
  const placeholderPattern = /^(?:<[^>\r\n]+>|CHANGE_ME[A-Z0-9_-]*|YOUR_[A-Z0-9_-]+|your[-_][a-z0-9_-]+)$/;
  const secretLikePattern = /(?:eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|[A-Za-z0-9_+=/-]{48,})/;

  for (const key of requiredKeys) {
    assert.equal(envExample.has(key), true, `.env.example must document ${key}`);
    const value = envExample.get(key);
    assert.match(value, placeholderPattern, `.env.example ${key} must be a placeholder, not a usable local default or secret`);
    assert.doesNotMatch(value, secretLikePattern, `.env.example ${key} must not contain secret-looking material`);
  }
});

test('runtime configuration rejects weak or default JWT_SECRET outside explicit test mode', async () => {
  const loadServerConfig = await importRequired(
    'src/server/config/env.mjs',
    ['loadServerConfig', 'loadConfig'],
    'server environment loader',
  );
  const baseEnv = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://doculens_test:doculens_test@localhost:5432/doculens_test',
    AI_PROVIDER: 'minimax',
    MINIMAX_API_KEY: 'placeholder-for-contract-test',
    MINIMAX_BASE_URL: 'https://api.minimax.chat/v1',
    MINIMAX_MODEL: 'MiniMax-M3',
  };

  await assert.rejects(
    () => Promise.resolve(loadServerConfig({ ...baseEnv, JWT_SECRET: 'secret' })),
    /JWT_SECRET.*(?:weak|default|insecure)|(?:weak|default|insecure).*JWT_SECRET/i,
    'weak/default JWT_SECRET values must fail closed outside explicit test mode',
  );
  await assert.doesNotReject(
    () => Promise.resolve(loadServerConfig({ ...baseEnv, NODE_ENV: 'test', DOCULENS_ALLOW_WEAK_JWT_SECRET: 'true', JWT_SECRET: 'secret' })),
    'explicit test mode may opt into weak JWT_SECRET values for deterministic tests only',
  );
});

test('central redaction utility removes configured secret, document, and prompt canaries from logs', async () => {
  const redactSecrets = await importRequired(
    'src/server/security/redact.mjs',
    ['redactSecrets', 'redactSensitive'],
    'central redaction utility',
  );
  const canaries = [
    'mm_canary_api_key_for_contract_test',
    'jwt_canary_secret_for_contract_test',
    'postgresql://doculens:db_canary_password@localhost:5432/doculens',
    'Bearer authorization_canary_token_for_contract_test',
    'document_text_canary_for_contract_test',
    'full_prompt_canary_for_contract_test',
  ];
  const input = `MiniMax key ${canaries[0]} JWT ${canaries[1]} database ${canaries[2]} auth ${canaries[3]} doc ${canaries[4]} prompt ${canaries[5]}`;

  const output = redactSecrets(input, canaries);
  assert.equal(typeof output, 'string', 'redactSecrets must return a string that is safe to log');
  for (const canary of canaries) {
    assert.doesNotMatch(output, new RegExp(escapeRegExp(canary)), `redacted output leaked canary: ${canary}`);
  }
  assert.match(output, /\[REDACTED(?::[A-Z_]+)?\]/, 'redacted output should mark removed sensitive material');
});

test('PostgreSQL migrations define the core owned document, AI metadata, message, and citation relationships', async () => {
  const sql = await loadMigrationSql();
  const requiredTables = [
    'users',
    'documents',
    'document_chunks',
    'document_analyses',
    'chat_messages',
    'message_citations',
    'ai_prompts',
  ];
  for (const tableName of requiredTables) {
    assert.match(
      sql,
      new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\b`, 'i'),
      `migration SQL must create ${tableName}`,
    );
  }

  const requiredRelationships = [
    ['documents', 'user_id', 'users'],
    ['document_chunks', 'document_id', 'documents'],
    ['document_analyses', 'document_id', 'documents'],
    ['chat_messages', 'document_id', 'documents'],
    ['message_citations', 'message_id', 'chat_messages'],
    ['message_citations', 'chunk_id', 'document_chunks'],
  ];
  for (const [tableName, columnName, referencedTable] of requiredRelationships) {
    assert.match(
      sql,
      new RegExp(`${tableName}[\\s\\S]*${columnName}[\\s\\S]*references\\s+${referencedTable}\\s*\\(`, 'i'),
      `migration SQL must relate ${tableName}.${columnName} to ${referencedTable}.id`,
    );
  }

  assert.match(sql, /token_estimate|token_count|input_tokens|output_tokens/i, 'migration SQL must persist token estimates');
  assert.match(sql, /fallback_reason|context_strategy/i, 'migration SQL must persist fallback/context metadata');
  assert.match(sql, /prompt_version|prompt_id|ai_prompts/i, 'migration SQL must persist prompt metadata');
});
