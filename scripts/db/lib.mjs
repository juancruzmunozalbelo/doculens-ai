import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

export const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

export function requireDatabaseUrl(env = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for PostgreSQL database commands');
  }
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return databaseUrl;
}

export async function sortedSqlFiles(relativeDir) {
  const dir = path.join(repoRoot, relativeDir);
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

export function runPsql(filePath, env = process.env) {
  const databaseUrl = requireDatabaseUrl(env);
  const result = spawnSync('psql', [databaseUrl, '--set', 'ON_ERROR_STOP=1', '--file', filePath], {
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    throw new Error(redactSecrets(`Unable to run psql for ${path.relative(repoRoot, filePath)}: ${result.error.message}`, [databaseUrl]));
  }
  if (result.status !== 0) {
    throw new Error(`psql failed for ${path.relative(repoRoot, filePath)} with exit code ${result.status}`);
  }
}

export async function applySqlFiles(relativeDir, env = process.env) {
  for (const filePath of await sortedSqlFiles(relativeDir)) {
    console.log(`Applying ${path.relative(repoRoot, filePath)}`);
    runPsql(filePath, env);
  }
}
