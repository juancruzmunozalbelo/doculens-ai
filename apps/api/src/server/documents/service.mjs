import { randomUUID, createHash } from 'node:crypto';
import { normalizeDocumentText } from '../ingestion/normalization.mjs';
import { chunkDocument } from '../ingestion/chunking.mjs';

export class DocumentAccessError extends Error {
  constructor(message = 'Document not found', statusCode = 404) {
    super(message);
    this.name = 'DocumentAccessError';
    this.statusCode = statusCode;
  }
}

function requireCurrentUser(currentUser) {
  if (!currentUser || typeof currentUser.id !== 'string' || currentUser.id === '') {
    throw new DocumentAccessError('Unauthorized', 401);
  }
  return currentUser;
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    const error = new Error(`${field} is required`);
    error.statusCode = 400;
    throw error;
  }
  return value.trim();
}

function documentNotFound() {
  return new DocumentAccessError('Document not found', 404);
}

function contentSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function publicDocument(row, { includeContent = true } = {}) {
  const document = {
    id: row.id,
    userId: row.userId ?? row.user_id,
    title: row.title,
    sourceType: row.sourceType ?? row.source_type ?? 'markdown',
    status: row.status ?? 'ready',
    tokenEstimate: row.tokenEstimate ?? row.token_estimate ?? 0,
    metadata: row.metadata ?? {},
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
  };
  if (includeContent && 'content' in row) {
    document.content = row.content;
  }
  return document;
}

export function createInMemoryUserRepository(initialUsers = []) {
  const usersById = new Map();
  const usersByEmail = new Map();

  function store(user) {
    usersById.set(user.id, user);
    usersByEmail.set(user.email, user);
    return user;
  }

  for (const user of initialUsers) {
    store({ ...user, email: String(user.email).toLowerCase() });
  }

  return {
    async createUser({ email, passwordHash, displayName }) {
      const normalizedEmail = String(email).toLowerCase();
      if (usersByEmail.has(normalizedEmail)) {
        const error = new Error('User already exists');
        error.statusCode = 409;
        throw error;
      }
      const user = store({ id: randomUUID(), email: normalizedEmail, passwordHash, displayName });
      return publicUser(user);
    },
    async findByEmail(email) {
      return usersByEmail.get(String(email).toLowerCase()) ?? null;
    },
    async findById(id) {
      return usersById.get(id) ?? null;
    },
  };
}

function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.displayName ?? user.display_name };
}

export function createInMemoryDocumentRepository(initialDocuments = []) {
  const documents = new Map();
  for (const document of initialDocuments) {
    documents.set(document.id, { ...document, deletedAt: document.deletedAt ?? document.deleted_at ?? null });
  }

  function visible(document) {
    return document && !document.deletedAt && !document.deleted_at && document.status !== 'failed';
  }

  return {
    async createForUser({ userId, title, content, status = 'ready' }) {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        userId,
        title,
        content,
        sourceType: 'markdown',
        status,
        contentSha256: contentSha256(content),
        tokenEstimate: content.split(/\s+/).filter(Boolean).length,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      documents.set(row.id, row);
      return row;
    },
    async listForUser({ userId }) {
      return [...documents.values()].filter((document) => visible(document) && document.userId === userId);
    },
    async findByIdForUser({ documentId, userId }) {
      const document = documents.get(documentId);
      return visible(document) && document.userId === userId ? document : null;
    },
    async deleteByIdForUser({ documentId, userId }) {
      const document = documents.get(documentId);
      if (!visible(document) || document.userId !== userId) {
        return false;
      }
      documents.delete(documentId);
      return true;
    },
    async markFailedForUser({ documentId, userId, reason }) {
      const document = documents.get(documentId);
      if (!visible(document) || document.userId !== userId) {
        return null;
      }
      document.status = 'failed';
      document.failureReason = String(reason ?? 'ingestion failed');
      document.updatedAt = new Date().toISOString();
      return document;
    },
  };
}

export function createDocumentService({ documents, chunks, ingestion = {} } = {}) {
  if (!documents) {
    throw new Error('documents repository is required');
  }

  const normalize = ingestion.normalize ?? normalizeDocumentText;
  const chunk = ingestion.chunk ?? chunkDocument;

  function publicChunk(row) {
    const content = row.content ?? '';
    return {
      id: row.id,
      documentId: row.documentId ?? row.document_id,
      chunkId: row.chunkId ?? row.chunk_id,
      headingPath: row.headingPath ?? row.heading_path ?? [],
      chunkIndex: row.chunkIndex ?? row.chunk_index,
      tokenEstimate: row.tokenEstimate ?? row.token_estimate ?? 0,
      contentExcerpt: content.length > 240 ? `${content.slice(0, 237)}...` : content,
      retrievalMetadata: row.retrievalMetadata ?? row.retrieval_metadata ?? {},
      createdAt: row.createdAt ?? row.created_at,
    };
  }

  async function createDocument({ currentUser, title, content }) {
    const user = requireCurrentUser(currentUser);
    const normalizedContent = normalize(requireText(content, 'content'));
    if (normalizedContent === '') {
      const error = new Error('content is required');
      error.statusCode = 400;
      throw error;
    }

    const created = await documents.createForUser({
      userId: user.id,
      title: requireText(title, 'title'),
      content: normalizedContent,
    });

    if (!chunks) {
      return publicDocument(created);
    }

    try {
      const createdChunks = chunk({ documentId: created.id, content: normalizedContent });
      await chunks.createManyForDocument({
        documentId: created.id,
        userId: user.id,
        chunks: createdChunks,
      });
    } catch (error) {
      if (typeof chunks.deleteForDocument === 'function') {
        await chunks.deleteForDocument({ documentId: created.id });
      }
      if (typeof documents.markFailedForUser === 'function') {
        await documents.markFailedForUser({
          documentId: created.id,
          userId: user.id,
          reason: error.message,
        });
      } else if (typeof documents.deleteByIdForUser === 'function') {
        await documents.deleteByIdForUser({ documentId: created.id, userId: user.id });
      }
      throw error;
    }

    return publicDocument(created);
  }

  async function listDocuments({ currentUser }) {
    const user = requireCurrentUser(currentUser);
    const rows = await documents.listForUser({ userId: user.id });
    return rows.map((document) => publicDocument(document, { includeContent: false }));
  }

  async function getDocument({ currentUser, documentId }) {
    const user = requireCurrentUser(currentUser);
    const document = await documents.findByIdForUser({ documentId, userId: user.id });
    if (!document) {
      throw documentNotFound();
    }
    return publicDocument(document);
  }

  async function deleteDocument({ currentUser, documentId }) {
    const user = requireCurrentUser(currentUser);
    const deleted = await documents.deleteByIdForUser({ documentId, userId: user.id });
    if (!deleted) {
      throw documentNotFound();
    }
    return { deleted: true, documentId };
  }

  async function authorizeDocumentChildResource({ currentUser, documentId, resourceType, action }) {
    const document = await getDocument({ currentUser, documentId });
    return { documentId: document.id, userId: document.userId, resourceType, action };
  }

  async function listAnalysis({ currentUser, documentId }) {
    await authorizeDocumentChildResource({ currentUser, documentId, resourceType: 'analysis', action: 'read' });
    return [];
  }

  async function listMessages({ currentUser, documentId }) {
    await authorizeDocumentChildResource({ currentUser, documentId, resourceType: 'message', action: 'read' });
    return [];
  }

  async function createMessage({ currentUser, documentId, question }) {
    await authorizeDocumentChildResource({ currentUser, documentId, resourceType: 'message', action: 'create' });
    return { id: randomUUID(), documentId, role: 'user', content: requireText(question, 'question') };
  }

  async function listChunks({ currentUser, documentId }) {
    const authorization = await authorizeDocumentChildResource({ currentUser, documentId, resourceType: 'chunk', action: 'read' });
    if (!chunks || typeof chunks.listForDocumentForUser !== 'function') {
      return [];
    }
    const rows = await chunks.listForDocumentForUser({
      documentId: authorization.documentId,
      userId: authorization.userId,
    });
    return rows.map(publicChunk);
  }

  async function listCitations({ currentUser, documentId }) {
    await authorizeDocumentChildResource({ currentUser, documentId, resourceType: 'citation', action: 'read' });
    return [];
  }

  return {
    createDocument,
    listDocuments,
    getDocument,
    deleteDocument,
    authorizeDocumentChildResource,
    listAnalysis,
    listMessages,
    createMessage,
    listChunks,
    listCitations,
  };
}

export const createOwnedDocumentService = createDocumentService;
