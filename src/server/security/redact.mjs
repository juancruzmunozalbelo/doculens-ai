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
    .replace(/postgres(?:ql)?:\/\/([^:\s/@]+):([^@\s]+)@([^\s'\")]+)/gi, 'postgresql://$1:[REDACTED:DATABASE_PASSWORD]@$3')
    .replace(/\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/-]+=*/gi, '[REDACTED:AUTHORIZATION]')
    .replace(/\b(?:MINIMAX_API_KEY|JWT_SECRET|PGPASSWORD)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED:SECRET]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:API_KEY]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED:JWT]')
    .replace(/document_text_[A-Za-z0-9_-]+/g, '[REDACTED:DOCUMENT_TEXT]')
    .replace(/full_prompt_[A-Za-z0-9_-]+/g, '[REDACTED:PROMPT]')
    .replace(/provider_response_[A-Za-z0-9_-]+/g, '[REDACTED:PROVIDER_RESPONSE]');

  return output;
}

export const redactSensitive = redactSecrets;
