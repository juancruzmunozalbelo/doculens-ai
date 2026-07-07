import { redactSecrets } from '../security/redact.mjs';
import { assertAIProvider } from './provider.mjs';
import { buildPromptMessages } from './prompts/builder.mjs';
import { getPromptDefinition, PROMPT_VERSION } from './prompts/registry.mjs';

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M3';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 800;
const CHARS_PER_TOKEN_ESTIMATE = 4;

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl) {
  const normalized = trimTrailingSlash(baseUrl);
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function estimateTokensForMessages(messages) {
  const characterCount = messages.reduce((total, message) => total + String(message.content ?? '').length + String(message.role ?? '').length, 0);
  return Math.ceil(characterCount / CHARS_PER_TOKEN_ESTIMATE);
}

function normalizeBudget(budget = {}) {
  return {
    maxLiveCalls: budget.maxLiveCalls ?? 1,
    usedLiveCalls: budget.usedLiveCalls ?? 0,
    maxInputTokens: budget.maxInputTokens ?? 16_000,
    maxOutputTokens: budget.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    maxContextTokens: budget.maxContextTokens ?? 16_000,
    timeoutMs: budget.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: budget.maxRetries ?? 0,
    concurrencyLimit: budget.concurrencyLimit ?? 1,
    activeCalls: budget.activeCalls ?? 0,
    maxEstimatedCostUsd: budget.maxEstimatedCostUsd ?? Number.POSITIVE_INFINITY,
    estimatedCostUsd: budget.estimatedCostUsd ?? 0,
  };
}

function assertWithinBudget({ budget, estimatedInputTokens, requestedOutputTokens }) {
  if (budget.usedLiveCalls >= budget.maxLiveCalls) {
    throw new Error('MiniMax live call budget exceeded before transport invocation');
  }
  if (budget.activeCalls >= budget.concurrencyLimit) {
    throw new Error('MiniMax live call concurrency budget exceeded before transport invocation');
  }
  if (estimatedInputTokens > budget.maxInputTokens || estimatedInputTokens > budget.maxContextTokens) {
    throw new Error('MiniMax request is over-budget for input/context tokens before transport invocation');
  }
  if (requestedOutputTokens > budget.maxOutputTokens) {
    throw new Error('MiniMax request is over-budget for output tokens before transport invocation');
  }
  if (budget.estimatedCostUsd > budget.maxEstimatedCostUsd) {
    throw new Error('MiniMax request is over-budget for estimated live-call cost before transport invocation');
  }
  if (budget.timeoutMs <= 0 || budget.maxRetries < 0) {
    throw new Error('MiniMax live call timeout/retry budget is invalid');
  }
}

async function fetchTransport(request) {
  if (typeof fetch !== 'function') {
    throw new Error('global fetch is required for MiniMax live transport');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }
    if (!response.ok) {
      const error = new Error(`MiniMax transport failed with HTTP ${response.status}`);
      error.status = response.status;
      error.providerResponse = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function responseContent(providerResponse) {
  const choice = providerResponse?.choices?.[0];
  return choice?.message?.content ?? choice?.text ?? providerResponse?.output_text ?? '';
}

function parseJsonContent(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    return {};
  }
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : { answer: String(parsed) };
  } catch {
    return { answer: content };
  }
}

function tokenUsageFrom(providerResponse) {
  const usage = providerResponse?.usage ?? {};
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.total_prompt_tokens ?? null;
  const output = usage.completion_tokens ?? usage.output_tokens ?? null;
  const total = usage.total_tokens ?? (Number.isFinite(input) && Number.isFinite(output) ? input + output : null);
  return { input, output, total };
}

function metadataFrom({ providerResponse, model, prompt, context, estimatedInputTokens }) {
  const metadata = {
    provider: 'minimax',
    model,
    promptId: prompt.id,
    promptVersion: prompt.version,
    contextStrategy: context?.strategy ?? null,
    retrievalBackend: context?.retrievalBackend ?? null,
    fallbackReason: context?.fallbackReason ?? null,
    providerResponseId: providerResponse?.id ?? null,
    tokenUsage: tokenUsageFrom(providerResponse),
  };

  if (context?.thinkingMode) metadata.thinkingMode = context.thinkingMode;
  if (Array.isArray(context?.retrievedChunkIds)) metadata.retrievedChunkIds = [...context.retrievedChunkIds];
  if (context?.retrievalScoreSummary) metadata.retrievalScoreSummary = context.retrievalScoreSummary;
  if (context?.tokenEstimates) metadata.tokenEstimates = context.tokenEstimates;
  if (!metadata.tokenUsage.input && estimatedInputTokens) {
    metadata.tokenUsage.input = estimatedInputTokens;
  }
  return metadata;
}

function normalizePrompt(prompt, fallbackId) {
  const id = prompt?.id ?? fallbackId;
  const definition = getPromptDefinition(id);
  return { id, version: prompt?.version ?? definition.version ?? PROMPT_VERSION };
}

function chunksForPrompt(context) {
  return (context?.chunks ?? []).map((chunk) => ({
    chunkId: chunk.chunkId ?? chunk.id,
    headingPath: chunk.headingPath ?? [],
    text: chunk.text ?? chunk.content ?? chunk.contentExcerpt ?? '',
  }));
}

function safeError(error, secrets) {
  const message = redactSecrets(error?.message ?? String(error), secrets);
  const wrapped = new Error(message || 'MiniMax provider failed');
  wrapped.code = error?.code;
  wrapped.status = error?.status;
  return wrapped;
}

export function createMiniMaxProvider({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  transport = fetchTransport,
  budget,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
} = {}) {
  const configuredApiKey = requireNonEmptyString(apiKey, 'MiniMax API key');
  const configuredBaseUrl = requireNonEmptyString(baseUrl, 'MiniMax base URL');
  const configuredModel = requireNonEmptyString(model, 'MiniMax model');
  const configuredBudget = normalizeBudget(budget);
  if (configuredModel !== DEFAULT_MODEL) {
    throw new Error(`MiniMax model must be ${DEFAULT_MODEL}`);
  }
  if (typeof transport !== 'function') {
    throw new Error('MiniMax transport must be a function');
  }

  async function invoke({ prompt, messages, context, outputTokens = maxOutputTokens }) {
    const estimatedInputTokens = estimateTokensForMessages(messages);
    assertWithinBudget({ budget: configuredBudget, estimatedInputTokens, requestedOutputTokens: outputTokens });

    const request = {
      provider: 'minimax',
      model: configuredModel,
      url: chatCompletionsUrl(configuredBaseUrl),
      method: 'POST',
      headers: {
        authorization: `Bearer ${configuredApiKey}`,
        'content-type': 'application/json',
      },
      body: {
        model: configuredModel,
        messages,
        temperature: 0.1,
        max_tokens: outputTokens,
      },
      timeoutMs: configuredBudget.timeoutMs,
      budget: {
        maxLiveCalls: configuredBudget.maxLiveCalls,
        usedLiveCalls: configuredBudget.usedLiveCalls,
        maxInputTokens: configuredBudget.maxInputTokens,
        maxOutputTokens: configuredBudget.maxOutputTokens,
        maxContextTokens: configuredBudget.maxContextTokens,
        maxRetries: configuredBudget.maxRetries,
        concurrencyLimit: configuredBudget.concurrencyLimit,
        estimatedInputTokens,
      },
    };

    configuredBudget.activeCalls += 1;
    try {
      const providerResponse = await transport(request);
      configuredBudget.usedLiveCalls += 1;
      const parsed = parseJsonContent(responseContent(providerResponse));
      return {
        parsed,
        metadata: metadataFrom({ providerResponse, model: configuredModel, prompt, context, estimatedInputTokens }),
      };
    } catch (error) {
      throw safeError(error, { minimaxApiKey: configuredApiKey, providerResponse: error?.providerResponse });
    } finally {
      configuredBudget.activeCalls -= 1;
    }
  }

  async function answerQuestion({ documentId, userId, question, prompt: promptInput, context = {}, secrets = {} } = {}) {
    requireNonEmptyString(documentId, 'documentId');
    requireNonEmptyString(userId, 'userId');
    const prompt = normalizePrompt(promptInput, 'doculens.chat');
    const messages = buildPromptMessages({
      promptId: prompt.id,
      promptVersion: prompt.version,
      userQuestion: question,
      chunks: chunksForPrompt(context),
      contextStrategy: context.strategy,
      retrievalBackend: context.retrievalBackend,
      fallbackReason: context.fallbackReason,
      secrets: { ...secrets, minimaxApiKey: configuredApiKey },
    });
    const { parsed, metadata } = await invoke({ prompt, messages, context });
    return {
      answer: parsed.answer ?? parsed.content ?? '',
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      metadata,
    };
  }

  async function analyzeDocument({ documentId, userId, document, prompt: promptInput, context = {}, secrets = {} } = {}) {
    requireNonEmptyString(documentId, 'documentId');
    requireNonEmptyString(userId, 'userId');
    const prompt = normalizePrompt(promptInput, 'doculens.analysis');
    const messages = buildPromptMessages({
      promptId: prompt.id,
      promptVersion: prompt.version,
      document,
      contextStrategy: context.strategy ?? 'analysis',
      retrievalBackend: context.retrievalBackend,
      fallbackReason: context.fallbackReason,
      secrets: { ...secrets, minimaxApiKey: configuredApiKey },
    });
    const { parsed, metadata } = await invoke({ prompt, messages, context: { ...context, strategy: context.strategy ?? 'analysis' } });
    return { analysis: parsed, metadata };
  }

  return assertAIProvider({ answerQuestion, analyzeDocument });
}

export const MINIMAX_DEFAULTS = Object.freeze({ baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL });
