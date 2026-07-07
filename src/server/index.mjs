import { createServer } from 'node:http';
import { loadServerConfigSync } from './config/env.mjs';
import { createAuthService } from './auth/service.mjs';
import {
  createDocumentService,
  createInMemoryDocumentRepository,
  createInMemoryUserRepository,
  DocumentAccessError,
} from './documents/service.mjs';
import { redactSecrets } from './security/redact.mjs';

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}

function sendNoContent(response) {
  response.writeHead(204);
  response.end();
}

function safeErrorMessage(statusCode) {
  if (statusCode === 401) {
    return 'Unauthorized';
  }
  if (statusCode === 403) {
    return 'Forbidden';
  }
  if (statusCode === 404) {
    return 'Not found';
  }
  return 'Request failed';
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

function routePath(request) {
  return new URL(request.url, 'http://127.0.0.1').pathname;
}

async function requireCurrentUser(request, auth) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  if (!match) {
    return null;
  }
  return auth.authenticateBearerToken(match[1]);
}

function buildServices(config, overrides = {}) {
  const users = overrides.users ?? createInMemoryUserRepository();
  const documentsRepository = overrides.documentsRepository ?? createInMemoryDocumentRepository();
  const auth = overrides.auth ?? createAuthService({
    users,
    jwtSecret: config.jwtSecret,
    tokenTtlSeconds: config.jwtTokenTtlSeconds ?? 60 * 60,
  });
  const documents = overrides.documents ?? createDocumentService({ documents: documentsRepository });
  return { auth, documents };
}

async function handleProtected(request, response, services, handler) {
  const currentUser = await requireCurrentUser(request, services.auth);
  if (!currentUser) {
    sendJson(response, 401, { error: 'Unauthorized' });
    return;
  }
  await handler(currentUser);
}

function documentIdFromPath(pathname, suffix = '') {
  const pattern = new RegExp(`^/api/documents/([^/]+)${suffix}$`);
  const match = pathname.match(pattern);
  return match ? decodeURIComponent(match[1]) : null;
}

export function createDocuLensServer(config, overrides = {}) {
  const services = buildServices(config, overrides);

  return createServer(async (request, response) => {
    try {
      const pathname = routePath(request);
      const method = request.method ?? 'GET';

      if (method === 'GET' && pathname === '/health') {
        sendJson(response, 200, { ok: true, service: 'doculens-ai', provider: config.aiProvider });
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/register') {
        const body = await readJsonBody(request);
        const registration = await services.auth.register(body);
        sendJson(response, 201, registration);
        return;
      }

      if (method === 'POST' && pathname === '/api/auth/login') {
        const body = await readJsonBody(request);
        const login = await services.auth.login(body);
        sendJson(response, 200, login);
        return;
      }

      if (pathname === '/api/documents' && method === 'POST') {
        await handleProtected(request, response, services, async (currentUser) => {
          const body = await readJsonBody(request);
          const document = await services.documents.createDocument({
            currentUser,
            title: body.title,
            content: body.content,
          });
          sendJson(response, 201, { document });
        });
        return;
      }

      if (pathname === '/api/documents' && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const documents = await services.documents.listDocuments({ currentUser });
          sendJson(response, 200, { documents });
        });
        return;
      }

      const documentId = documentIdFromPath(pathname);
      if (documentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const document = await services.documents.getDocument({ currentUser, documentId });
          sendJson(response, 200, { document });
        });
        return;
      }

      if (documentId && method === 'DELETE') {
        await handleProtected(request, response, services, async (currentUser) => {
          await services.documents.deleteDocument({ currentUser, documentId });
          sendNoContent(response);
        });
        return;
      }

      const analysisDocumentId = documentIdFromPath(pathname, '/analysis');
      if (analysisDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const analysis = typeof services.documents.listAnalysis === 'function'
            ? await services.documents.listAnalysis({ currentUser, documentId: analysisDocumentId })
            : [];
          sendJson(response, 200, { analysis });
        });
        return;
      }

      const messagesDocumentId = documentIdFromPath(pathname, '/messages');
      if (messagesDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const messages = typeof services.documents.listMessages === 'function'
            ? await services.documents.listMessages({ currentUser, documentId: messagesDocumentId })
            : [];
          sendJson(response, 200, { messages });
        });
        return;
      }

      if (messagesDocumentId && method === 'POST') {
        await handleProtected(request, response, services, async (currentUser) => {
          const body = await readJsonBody(request);
          const message = typeof services.documents.createMessage === 'function'
            ? await services.documents.createMessage({ currentUser, documentId: messagesDocumentId, question: body.question })
            : null;
          sendJson(response, 201, { message });
        });
        return;
      }

      const chunksDocumentId = documentIdFromPath(pathname, '/chunks');
      if (chunksDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const chunks = typeof services.documents.listChunks === 'function'
            ? await services.documents.listChunks({ currentUser, documentId: chunksDocumentId })
            : [];
          sendJson(response, 200, { chunks });
        });
        return;
      }

      const citationsDocumentId = documentIdFromPath(pathname, '/citations');
      if (citationsDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          const citations = typeof services.documents.listCitations === 'function'
            ? await services.documents.listCitations({ currentUser, documentId: citationsDocumentId })
            : [];
          sendJson(response, 200, { citations });
        });
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      const statusCode = error instanceof DocumentAccessError ? error.statusCode : Number(error.statusCode) || 500;
      sendJson(response, statusCode, { error: safeErrorMessage(statusCode) });
    }
  });
}

export function startServer(env = process.env) {
  const config = loadServerConfigSync(env);
  const port = Number(env.PORT || 3000);
  const host = env.HOST || '127.0.0.1';
  const server = createDocuLensServer(config);
  server.listen(port, host, () => {
    console.log(redactSecrets(`DocuLens AI server listening on http://${host}:${port}`, [config.databaseUrl, config.jwtSecret, config.minimax.apiKey]));
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
