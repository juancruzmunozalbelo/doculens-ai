import { createServer } from 'node:http';
import { loadServerConfigSync } from './config/env.mjs';
import { redactSecrets } from './security/redact.mjs';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

export function createDocuLensServer(config) {
  return createServer((request, response) => {
    if (request.url === '/health') {
      sendJson(response, 200, { ok: true, service: 'doculens-ai', provider: config.aiProvider });
      return;
    }

    sendJson(response, 200, {
      name: 'DocuLens AI',
      status: 'foundation-ready',
      implemented: ['configuration', 'redaction', 'postgresql-schema'],
      pending: ['auth', 'rag', 'minimax-live-calls', 'ui-workflow', 'aws-demo'],
    });
  });
}

export function startServer(env = process.env) {
  const config = loadServerConfigSync(env);
  const port = Number(env.PORT || 3000);
  const host = env.HOST || '127.0.0.1';
  const server = createDocuLensServer(config);
  server.listen(port, host, () => {
    console.log(redactSecrets(`DocuLens AI foundation server listening on http://${host}:${port}`, [config.databaseUrl, config.jwtSecret, config.minimax.apiKey]));
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
