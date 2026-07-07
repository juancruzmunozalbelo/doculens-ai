import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composeCandidates = ['compose.yaml', 'compose.yml', 'docker-compose.yml', 'docker-compose.yaml'];
const composeCli = process.env.DOCULENS_COMPOSE_CLI || 'docker-compose';

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

async function findComposeFile() {
  for (const candidate of composeCandidates) {
    try {
      await access(path.join(repoRoot, candidate));
      return candidate;
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  assert.fail(`Docker Compose file is missing; expected one of: ${composeCandidates.join(', ')}`);
}

function composeConfig(composeFile, { noInterpolate = false } = {}) {
  const args = ['-f', composeFile, 'config', '--format', 'json'];
  if (noInterpolate) {
    args.push('--no-interpolate');
  }

  const result = spawnSync(composeCli, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DOCULENS_COMPOSE_CLI: process.env.DOCULENS_COMPOSE_CLI,
    },
  });

  if (result.error && result.error.code === 'ENOENT') {
    assert.fail(`${composeCli} is required to validate the Docker Compose contract`);
  }
  assert.equal(
    result.status,
    0,
    `${composeCli} ${args.join(' ')} must parse successfully\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );

  return JSON.parse(result.stdout);
}

function getService(model, serviceName) {
  const service = model.services?.[serviceName];
  assert.equal(typeof service, 'object', `docker compose service "${serviceName}" is required`);
  return service;
}

function normalizeEnvironment(environment) {
  if (!environment) {
    return new Map();
  }
  if (Array.isArray(environment)) {
    return new Map(environment.map((entry) => {
      const separator = entry.indexOf('=');
      return separator === -1 ? [entry, ''] : [entry.slice(0, separator), entry.slice(separator + 1)];
    }));
  }
  return new Map(Object.entries(environment));
}

function assertHasPort(service, serviceName, publishedPort, targetPort) {
  const ports = service.ports ?? [];
  const hasPort = ports.some((entry) => {
    if (typeof entry === 'string') {
      return entry === `${publishedPort}:${targetPort}` || entry === `${publishedPort}:${targetPort}/tcp`;
    }
    return Number(entry.published) === publishedPort && Number(entry.target) === targetPort;
  });

  assert.equal(hasPort, true, `${serviceName} must publish host port ${publishedPort} to container port ${targetPort}`);
}

async function assertBuildsFromDockerfile(service, serviceName, dockerfileName) {
  assert.equal(typeof service.build, 'object', `${serviceName} must be built from a local Dockerfile`);
  const context = service.build.context ?? '.';
  assert.equal(path.resolve(repoRoot, context), repoRoot, `${serviceName} build context must be the repository root`);
  assert.equal(service.build.dockerfile, dockerfileName, `${serviceName} must build from ${dockerfileName}`);
  await access(path.join(repoRoot, dockerfileName));
}

function assertDependsOn(service, serviceName, dependencyName, condition) {
  const dependency = service.depends_on?.[dependencyName];
  assert.equal(typeof dependency, 'object', `${serviceName} must depend on ${dependencyName}`);
  if (condition) {
    assert.equal(
      dependency.condition,
      condition,
      `${serviceName} must wait for ${dependencyName} with condition ${condition}`,
    );
  }
}

function assertNoSecretMaterial(label, contents) {
  assert.doesNotMatch(contents, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, `${label} must not embed private keys`);
  assert.doesNotMatch(contents, /\bsk-[A-Za-z0-9_-]{20,}\b/, `${label} must not embed API keys`);
  assert.doesNotMatch(contents, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, `${label} must not embed JWTs`);
  assert.doesNotMatch(contents, /(?:MINIMAX_API_KEY|JWT_SECRET|POSTGRES_PASSWORD)\s*[:=]\s*[A-Za-z0-9_+=/-]{24,}/, `${label} must keep secret values as placeholders or interpolation variables`);
}

function assertEnvironmentKeys(service, serviceName, requiredKeys) {
  const environment = normalizeEnvironment(service.environment);
  for (const key of requiredKeys) {
    assert.equal(environment.has(key), true, `${serviceName} environment must define ${key}`);
  }
  return environment;
}

test('package exposes a targeted Docker contract command', async () => {
  const packageJson = JSON.parse(await readRequired('package.json', 'Node package manifest'));
  assert.equal(
    packageJson.scripts?.['test:docker'],
    'node --test tests/docker/docker-contract.test.mjs',
    'package.json scripts.test:docker must run the Docker contract test directly',
  );
});

test('Docker Compose wires frontend, backend, and PostgreSQL as separate local services', async () => {
  const composeFile = await findComposeFile();
  const composeText = await readRequired(composeFile, 'Docker Compose configuration');
  assertNoSecretMaterial(composeFile, composeText);

  const model = composeConfig(composeFile);
  const uninterpolatedModel = composeConfig(composeFile, { noInterpolate: true });

  const frontend = getService(model, 'frontend');
  const backend = getService(model, 'backend');
  const db = getService(model, 'db');
  const frontendRaw = getService(uninterpolatedModel, 'frontend');
  const backendRaw = getService(uninterpolatedModel, 'backend');
  const dbRaw = getService(uninterpolatedModel, 'db');

  await assertBuildsFromDockerfile(frontend, 'frontend', 'Dockerfile.frontend');
  await assertBuildsFromDockerfile(backend, 'backend', 'Dockerfile.backend');
  assert.equal(db.image, 'postgres:16-alpine', 'db must use the PostgreSQL 16 Alpine image');

  assertHasPort(frontend, 'frontend', 5173, 5173);
  assertHasPort(backend, 'backend', 3000, 3000);
  assertHasPort(db, 'db', 5432, 5432);

  assertDependsOn(backend, 'backend', 'db', 'service_healthy');
  assertDependsOn(frontend, 'frontend', 'backend');

  const backendEnvironment = assertEnvironmentKeys(backendRaw, 'backend', [
    'DATABASE_URL',
    'AI_PROVIDER',
    'MINIMAX_API_KEY',
    'MINIMAX_BASE_URL',
    'MINIMAX_MODEL',
    'JWT_SECRET',
    'PORT',
    'HOST',
  ]);
  assert.match(
    String(backendEnvironment.get('DATABASE_URL')),
    /db:5432/,
    'backend DATABASE_URL must address the compose db service, not localhost',
  );

  const dbEnvironment = assertEnvironmentKeys(dbRaw, 'db', ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD']);
  for (const key of ['MINIMAX_API_KEY', 'JWT_SECRET', 'POSTGRES_PASSWORD']) {
    const environment = key === 'POSTGRES_PASSWORD' ? dbEnvironment : backendEnvironment;
    assert.match(
      String(environment.get(key)),
      /^\$\{[A-Z0-9_]+(?::[-?][^}]*)?\}$/,
      `${key} must be provided via compose interpolation instead of a hard-coded secret`,
    );
  }

  const dbVolume = (db.volumes ?? []).find((volume) => volume?.target === '/var/lib/postgresql/data');
  assert.equal(typeof dbVolume, 'object', 'db must persist PostgreSQL data at /var/lib/postgresql/data');
  assert.equal(typeof model.volumes?.[dbVolume.source], 'object', 'db PostgreSQL data must use a named compose volume');

  const healthcheckCommand = Array.isArray(db.healthcheck?.test) ? db.healthcheck.test.join(' ') : String(db.healthcheck?.test ?? '');
  assert.match(healthcheckCommand, /pg_isready/, 'db healthcheck must verify PostgreSQL readiness with pg_isready');
});
