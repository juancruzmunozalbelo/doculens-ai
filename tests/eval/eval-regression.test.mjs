import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function evalScriptEnv(envOverrides = {}) {
  const env = {
    ...process.env,
    AI_PROVIDER: 'minimax',
    DOCULENS_EVAL_USE_DETERMINISTIC_FAKES: 'true',
    DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX: 'false',
    MINIMAX_API_KEY: 'MINIMAX_EVAL_REDACTION_CANARY',
    JWT_SECRET: 'JWT_EVAL_REDACTION_CANARY_WITH_ENTROPY',
    DATABASE_URL: 'postgresql://doculens_eval:DATABASE_PASSWORD_EVAL_CANARY@127.0.0.1:65432/doculens_eval',
    AUTHORIZATION: 'Bearer AUTHORIZATION_EVAL_CANARY',
    RAW_DOCUMENT_CANARY: 'RAW_DOCUMENT_CANARY:EVAL_DOCUMENT_TEXT_MUST_NOT_LEAK',
    FULL_PROMPT_CANARY: 'FULL_PROMPT_CANARY:EVAL_FULL_PROMPT_MUST_NOT_LEAK',
    PROVIDER_RESPONSE_CANARY: 'PROVIDER_RESPONSE_CANARY:EVAL_PROVIDER_RESPONSE_MUST_NOT_LEAK',
    ...envOverrides,
  };
  return env;
}

function runNodeScript(script, envOverrides = {}) {
  const env = evalScriptEnv(envOverrides);
  return spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

function runNodeScriptAsync(script, envOverrides = {}) {
  const env = evalScriptEnv(envOverrides);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    child.on('error', reject);
    child.on('close', (status, signal) => {
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function combinedOutput(result) {
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

function sanitizedOutput(result, extraSecrets = {}) {
  return redactSecrets(combinedOutput(result), {
    minimaxApiKey: 'MINIMAX_EVAL_REDACTION_CANARY',
    jwtSecret: 'JWT_EVAL_REDACTION_CANARY_WITH_ENTROPY',
    databaseUrl: 'postgresql://doculens_eval:DATABASE_PASSWORD_EVAL_CANARY@127.0.0.1:65432/doculens_eval',
    databasePassword: 'DATABASE_PASSWORD_EVAL_CANARY',
    authorizationHeader: 'Bearer AUTHORIZATION_EVAL_CANARY',
    rawDocumentText: 'RAW_DOCUMENT_CANARY:EVAL_DOCUMENT_TEXT_MUST_NOT_LEAK',
    fullPrompt: 'FULL_PROMPT_CANARY:EVAL_FULL_PROMPT_MUST_NOT_LEAK',
    providerResponse: 'PROVIDER_RESPONSE_CANARY:EVAL_PROVIDER_RESPONSE_MUST_NOT_LEAK',
    ...extraSecrets,
  });
}

function assertContainsContractLines(output, requiredLines) {
  const missing = requiredLines
    .filter(({ pattern }) => !pattern.test(output))
    .map(({ task, contract }) => `${task}: ${contract}`);
  assert.deepEqual(missing, [], `missing eval output contract lines:\n${missing.join('\n')}`);
}

test('npm run eval produces reviewer-readable pass/skip/fail evidence for PR8 eval tasks without live credentials', () => {
  const result = runNodeScript('scripts/checks/eval-contract.mjs');
  const output = sanitizedOutput(result);

  assert.equal(result.status, 0, `eval runner must complete deterministic fake-mode checks without live MiniMax or PostgreSQL credentials; output:\n${output}`);
  assertContainsContractLines(output, [
    {
      task: '7.1',
      contract: 'executable eval runner declares PostgreSQL persistence and MiniMax provider mode',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.1\b.*npm run eval.*postgresql.*minimax/im,
    },
    {
      task: '7.2',
      contract: 'seeded demo user, second authz user, seeded document, adversarial section, and chunks are verified',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.2\b.*seeded.*user.*second.*document.*adversarial.*chunk/im,
    },
    {
      task: '7.3',
      contract: 'supported seeded question returns top-k retrieval and context strategy rag',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.3\b.*top-?k.*context strategy.*rag/im,
    },
    {
      task: '7.4',
      contract: 'fallback question records fallback metadata, score summary, uncertainty, and citation policy',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.4\b.*fallback.*retrieval score.*uncertainty.*citation/im,
    },
    {
      task: '7.5',
      contract: 'analysis schema and MiniMax provider/model metadata are verified',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.5\b.*analysis schema.*MiniMax-M3.*metadata/im,
    },
    {
      task: '7.6',
      contract: 'chat citations are restricted to retrieved chunk IDs',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.6\b.*citation.*retrieved chunk/im,
    },
    {
      task: '7.7',
      contract: 'unsupported seeded question refuses without fabricated citations',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.7\b.*unsupported.*refus.*no fabricated citation/im,
    },
    {
      task: '7.8',
      contract: 'prompt-injection attempt is ignored and secrets/prompts are not exposed',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.8\b.*prompt.?injection.*ignored.*secret.*citation/im,
    },
    {
      task: '7.9',
      contract: 'second user is denied document, analysis, messages, chunks, citations, chat, and delete access',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.9\b.*second user.*document.*analysis.*message.*chunk.*citation.*chat.*delete/im,
    },
    {
      task: '7.10',
      contract: 'eval emits concise pass/fail lines and summarizes failures before exit',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.10\b.*concise.*pass.*fail.*non-zero/im,
    },
    {
      task: '7.14',
      contract: 'budget/rate gate proves over-budget requests skip provider invocation and reports usage totals',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.14\b.*budget.*provider invocation.*calls=4.*inputTokens=2048.*outputTokens=384.*budgetTransportCalls=0/im,
    },
    {
      task: '7.15',
      contract: 'redaction canaries cover stdout, stderr, app logs, eval output, errors, and provider logs',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.15\b.*redaction.*stdout.*stderr.*app logs.*eval output.*error.*provider/im,
    },
    {
      task: '7.16',
      contract: 'PostgreSQL integrity checks are run or explicitly gated',
      pattern: /^(PASS|SKIP|FAIL)\s+7\.16\b.*PostgreSQL.*foreign key.*unique chunk.*same-document.*rollback.*idempoten/im,
    },
  ]);
});

test('live MiniMax eval gate reaches provider transport before budget rejection', async (t) => {
  const liveApiKey = 'sk-minimax_live_eval_budget_1234567890';
  const providerRequests = [];
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      providerRequests.push({
        method: request.method,
        url: request.url,
        body: JSON.parse(body),
      });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        id: 'loopback-live-eval-response',
        model: 'MiniMax-M3',
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Loopback MiniMax eval response reached transport after budget validation.',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 42, completion_tokens: 7, total_tokens: 49 },
      }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
  }));

  const address = server.address();
  assert.equal(typeof address, 'object', 'loopback MiniMax server must bind to a local TCP port');
  const result = await runNodeScriptAsync('scripts/checks/eval-contract.mjs', {
    DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX: 'true',
    MINIMAX_API_KEY: liveApiKey,
    MINIMAX_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
  });
  const output = sanitizedOutput(result, { minimaxApiKey: liveApiKey });

  assert.equal(
    result.status,
    0,
    `live MiniMax eval gate must complete against loopback transport without rejecting its own max output token request as over-budget; output:\n${output}`,
  );
  assert.equal(providerRequests.length, 1, 'live MiniMax eval gate must perform exactly one loopback provider request');
  assert.deepEqual(
    {
      method: providerRequests[0].method,
      url: providerRequests[0].url,
      model: providerRequests[0].body.model,
      maxTokens: providerRequests[0].body.max_tokens,
    },
    {
      method: 'POST',
      url: '/v1/chat/completions',
      model: 'MiniMax-M3',
      maxTokens: 400,
    },
    'live MiniMax eval request must use the provider/model/output-token contract accepted by the budget gate',
  );
});

test('eval output redacts injected secret, document, prompt, and provider-response canaries', () => {
  const result = runNodeScript('scripts/checks/eval-contract.mjs');
  const output = combinedOutput(result);
  const canaries = [
    'MINIMAX_EVAL_REDACTION_CANARY',
    'JWT_EVAL_REDACTION_CANARY_WITH_ENTROPY',
    'DATABASE_PASSWORD_EVAL_CANARY',
    'AUTHORIZATION_EVAL_CANARY',
    'RAW_DOCUMENT_CANARY:EVAL_DOCUMENT_TEXT_MUST_NOT_LEAK',
    'FULL_PROMPT_CANARY:EVAL_FULL_PROMPT_MUST_NOT_LEAK',
    'PROVIDER_RESPONSE_CANARY:EVAL_PROVIDER_RESPONSE_MUST_NOT_LEAK',
  ];

  for (const canary of canaries) {
    assert.equal(output.includes(canary), false, `eval output leaked redaction canary ${canary}`);
  }
});
