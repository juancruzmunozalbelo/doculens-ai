import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadServerConfigSync } from './config/env.mjs';
import { createAuthService } from './auth/service.mjs';
import {
  createDocumentService,
  createInMemoryDocumentRepository,
  createInMemoryUserRepository,
  DocumentAccessError,
} from './documents/service.mjs';
import { createInMemoryChunkRepository } from './ingestion/chunk-repository.mjs';
import { createMiniMaxProvider, MINIMAX_DEFAULTS } from './ai/minimax-provider.mjs';
import { createDocumentAiService } from './chat/service.mjs';
import { createRetrievalProvider } from './retrieval/provider.mjs';
import { createPostgreSqlRepositories } from './postgresql/repositories.mjs';
import { redactSecrets } from './security/redact.mjs';

const MAX_JSON_BODY_BYTES = 1024 * 1024;
const DEFAULT_SERVER_MINIMAX_BUDGET = Object.freeze({
  maxLiveCalls: 32,
  maxOutputTokens: 800,
  maxInputTokens: 8_000,
  maxContextTokens: 8_000,
  maxRetries: 1,
  concurrencyLimit: 2,
  maxEstimatedCostUsd: 1,
});

const STATIC_MIME_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
});

function sendBuffer(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'content-length': body.length,
  });
  response.end(body);
}

function staticContentType(filePath) {
  return STATIC_MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

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
  if (statusCode === 400) {
    return 'Bad request';
  }
  if (statusCode === 401) {
    return 'Unauthorized';
  }
  if (statusCode === 403) {
    return 'Forbidden';
  }
  if (statusCode === 404) {
    return 'Not found';
  }
  if (statusCode === 409) {
    return 'Conflict';
  }
  return 'Request failed';
}

async function readJsonBody(request, { maxBytes = MAX_JSON_BODY_BYTES } = {}) {
  const contentLength = request.headers['content-length'];
  if (typeof contentLength === 'string' && contentLength.trim() !== '') {
    const declaredBytes = Number(contentLength);
    if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
      const error = new Error('Invalid Content-Length');
      error.statusCode = 400;
      throw error;
    }
    if (declaredBytes > maxBytes) {
      const error = new Error('JSON body is too large');
      error.statusCode = 413;
      throw error;
    }
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      const error = new Error('JSON body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks, receivedBytes).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

function routePath(request) {
  return new URL(request.url, 'http://127.0.0.1').pathname;
}

function staticFilePath(staticDir, pathname) {
  if (!staticDir || pathname.startsWith('/api/')) {
    return null;
  }
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const decodedPath = decodeURIComponent(requestedPath);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = path.resolve(staticDir, `.${normalizedPath}`);
  const root = path.resolve(staticDir);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return candidate;
}

async function trySendStaticAsset({ response, staticDir, pathname }) {
  const candidate = staticFilePath(staticDir, pathname);
  if (!candidate) {
    return false;
  }
  try {
    const body = await readFile(candidate);
    sendBuffer(response, 200, body, staticContentType(candidate));
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') {
      throw error;
    }
  }
  if (pathname !== '/' && !path.extname(pathname)) {
    const indexPath = staticFilePath(staticDir, '/index.html');
    if (indexPath) {
      const body = await readFile(indexPath);
      sendBuffer(response, 200, body, 'text/html; charset=utf-8');
      return true;
    }
  }
  return false;
}

async function requireCurrentUser(request, auth) {
  const authorization = request.headers.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i) : null;
  if (!match) {
    return null;
  }
  return auth.authenticateBearerToken(match[1]);
}

function repositoriesFromFactory(config, repositoryFactory) {
  if (typeof repositoryFactory !== 'function') {
    throw new Error('repositoryFactory must be a function');
  }
  if (typeof config?.databaseUrl !== 'string' || config.databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required for database repository wiring');
  }
  const repositories = repositoryFactory({ databaseUrl: config.databaseUrl, config });
  if (!repositories || typeof repositories !== 'object') {
    throw new Error('repositoryFactory must return repository bindings');
  }
  return repositories;
}

function hasRepositoryOverride(overrides) {
  return Boolean(overrides.users || overrides.documentsRepository || overrides.chunksRepository || overrides.auth || overrides.documents);
}

function hasDatabaseUrl(config) {
  return typeof config?.databaseUrl === 'string' && config.databaseUrl.trim() !== '';
}

function selectDefaultRepositories(config, overrides) {
  if (hasRepositoryOverride(overrides)) {
    return {
      repositories: {},
      selection: {
        kind: 'overrides',
        databaseUrl: hasDatabaseUrl(config) ? config.databaseUrl : undefined,
        usesInMemoryRepositories: false,
      },
    };
  }

  if (overrides.repositoryFactory || (hasDatabaseUrl(config) && config.nodeEnv !== 'test')) {
    const factory = overrides.repositoryFactory ?? createPostgreSqlRepositories;
    const repositories = repositoriesFromFactory(config, factory);
    return {
      repositories,
      selection: {
        kind: 'postgresql',
        databaseUrl: config.databaseUrl,
        usesInMemoryRepositories: false,
      },
    };
  }

  return {
    repositories: {},
    selection: {
      kind: 'in-memory',
      databaseUrl: hasDatabaseUrl(config) ? config.databaseUrl : undefined,
      usesInMemoryRepositories: true,
    },
  };
}

function createUnavailableAiProvider() {
  async function unavailable() {
    const error = new Error('AI provider is not configured');
    error.statusCode = 503;
    throw error;
  }
  return { analyzeDocument: unavailable, answerQuestion: unavailable };
}

function defaultAiProvider(config) {
  const apiKey = config?.minimax?.apiKey ?? config?.minimaxApiKey;
  if (config?.aiProvider === 'minimax' && typeof apiKey === 'string' && apiKey.trim() !== '') {
    return createMiniMaxProvider({
      apiKey,
      baseUrl: config?.minimax?.baseUrl ?? MINIMAX_DEFAULTS.baseUrl,
      model: config?.minimax?.model ?? MINIMAX_DEFAULTS.model,
      budget: config?.minimax?.budget ?? DEFAULT_SERVER_MINIMAX_BUDGET,
    });
  }
  return createUnavailableAiProvider();
}

function buildServices(config, overrides = {}) {
  const { repositories, selection } = selectDefaultRepositories(config, overrides);
  if (typeof overrides.onRepositorySelection === 'function') {
    overrides.onRepositorySelection(selection);
  }
  const users = overrides.users ?? repositories.users ?? createInMemoryUserRepository();
  const documentsRepository = overrides.documentsRepository ?? repositories.documentsRepository ?? createInMemoryDocumentRepository();
  const chunksRepository = overrides.chunksRepository ?? repositories.chunksRepository ?? createInMemoryChunkRepository({ documents: documentsRepository });
  const auth = overrides.auth ?? createAuthService({
    users,
    jwtSecret: config.jwtSecret,
    tokenTtlSeconds: config.jwtTokenTtlSeconds ?? 60 * 60,
  });
  const documents = overrides.documents ?? repositories.documents ?? createDocumentService({ documents: documentsRepository, chunks: chunksRepository });
  const aiProvider = overrides.aiProvider ?? defaultAiProvider(config);
  const retrievalProvider = overrides.retrievalProvider ?? createRetrievalProvider({ chunkRepository: chunksRepository });
  const documentAi = overrides.documentAi ?? createDocumentAiService({
    documents,
    aiProvider,
    retrievalProvider,
    analysisRepository: overrides.analysisRepository ?? repositories.analysisRepository,
    chatRepository: overrides.chatRepository ?? repositories.chatRepository,
    config,
  });
  return { auth, documents, documentAi };
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

async function requireDocumentChildAuthorization(services, { currentUser, documentId, resourceType, action }) {
  if (typeof services.documents?.authorizeDocumentChildResource !== 'function') {
    throw new DocumentAccessError('Document not found', 404);
  }
  return services.documents.authorizeDocumentChildResource({ currentUser, documentId, resourceType, action });
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
          let analysis;
          if (typeof services.documents.listAnalysis === 'function') {
            analysis = await services.documents.listAnalysis({ currentUser, documentId: analysisDocumentId });
          } else {
            await requireDocumentChildAuthorization(services, {
              currentUser,
              documentId: analysisDocumentId,
              resourceType: 'analysis',
              action: 'read',
            });
            analysis = [];
          }
          sendJson(response, 200, { analysis });
        });
        return;
      }

      if (analysisDocumentId && method === 'POST') {
        await handleProtected(request, response, services, async (currentUser) => {
          const result = await services.documentAi.analyzeDocument({ currentUser, documentId: analysisDocumentId });
          sendJson(response, 201, { analysis: result.analysis });
        });
        return;
      }

      const messagesDocumentId = documentIdFromPath(pathname, '/messages');
      if (messagesDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          let messages;
          if (typeof services.documents.listMessages === 'function') {
            messages = await services.documents.listMessages({ currentUser, documentId: messagesDocumentId });
          } else {
            await requireDocumentChildAuthorization(services, {
              currentUser,
              documentId: messagesDocumentId,
              resourceType: 'message',
              action: 'read',
            });
            messages = [];
          }
          sendJson(response, 200, { messages });
        });
        return;
      }

      if (messagesDocumentId && method === 'POST') {
        await handleProtected(request, response, services, async (currentUser) => {
          const body = await readJsonBody(request);
          let message;
          if (typeof services.documents.createMessage === 'function') {
            message = await services.documents.createMessage({ currentUser, documentId: messagesDocumentId, question: body.question });
          } else {
            await requireDocumentChildAuthorization(services, {
              currentUser,
              documentId: messagesDocumentId,
              resourceType: 'message',
              action: 'create',
            });
            message = null;
          }
          sendJson(response, 201, { message });
        });
        return;
      }


      const chatDocumentId = documentIdFromPath(pathname, '/chat');
      if (chatDocumentId && method === 'POST') {
        await handleProtected(request, response, services, async (currentUser) => {
          const body = await readJsonBody(request);
          const result = await services.documentAi.answerQuestion({
            currentUser,
            documentId: chatDocumentId,
            question: body.question,
          });
          sendJson(response, result.statusCode, { answer: result.answer, retrievedChunks: result.retrievedChunks });
        });
        return;
      }
      const chunksDocumentId = documentIdFromPath(pathname, '/chunks');
      if (chunksDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          let chunks;
          if (typeof services.documents.listChunks === 'function') {
            chunks = await services.documents.listChunks({ currentUser, documentId: chunksDocumentId });
          } else {
            await requireDocumentChildAuthorization(services, {
              currentUser,
              documentId: chunksDocumentId,
              resourceType: 'chunk',
              action: 'read',
            });
            chunks = [];
          }
          sendJson(response, 200, { chunks });
        });
        return;
      }

      const citationsDocumentId = documentIdFromPath(pathname, '/citations');
      if (citationsDocumentId && method === 'GET') {
        await handleProtected(request, response, services, async (currentUser) => {
          let citations;
          if (typeof services.documents.listCitations === 'function') {
            citations = await services.documents.listCitations({ currentUser, documentId: citationsDocumentId });
          } else {
            await requireDocumentChildAuthorization(services, {
              currentUser,
              documentId: citationsDocumentId,
              resourceType: 'citation',
              action: 'read',
            });
            citations = [];
          }
          sendJson(response, 200, { citations });
        });
        return;
      }

      if (method === 'GET' && await trySendStaticAsset({ response, staticDir: config.staticDir, pathname })) {
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
  const staticDir = env.DOCULENS_STATIC_DIR || null;
  const port = Number(env.PORT || 3000);
  const host = env.HOST || '127.0.0.1';
  const server = createDocuLensServer({ ...config, staticDir });
  server.listen(port, host, () => {
    console.log(redactSecrets(`DocuLens AI server listening on http://${host}:${port}`, [config.databaseUrl, config.jwtSecret, config.minimax.apiKey]));
  });
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
