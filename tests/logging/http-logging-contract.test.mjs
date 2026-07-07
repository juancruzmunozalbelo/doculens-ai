import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiServerEntry = 'apps/api/src/server/index.mjs';
const jwtSecret = 'LoggingContractJwtSecretWithEnoughEntropy123';

async function importRequired(relativePath, exportNames, purpose) {
  const modulePath = path.join(repoRoot, relativePath);
  try {
    const imported = await import(`${pathToFileURL(modulePath).href}?logging_contract=${Date.now()}-${Math.random()}`);
    for (const exportName of exportNames) {
      if (typeof imported[exportName] === 'function') return imported[exportName];
    }
    assert.fail(`${purpose} must export one of: ${exportNames.join(', ')}`);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'ENOENT') {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

function testConfig() {
  return Object.freeze({
    nodeEnv: 'test',
    databaseUrl: 'postgresql://logger:logging_db_password_canary@127.0.0.1:5432/doculens_logging',
    jwtSecret,
    aiProvider: 'minimax',
    minimax: Object.freeze({
      apiKey: 'minimax-test-key-logging-contract-canary',
      baseUrl: 'https://api.minimax.io/v1',
      model: 'MiniMax-M3',
    }),
  });
}

function normalizeLogEntry(level, entry) {
  const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
  assert.equal(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), true, `${level} log entries must be structured JSON objects or JSON object strings`);
  return { level, ...parsed };
}

function createRecordingLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      info(entry) {
        entries.push(normalizeLogEntry('info', entry));
      },
      warn(entry) {
        entries.push(normalizeLogEntry('warn', entry));
      },
      error(entry) {
        entries.push(normalizeLogEntry('error', entry));
      },
    },
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object', 'test server must listen on an ephemeral TCP port');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function requestIdFrom(response) {
  return response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');
}

function field(entry, names) {
  for (const name of names) {
    if (entry[name] !== undefined) return entry[name];
  }
  return undefined;
}

function assertHttpLog(entry, { requestId, method, route, statusCode }) {
  assert.equal(field(entry, ['requestId', 'request_id', 'correlationId']), requestId, 'HTTP log must carry the response request ID');
  assert.equal(field(entry, ['method', 'httpMethod']), method, 'HTTP log must include request method');
  assert.equal(field(entry, ['route', 'path', 'url']), route, 'HTTP log must include the matched route/path');
  assert.equal(field(entry, ['statusCode', 'status', 'httpStatus']), statusCode, 'HTTP log must include response status code');
  const duration = field(entry, ['durationMs', 'duration_ms', 'elapsedMs']);
  assert.equal(typeof duration, 'number', 'HTTP log must include numeric duration metadata');
  assert.equal(Number.isFinite(duration) && duration >= 0, true, 'HTTP log duration must be a finite non-negative number');
}

function serializedLogs(entries) {
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}

async function createServerHarness(overrides = {}) {
  const createDocuLensServer = await importRequired(apiServerEntry, ['createDocuLensServer'], 'DocuLens API server factory');
  const recording = createRecordingLogger();
  const server = createDocuLensServer({ ...testConfig(), logger: recording.logger }, { logger: recording.logger, ...overrides });
  const baseUrl = await listen(server);
  return { baseUrl, server, logs: recording.entries };
}

test('HTTP responses include a request ID and successful requests emit structured route/status/duration logs', async () => {
  const { baseUrl, server, logs } = await createServerHarness();
  try {
    const response = await fetch(`${baseUrl}/health`, { headers: { accept: 'application/json' } });
    assert.equal(response.status, 200, 'health request must succeed before logging can prove the success path');
    const requestId = requestIdFrom(response);
    assert.match(requestId ?? '', /^[A-Za-z0-9._:-]{8,}$/, 'HTTP response must include a stable request ID header');

    const accessLog = logs.find((entry) => field(entry, ['requestId', 'request_id', 'correlationId']) === requestId && Number(field(entry, ['statusCode', 'status', 'httpStatus'])) === 200);
    assert.ok(accessLog, `expected one structured access log carrying request ID ${requestId}; logs:\n${serializedLogs(logs)}`);
    assertHttpLog(accessLog, { requestId, method: 'GET', route: '/health', statusCode: 200 });
  } finally {
    await close(server);
  }
});

test('HTTP error logs are structured and redact raw body, password, document, prompt, and secret canaries', async () => {
  const canaries = {
    password: 'P@ssw0rd_raw_body_logging_canary',
    document: 'DOCUMENT_LOG_CANARY_acquisition_price_123456',
    prompt: 'PROMPT_LOG_CANARY_ignore_previous_instructions',
    secret: 'SECRET_LOG_CANARY_must_not_print',
    databasePassword: 'logging_db_password_canary',
    minimaxKey: 'minimax-test-key-logging-contract-canary',
  };
  const { baseUrl, server, logs } = await createServerHarness({
    auth: {
      async authenticateBearerToken(token) {
        return token === 'logging-test-token' ? { id: 'user-logging', email: 'logger@example.test' } : null;
      },
    },
    documentAi: {
      async answerQuestion() {
        throw new Error(`provider failed with ${canaries.document} ${canaries.prompt} ${canaries.secret} ${canaries.databasePassword} ${canaries.minimaxKey}`);
      },
    },
  });

  try {
    const response = await fetch(`${baseUrl}/api/documents/doc-logging/chat`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: 'Bearer logging-test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        password: canaries.password,
        document: canaries.document,
        prompt: canaries.prompt,
        question: `Summarize without leaking ${canaries.secret}`,
      }),
    });
    assert.equal(response.status, 500, 'forced provider failure must exercise the HTTP error logging path');
    const requestId = requestIdFrom(response);
    assert.match(requestId ?? '', /^[A-Za-z0-9._:-]{8,}$/, 'error response must include the same request ID header contract as success responses');
    const responseText = await response.text();
    for (const canary of Object.values(canaries)) {
      assert.equal(responseText.includes(canary), false, `HTTP error response leaked ${canary}`);
    }

    const errorLog = logs.find((entry) => field(entry, ['requestId', 'request_id', 'correlationId']) === requestId && Number(field(entry, ['statusCode', 'status', 'httpStatus'])) === 500);
    assert.ok(errorLog, `expected one structured error log carrying request ID ${requestId}; logs:\n${serializedLogs(logs)}`);
    assertHttpLog(errorLog, { requestId, method: 'POST', route: '/api/documents/doc-logging/chat', statusCode: 500 });

    const combinedLogs = serializedLogs(logs);
    for (const canary of Object.values(canaries)) {
      assert.equal(combinedLogs.includes(canary), false, `structured logs leaked ${canary}`);
    }
    assert.match(combinedLogs, /\[REDACTED(?::[A-Z_]+)?\]|redacted/i, 'error logs must preserve an explicit redaction marker for operators');
  } finally {
    await close(server);
  }
});
