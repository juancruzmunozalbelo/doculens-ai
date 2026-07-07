import { redactSecrets } from '../security/redact.mjs';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

function redactValue(value, secrets) {
  if (typeof value === 'string') {
    return redactSecrets(value, secrets);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, secrets));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, secrets)]));
  }
  return value;
}

function writeConsole(level, entry) {
  const line = JSON.stringify({ level, ...entry });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createStructuredLogger({ secrets = [] } = {}) {
  return {
    info(entry) {
      writeConsole('info', redactValue(entry, secrets));
    },
    warn(entry) {
      writeConsole('warn', redactValue(entry, secrets));
    },
    error(entry) {
      writeConsole('error', redactValue(entry, secrets));
    },
  };
}

export function normalizeRequestId(value, fallback) {
  if (typeof value === 'string' && REQUEST_ID_PATTERN.test(value)) {
    return value;
  }
  return fallback;
}

export function safeLogger(logger) {
  if (logger && typeof logger === 'object') {
    return {
      info: typeof logger.info === 'function' ? logger.info.bind(logger) : () => {},
      warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : () => {},
      error: typeof logger.error === 'function' ? logger.error.bind(logger) : () => {},
    };
  }
  return createStructuredLogger();
}
