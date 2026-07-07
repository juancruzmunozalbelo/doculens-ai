const REDACTED = '[REDACTED]';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stringifyForLog(value) {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectConfiguredSecrets(configuredSecrets) {
  const values = [];
  if (Array.isArray(configuredSecrets)) {
    values.push(...configuredSecrets);
  } else if (configuredSecrets && typeof configuredSecrets === 'object') {
    values.push(...Object.values(configuredSecrets));
  }

  values.push(
    process.env.MINIMAX_API_KEY,
    process.env.JWT_SECRET,
    process.env.DATABASE_URL,
    process.env.PGPASSWORD,
  );

  return values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
}

export function redactSecrets(value, configuredSecrets = []) {
  let output = stringifyForLog(value);

  for (const secret of collectConfiguredSecrets(configuredSecrets)) {
    output = output.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED);
  }

  output = output
    .replace(/"stack"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"stack":"[REDACTED:STACK_TRACE]"')
    .replace(/"message"\s*:\s*"(?:\\.|[^"\\])*?(?:MiniMax|provider|transport)(?:\\.|[^"\\])*"/gi, '"message":"[REDACTED:PROVIDER_ERROR]"')
    .replace(/(?:\\n|\n)\s*at\s+[^\n"]+/g, '\n[REDACTED:STACK_TRACE]')
    .replace(/Error:\s*[^\n"]*(?:MiniMax|provider|transport)[^\n"]*/gi, '[REDACTED:PROVIDER_ERROR]')
    .replace(/postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@([^\s'")]+)/gi, 'postgresql://$1:[REDACTED:DATABASE_PASSWORD]@$3')
    .replace(/\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[REDACTED:AUTHORIZATION]')
    .replace(/\b(MINIMAX_API_KEY|JWT_SECRET|PGPASSWORD|DATABASE_URL)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED:SECRET]')
    .replace(/\bsk-(?:minimax[_-]?)?[A-Za-z0-9_-]{16,}\b/gi, '[REDACTED:API_KEY]')
    .replace(/\bjwt[_-][A-Za-z0-9_-]{16,}\b/gi, '[REDACTED:JWT_SECRET]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED:JWT]')
    .replace(/"rawDocumentText"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"rawDocumentText":"[REDACTED:DOCUMENT_TEXT]"')
    .replace(/"fullPrompt"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"fullPrompt":"[REDACTED:PROMPT]"')
    .replace(/"providerResponse"\s*:\s*"(?:\\.|[^"\\])*"/gi, '"providerResponse":"[REDACTED:PROVIDER_RESPONSE]"')
    .replace(/\bRAW_DOCUMENT_CANARY:[^\n"]+/gi, '[REDACTED:DOCUMENT_TEXT]')
    .replace(/\bFULL_PROMPT_CANARY:[^\n"]+/gi, '[REDACTED:PROMPT]')
    .replace(/\bPROVIDER_RESPONSE_CANARY:[^\n"]+/gi, '[REDACTED:PROVIDER_RESPONSE]')
    .replace(/document_text_[A-Za-z0-9_-]+/gi, '[REDACTED:DOCUMENT_TEXT]')
    .replace(/full_prompt_[A-Za-z0-9_-]+/gi, '[REDACTED:PROMPT]')
    .replace(/provider_response_[A-Za-z0-9_-]+/gi, '[REDACTED:PROVIDER_RESPONSE]');

  return output;
}

export const redactSensitive = redactSecrets;
