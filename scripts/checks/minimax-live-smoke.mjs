import { createMiniMaxProvider, MINIMAX_DEFAULTS } from '../../apps/api/src/server/ai/minimax-provider.mjs';
import { redactSecrets } from '../../apps/api/src/server/security/redact.mjs';

function isLiveOptIn(env) {
  return env.DOCULENS_LIVE_MINIMAX === 'true' || env.DOCULENS_LIVE_MINIMAX === '1';
}

function safeLog(log, entry, secrets) {
  if (typeof log === 'function') {
    log(redactSecrets(entry, secrets));
  }
}

function requiredApiKey(env) {
  const apiKey = env.MINIMAX_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('MINIMAX_API_KEY is required for live MiniMax smoke');
  }
  return apiKey.trim();
}

function requireHttpsBaseUrl(value) {
  const baseUrl = String(value || MINIMAX_DEFAULTS.baseUrl).trim();
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('MINIMAX_BASE_URL must be an HTTPS URL for live MiniMax smoke');
  }
  return baseUrl;
}

function safeTokenUsage(tokenUsage) {
  return {
    input: tokenUsage?.input ?? null,
    output: tokenUsage?.output ?? null,
    total: tokenUsage?.total ?? null,
  };
}

export async function runMiniMaxLiveSmoke({
  env = process.env,
  transport,
  log = console.log,
  budget = { maxLiveCalls: 1, usedLiveCalls: 0, maxOutputTokens: 64, maxInputTokens: 2048, maxContextTokens: 2048 },
} = {}) {
  const secrets = { minimaxApiKey: env.MINIMAX_API_KEY };
  if (!isLiveOptIn(env)) {
    safeLog(log, 'MiniMax live smoke skipped: set DOCULENS_LIVE_MINIMAX=true to opt in to third-party document transfer.', secrets);
    throw new Error('DOCULENS_LIVE_MINIMAX opt-in is required before any live MiniMax transport call');
  }

  const apiKey = requiredApiKey(env);
  secrets.minimaxApiKey = apiKey;
  safeLog(log, {
    event: 'minimax_live_smoke_start',
    disclosure: 'Live MiniMax mode sends the smoke prompt to a third-party provider; logs include metadata only.',
    provider: 'minimax',
    model: env.MINIMAX_MODEL || MINIMAX_DEFAULTS.model,
  }, secrets);

  const provider = createMiniMaxProvider({
    apiKey,
    baseUrl: requireHttpsBaseUrl(env.MINIMAX_BASE_URL),
    model: env.MINIMAX_MODEL || MINIMAX_DEFAULTS.model,
    transport,
    budget,
    maxOutputTokens: 64,
  });

  const response = await provider.answerQuestion({
    documentId: 'smoke-doc',
    userId: 'smoke-user',
    question: 'Reply with a concise smoke-test acknowledgement.',
    prompt: { id: 'doculens.chat', version: '2026-07-07.1' },
    context: {
      strategy: 'rag',
      retrievalBackend: 'smoke',
      fallbackReason: null,
      chunks: [{ chunkId: 'smoke-chunk', headingPath: ['Smoke'], text: 'DocuLens MiniMax live smoke validation evidence.' }],
    },
    secrets,
  });

  const result = {
    ok: true,
    provider: response.metadata.provider,
    model: response.metadata.model,
    responseId: response.metadata.providerResponseId,
    tokenUsage: safeTokenUsage(response.metadata.tokenUsage),
  };
  safeLog(log, { event: 'minimax_live_smoke_ok', ...result }, { ...secrets, providerResponse: response.answer });
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMiniMaxLiveSmoke()
    .then((result) => {
      console.log(redactSecrets(JSON.stringify(result)));
    })
    .catch((error) => {
      console.error(redactSecrets(error, { minimaxApiKey: process.env.MINIMAX_API_KEY }));
      process.exitCode = 1;
    });
}
