import { redactSecrets } from '../security/redact.mjs';
import { assertAIProvider } from './provider.mjs';
import { buildPromptMessages } from './prompts/builder.mjs';
import { getPromptDefinition, PROMPT_VERSION } from './prompts/registry.mjs';

const DEFAULT_BASE_URL = 'https://api.minimax.io/v1';
const DEFAULT_MODEL = 'MiniMax-M3';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 800;
const DEFAULT_ANALYSIS_MAX_OUTPUT_TOKENS = 6000;
const DEFAULT_MAX_OUTPUT_TOKENS = DEFAULT_ANALYSIS_MAX_OUTPUT_TOKENS;
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
  return choice?.message?.content
    ?? choice?.message
    ?? choice?.text
    ?? providerResponse?.output_text
    ?? providerResponse?.output
    ?? providerResponse?.message
    ?? providerResponse?.answer
    ?? '';
}

const UNSTRUCTURED_CONTENT = Symbol('unstructured MiniMax content');

const SAFE_ANALYSIS_LIMITATION_SUMMARY = 'DocuLens could not convert the AI response into a structured briefing. Regenerate the briefing or inspect the source directly.';
const SAFE_ANALYSIS_LIMITATION_DETAIL = 'The briefing needs regeneration because the AI response was not structured enough to display safely.';

const SECRET_SHAPED_PATTERNS = Object.freeze([
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bsk-(?:minimax[_-]?)?[A-Za-z0-9_-]{16,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@([^\s'")]+)/gi,
  /\b(?:api[_-]?key|secret(?:[_-]?key)?|password|passwd|token|authorization)\s*[:=]\s*["']?[^\s'",;]{8,}["']?/gi,
]);

const UNSAFE_DISPLAY_KEY_PATTERN = /(?:chain.*thought|hidden.*reasoning|internal.*policy|system.*policy|system.*prompt|developer.*instruction|raw.*provider|provider.*payload|provider.*response|response.*id|reasoning|think|document.*id|chunk.*id|\bid\b)/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const PROVIDER_CONTAINER_KEYS = Object.freeze([
  'answer',
  'message',
  'content',
  'text',
  'output',
  'output_text',
  'result',
  'data',
  'response',
]);

const ANALYSIS_FIELD_KEYS = Object.freeze([
  'summary',
  'sections',
  'entities',
  'requirements',
  'requiredItems',
  'required_items',
  'obligations',
  'deliverables',
  'risks',
  'tradeoffs',
  'tradeOffs',
  'uncertainties',
  'recommendedQuestions',
  'recommended_questions',
  'questions',
]);

const CHAT_FIELD_KEYS = Object.freeze(['answer', 'text', 'content', 'summary', 'final', 'citations', 'uncertainty', 'metadata']);

function stripMarkdownJsonFence(content) {
  const text = String(content ?? '').trim();
  const fullFence = text.match(/^```(?:json|javascript|js)?\s*([\s\S]*?)\s*```$/i);
  if (fullFence) {
    return fullFence[1].trim();
  }
  const firstJsonFence = text.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  return firstJsonFence ? firstJsonFence[1].trim() : text;
}

function parseJsonCandidate(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function hasAnyKey(source, keys) {
  return isObject(source) && keys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
}

function parsedStringValue(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const candidate = stripMarkdownJsonFence(value);
  if (!/^[{["]/.test(candidate)) {
    return null;
  }
  return parseJsonCandidate(candidate);
}

function normalizeContentArray(items, depth) {
  const normalizedItems = items
    .map((item) => recursivelyUnwrapProviderContent(item, depth + 1))
    .filter((item) => {
      if (typeof item === 'string') return item.trim() !== '';
      if (Array.isArray(item)) return item.length > 0;
      if (isObject(item)) return Object.keys(item).length > 0;
      return item !== null && item !== undefined;
    });
  const structured = normalizedItems.find((item) => isObject(item) && (hasAnyKey(item, ANALYSIS_FIELD_KEYS) || hasAnyKey(item, CHAT_FIELD_KEYS)));
  if (structured) {
    return structured;
  }
  if (normalizedItems.every((item) => typeof item === 'string')) {
    return normalizedItems.join('\n').trim();
  }
  return normalizedItems;
}

function recursivelyUnwrapProviderContent(value, depth = 0) {
  if (depth > 8 || value === null || value === undefined) {
    return value;
  }

  const parsedString = parsedStringValue(value);
  if (parsedString !== null) {
    return recursivelyUnwrapProviderContent(parsedString, depth + 1);
  }
  if (typeof value === 'string') {
    return stripMarkdownJsonFence(value);
  }

  if (Array.isArray(value)) {
    return normalizeContentArray(value, depth);
  }

  if (!isObject(value)) {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if ((ANALYSIS_FIELD_KEYS.includes(key) || key === 'citations') && Array.isArray(item)) {
        return [key, item.map((entry) => recursivelyUnwrapProviderContent(entry, depth + 1))];
      }
      return [key, recursivelyUnwrapProviderContent(item, depth + 1)];
    }),
  );

  const hasCanonicalAnalysis = hasAnyKey(normalized, ANALYSIS_FIELD_KEYS);
  const hasCanonicalChat = hasAnyKey(normalized, CHAT_FIELD_KEYS) && (
    typeof normalized.answer === 'string'
    || isObject(normalized.answer)
    || typeof normalized.text === 'string'
    || typeof normalized.content === 'string'
    || Array.isArray(normalized.citations)
  );
  if (hasCanonicalAnalysis || hasCanonicalChat) {
    return normalized;
  }

  for (const key of PROVIDER_CONTAINER_KEYS) {
    const nested = normalized[key];
    if (isObject(nested) || Array.isArray(nested)) {
      return recursivelyUnwrapProviderContent(nested, depth + 1);
    }
    if (typeof nested === 'string' && nested.trim() !== '') {
      return nested;
    }
  }

  return normalized;
}

function parseJsonContent(content) {
  if (typeof content !== 'string' && !isObject(content) && !Array.isArray(content)) {
    return {};
  }
  if (typeof content === 'string' && content.trim() === '') {
    return {};
  }

  const candidate = typeof content === 'string' ? stripMarkdownJsonFence(content) : content;
  const parsed = typeof candidate === 'string' ? parseJsonCandidate(candidate) : candidate;
  if (parsed !== null && parsed !== undefined) {
    const normalized = recursivelyUnwrapProviderContent(parsed);
    return isObject(normalized)
      ? normalized
      : { items: Array.isArray(normalized) ? normalized : [], answer: Array.isArray(normalized) ? '' : String(normalized) };
  }

  const fallback = { answer: candidate };
  Object.defineProperty(fallback, UNSTRUCTURED_CONTENT, { value: true });
  return fallback;
}

function payloadForDisplay(parsed) {
  if (isObject(parsed?.answer)) {
    return parsed.answer;
  }
  return isObject(parsed) ? parsed : {};
}

function textFromPayload(payload) {
  if (typeof payload === 'string') {
    return payload;
  }
  if (!isObject(payload)) {
    return '';
  }
  if (isObject(payload.answer)) {
    return textFromPayload(payload.answer);
  }
  for (const key of ['text', 'answer', 'summary', 'final', 'content']) {
    if (typeof payload[key] === 'string' && payload[key].trim() !== '') {
      return payload[key];
    }
  }
  return '';
}

function displayTextFromStructuredString(value) {
  const text = String(value ?? '').trim();
  if (text === '') {
    return '';
  }
  const candidate = stripMarkdownJsonFence(text);
  if (!/^[{["]/.test(candidate)) {
    return text;
  }
  const parsed = parseJsonCandidate(candidate);
  if (parsed === null) {
    return text;
  }
  const display = textFromPayload(payloadForDisplay(isObject(parsed) ? parsed : { answer: String(parsed) }));
  return display || '';
}

function sanitizeDisplayText(value, secrets = {}, fallback = '') {
  let text = displayTextFromStructuredString(value);
  text = redactSecrets(text, secrets)
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/^\s*(?:chain[-\s]?of[-\s]?thought|hidden reasoning|reasoning trace|internal analysis|internal policy|system prompt|developer instructions?)\s*:.*$/gim, '')
    .replace(/^\s*.*\b(?:cannot|can't|won't)\b.*\b(?:chain[-\s]?of[-\s]?thought|hidden reasoning|system prompt|developer instruction|internal policy)\b.*$/gim, '')
    .replace(/<\/?(?:system|developer|policy|hidden_reasoning|provider_payload)[^>]*>/gi, '')
    .replace(/["']?\b(?:providerResponseId|provider_response_id|response_id|documentId|document_id|chunkId|chunk_id)\b["']?\s*[:=]\s*["']?[A-Za-z0-9._:-]+["']?/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[REDACTED:ID]')
    .replace(/(?:\\n|\n)\s*at\s+[^\n"]+/g, '\n[REDACTED:STACK_TRACE]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  for (const pattern of SECRET_SHAPED_PATTERNS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, '[REDACTED]');
  }

  return text || fallback;
}

function sanitizeDisplayValue(value, secrets = {}) {
  if (typeof value === 'string') {
    return sanitizeDisplayText(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDisplayValue(item, secrets)).filter((item) => {
      if (typeof item === 'string') return item.trim() !== '';
      if (isObject(item)) return Object.keys(item).length > 0;
      return item !== null && item !== undefined;
    });
  }
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !UNSAFE_DISPLAY_KEY_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeDisplayValue(item, secrets)])
      .filter(([, item]) => {
        if (typeof item === 'string') return item.trim() !== '';
        if (Array.isArray(item)) return item.length > 0;
        if (isObject(item)) return Object.keys(item).length > 0;
        return item !== null && item !== undefined;
      }));
  }
  return value;
}

function firstArray(source, keys) {
  for (const key of keys) {
    if (Array.isArray(source?.[key])) {
      return source[key];
    }
  }
  return [];
}

function normalizedStructuredItems(value, { stringKey, allowedKeys, requiredKey = stringKey, secrets }) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === 'string') {
        return { [stringKey]: sanitizeDisplayText(item, secrets) };
      }
      if (!isObject(item)) {
        return null;
      }
      const normalized = {};
      for (const key of allowedKeys) {
        const itemValue = item[key] ?? (key === stringKey ? item.description ?? item.summary ?? item.name : undefined);
        if (typeof itemValue === 'string') {
          normalized[key] = sanitizeDisplayText(itemValue, secrets);
        } else if (typeof itemValue === 'boolean' || Number.isFinite(itemValue)) {
          normalized[key] = itemValue;
        }
      }
      return typeof normalized[requiredKey] === 'string' && normalized[requiredKey].trim() !== '' ? normalized : null;
    })
    .filter(Boolean);
}

function normalizedStringList(value, secrets) {
  return (Array.isArray(value) ? value : [])
    .map((item) => {
      if (typeof item === 'string') {
        return sanitizeDisplayText(item, secrets);
      }
      if (isObject(item)) {
        return sanitizeDisplayText(item.text ?? item.question ?? item.summary ?? item.description ?? '', secrets);
      }
      return '';
    })
    .filter((item) => item.trim() !== '');
}

function displayTextFromValue(value, secrets, fallback = '') {
  if (typeof value === 'string') {
    return sanitizeDisplayText(value, secrets, fallback);
  }
  if (isObject(value)) {
    const direct = textFromPayload(value);
    if (direct) {
      return sanitizeDisplayText(direct, secrets, fallback);
    }
    const joined = Object.values(sanitizeDisplayValue(value, secrets))
      .filter((item) => typeof item === 'string' && item.trim() !== '')
      .join(' ');
    return sanitizeDisplayText(joined, secrets, fallback);
  }
  return fallback;
}


function analysisFromParsedContent(parsed, secrets = {}) {
  const source = payloadForDisplay(parsed);

  if (parsed?.[UNSTRUCTURED_CONTENT]) {
    return {
      summary: SAFE_ANALYSIS_LIMITATION_SUMMARY,
      sections: [],
      entities: [],
      requirements: [],
      obligations: [],
      deliverables: [],
      risks: [],
      uncertainties: [SAFE_ANALYSIS_LIMITATION_DETAIL],
      recommendedQuestions: [
        'What are the main requirements in this source?',
        'What deliverables does this source request?',
        'What risks or uncertainties should I review?',
      ],
    };
  }

  const summarySource = source.summary ?? (typeof parsed?.answer === 'string' && parsed.answer.trim() !== '' ? parsed.answer : source.content ?? source.text);
  const summary = displayTextFromValue(summarySource, secrets, SAFE_ANALYSIS_LIMITATION_SUMMARY);

  return {
    summary,
    sections: normalizedStructuredItems(firstArray(source, ['sections', 'parts', 'outline']), {
      stringKey: 'title',
      allowedKeys: ['title', 'summary', 'sourceQuote'],
      secrets,
    }),
    entities: normalizedStructuredItems(firstArray(source, ['entities']), {
      stringKey: 'name',
      allowedKeys: ['name', 'type', 'description'],
      secrets,
    }),
    requirements: normalizedStructuredItems(firstArray(source, ['requirements', 'requiredItems', 'required_items']), {
      stringKey: 'text',
      allowedKeys: ['category', 'text', 'sourceQuote'],
      secrets,
    }),
    obligations: normalizedStructuredItems(firstArray(source, ['obligations']), {
      stringKey: 'text',
      allowedKeys: ['party', 'text', 'sourceQuote'],
      secrets,
    }),
    deliverables: normalizedStructuredItems(firstArray(source, ['deliverables']), {
      stringKey: 'text',
      allowedKeys: ['text', 'sourceQuote'],
      secrets,
    }),
    risks: normalizedStructuredItems(firstArray(source, ['risks', 'tradeoffs', 'tradeOffs']), {
      stringKey: 'text',
      allowedKeys: ['severity', 'text', 'sourceQuote', 'derivedReviewerRisk'],
      secrets,
    }),
    uncertainties: normalizedStringList(source.uncertainties, secrets),
    recommendedQuestions: normalizedStringList(source.recommendedQuestions ?? source.recommended_questions ?? source.questions, secrets),
  };
}

function normalizedCitations(value, secrets = {}) {
  return (Array.isArray(value) ? value : [])
    .map((citation) => {
      if (!isObject(citation)) {
        return null;
      }
      const chunkId = typeof citation.chunkId === 'string'
        ? sanitizeDisplayText(citation.chunkId, secrets)
        : '';
      const quote = sanitizeDisplayText(citation.quote ?? citation.text ?? '', secrets);
      return chunkId && quote ? { chunkId, quote } : null;
    })
    .filter(Boolean);
}

function normalizedProviderAnswer(parsed, secrets = {}) {
  const source = payloadForDisplay(parsed);
  const answer = sanitizeDisplayText(textFromPayload(source), secrets, '');
  return {
    answer,
    citations: normalizedCitations(source.citations, secrets),
    uncertainty: typeof source.uncertainty === 'string'
      ? sanitizeDisplayText(source.uncertainty, secrets)
      : source.uncertainty ?? null,
    metadata: sanitizeDisplayValue(isObject(source.metadata) ? source.metadata : {}, secrets),
  };
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
  const message = redactSecrets(error?.message ?? String(error), secrets).trim();
  const wrapped = new Error(message || 'AI provider request failed');
  wrapped.code = error?.code;
  wrapped.status = error?.status;
  wrapped.statusCode = [408, 409, 429, 500, 502, 503, 504].includes(Number(error?.status)) ? 503 : 502;
  return wrapped;
}

export function createMiniMaxProvider({
  apiKey,
  baseUrl = DEFAULT_BASE_URL,
  model = DEFAULT_MODEL,
  transport = fetchTransport,
  budget,
  maxOutputTokens = DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
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

    configuredBudget.usedLiveCalls += 1;
    configuredBudget.activeCalls += 1;
    try {
      const providerResponse = await transport(request);
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

  async function answerQuestion({ documentId, userId, question, prompt: promptInput, context = {}, contextStrategy, chunks, document, secrets = {} } = {}) {
    requireNonEmptyString(documentId, 'documentId');
    requireNonEmptyString(userId, 'userId');
    const prompt = normalizePrompt(promptInput, contextStrategy === 'fallback' || context?.strategy === 'fallback' ? 'doculens.fallback' : 'doculens.chat');
    const providerContext = {
      ...context,
      strategy: context.strategy ?? contextStrategy,
      chunks: context.chunks ?? chunks,
      document: context.document ?? document,
    };
    const messages = buildPromptMessages({
      promptId: prompt.id,
      promptVersion: prompt.version,
      userQuestion: question,
      document: providerContext.strategy === 'fallback' ? providerContext.document : undefined,
      chunks: chunksForPrompt(providerContext),
      contextStrategy: providerContext.strategy,
      retrievalBackend: providerContext.retrievalBackend,
      fallbackReason: providerContext.fallbackReason,
      secrets: { ...secrets, minimaxApiKey: configuredApiKey },
    });
    const { parsed, metadata } = await invoke({ prompt, messages, context: providerContext });
    const normalized = normalizedProviderAnswer(parsed, secrets);
    return {
      answer: normalized.answer,
      citations: normalized.citations,
      uncertainty: normalized.uncertainty,
      metadata: { ...normalized.metadata, ...metadata },
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
    const { parsed, metadata } = await invoke({ prompt, messages, context: { ...context, strategy: context.strategy ?? 'analysis' }, outputTokens: Math.max(maxOutputTokens, DEFAULT_ANALYSIS_MAX_OUTPUT_TOKENS) });
    return { analysis: analysisFromParsedContent(parsed, secrets), metadata };
  }

  return assertAIProvider({ answerQuestion, analyzeDocument });
}

export const MINIMAX_DEFAULTS = Object.freeze({ baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL });
