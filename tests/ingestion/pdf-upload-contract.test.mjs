import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assessmentPdfBytes = readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/full-stack-ai-engineer-assessment.pdf'));
const assessmentFixtureText = readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/full-stack-ai-engineer-assessment.txt'), 'utf8');
const assessmentGoldenAssertions = JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/golden-assertions.json'), 'utf8'));
const owner = Object.freeze({ id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com' });

async function importRequired(relativePath, exportNames, purpose) {
  const modulePath = path.join(repoRoot, relativePath);
  try {
    const imported = await import(new URL(`file://${modulePath}`).href);
    for (const exportName of exportNames) {
      assert.equal(typeof imported[exportName], 'function', `${purpose} must export ${exportName}`);
    }
    return imported;
  } catch (error) {
    assert.fail(`${purpose} is not implemented at ${relativePath}: ${error.message}`);
  }
}

function testConfig() {
  return Object.freeze({
    nodeEnv: 'test',
    aiProvider: 'unavailable',
    jwtSecret: 'PdfUploadContractJwtSecretWithEnoughEntropy123',
    databaseUrl: 'postgresql://doculens_contract:password@localhost:5432/doculens_contract',
    minimaxApiKey: '',
    minimax: Object.freeze({ apiKey: '' }),
  });
}

function createAuthFake() {
  return {
    async authenticateBearerToken(token) {
      return token === 'owner-token' ? owner : null;
    },
  };
}

function silentLogger() {
  return Object.freeze({
    info() {},
    warn() {},
    error() {},
  });
}

function safePdfBytes(text = 'Acme and Beta PDF NDA text. Acme must keep Beta financial information confidential for three years.') {
  return Buffer.from([
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${text.length + 35} >> stream`,
    `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`,
    'endstream endobj',
    'xref',
    '0 5',
    '0000000000 65535 f ',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n'));
}

function converterError(message, { code, statusCode } = {}) {
  const error = new Error(message);
  if (code) {
    error.code = code;
  }
  if (statusCode) {
    error.statusCode = statusCode;
  }
  return error;
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => (error ? reject(error) : resolve()));
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    setTimeout(resolve, 25).unref();
  });
}

async function createPdfUploadHarness(t, { pdfConverter, pdfUploadLimits, tempRoot, aiProvider, retrievalProvider, analysisRepository, chatRepository } = {}) {
  const { createDocuLensServer } = await importRequired(
    'apps/api/src/server/index.mjs',
    ['createDocuLensServer'],
    'DocuLens server PDF upload route',
  );
  const { createDocumentService, createInMemoryDocumentRepository } = await importRequired(
    'apps/api/src/server/documents/service.mjs',
    ['createDocumentService', 'createInMemoryDocumentRepository'],
    'Document service PDF ingestion pipeline',
  );
  const { createInMemoryChunkRepository } = await importRequired(
    'apps/api/src/server/ingestion/chunk-repository.mjs',
    ['createInMemoryChunkRepository'],
    'Chunk repository PDF ingestion pipeline',
  );

  const documentsRepository = createInMemoryDocumentRepository();
  const chunksRepository = createInMemoryChunkRepository({ documents: documentsRepository });
  const documents = createDocumentService({ documents: documentsRepository, chunks: chunksRepository });
  const server = createDocuLensServer(testConfig(), {
    auth: createAuthFake(),
    documents,
    chunksRepository,
    aiProvider,
    retrievalProvider,
    analysisRepository,
    chatRepository,
    pdfConverter,
    pdfUploadLimits,
    tempRoot,
    logger: silentLogger(),
  });
  t.after(async () => {
    await close(server);
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
  return { baseUrl: await listen(server), documents };
}

async function requestMultipart(baseUrl, { body = Buffer.alloc(0), contentType, token = 'owner-token' } = {}) {
  const url = new URL('/api/documents/uploads/pdf', baseUrl);
  const headers = {
    accept: 'application/json',
    connection: 'close',
    'content-length': body.length,
  };
  if (contentType) {
    headers['content-type'] = contentType;
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return await new Promise((resolve) => {
    let timeout;
    const finish = (value) => {
      clearTimeout(timeout);
      resolve(value);
    };
    const request = httpRequest({
      method: 'POST',
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', (error) => finish({ status: 0, body: { error: error.message } }));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = { raw };
        }
        finish({ status: response.statusCode, body: parsed });
      });
    });
    timeout = setTimeout(() => {
      request.destroy(new Error('request timed out'));
    }, 2_000);
    request.on('error', (error) => finish({ status: 0, body: { error: error.message } }));
    request.end(body);
  });
}

async function requestJson(baseUrl, pathname, { method = 'GET', token = 'owner-token', body } = {}) {
  const headers = { accept: 'application/json' };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers, body: payload });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function multipartBody({ title, file, extraFiles = [], boundary = 'doculens-test-boundary' } = {}) {
  const parts = [];
  function pushText(value) {
    parts.push(Buffer.from(value, 'utf8'));
  }
  if (title !== undefined) {
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name=\"title\"\r\n\r\n${title}\r\n`);
  }
  const files = [];
  if (file) {
    files.push(file);
  }
  files.push(...extraFiles);
  for (const currentFile of files) {
    pushText(`--${boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"${currentFile.filename}\"\r\nContent-Type: ${currentFile.type}\r\n\r\n`);
    parts.push(Buffer.from(currentFile.bytes));
    pushText('\r\n');
  }
  pushText(`--${boundary}--\r\n`);
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function postPdf(baseUrl, {
  token = 'owner-token',
  title = 'Converted PDF NDA',
  filename = 'Acme-Beta-NDA.pdf',
  type = 'application/pdf',
  bytes = safePdfBytes(),
  appendFile = true,
  extraFiles = [],
  omitTitle = false,
} = {}) {
  const multipart = multipartBody({
    title: omitTitle ? undefined : title,
    file: appendFile ? { filename, type, bytes } : null,
    extraFiles: extraFiles.map((extra) => ({
      filename: extra.filename ?? 'extra.pdf',
      type: extra.type ?? 'application/pdf',
      bytes: extra.bytes ?? safePdfBytes('extra'),
    })),
  });
  return requestMultipart(baseUrl, { ...multipart, token });
}

async function postUnauthenticatedUpload(baseUrl) {
  return requestMultipart(baseUrl, { token: null });
}

async function postMalformedMultipart(baseUrl, { token = 'owner-token' } = {}) {
  return requestMultipart(baseUrl, {
    token,
    contentType: 'multipart/form-data; boundary=broken-boundary',
    body: Buffer.from('--broken-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"bad.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4', 'utf8'),
  });
}

async function listFilesRecursive(root) {
  async function walk(current) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    }));
    return nested.flat();
  }
  return walk(root);
}

async function assertNoTempFiles(tempRoot) {
  assert.deepEqual(await listFilesRecursive(tempRoot), [], 'PDF upload must clean up temporary files after success and failure');
}

function assertSafePdfFailure(response, expectedStatus, label, { category } = {}) {
  assert.equal(response.status, expectedStatus, `${label} must use the expected HTTP status`);
  const serialized = JSON.stringify(response.body);
  assert.match(serialized, /error|message/i, `${label} must return a reviewer-safe error payload`);
  if (category) {
    assert.equal(response.body.category, category, `${label} must map to the ${category} PDF failure category`);
  }
  for (const forbidden of [
    '/Users/',
    '/tmp/',
    'Traceback',
    'stack',
    'stack trace',
    'stderr',
    'stdout',
    'markitdown --input',
    'RAW_PDF_TEXT_CANARY',
    'SECRET_SHAPED_VALUE',
    'ConverterBinaryInternalError',
    'LocalPathCanary',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not expose ${forbidden}`);
  }
}

test('authenticated PDF upload converts text-based PDFs through document ingestion and persists safe PDF source metadata', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'doculens-pdf-success-'));
  const converterCalls = [];
  const pdfBytes = safePdfBytes();
  const { baseUrl, documents } = await createPdfUploadHarness(t, {
    tempRoot,
    pdfConverter: {
      async convert(payload) {
        converterCalls.push(payload);
        assert.equal(path.isAbsolute(payload.inputPath), true, 'converter must receive an absolute temp-file path, not a user filename');
        assert.equal(path.basename(payload.inputPath).includes('Acme-Beta-NDA'), false, 'temporary converter input must not reuse the uploaded basename');
        return {
          text: '# Converted PDF NDA\n\nAcme must keep Beta financial information confidential for three years.\n\nThe receiving party must return materials within ten days.',
          pageCount: 1,
        };
      },
    },
  });

  const response = await postPdf(baseUrl, { bytes: pdfBytes });

  assert.equal(response.status, 201, 'successful PDF upload must create a document');
  assert.equal(response.body.document.title, 'Converted PDF NDA');
  assert.equal(response.body.document.status, 'ready');
  assert.equal(response.body.document.sourceType, 'pdf', 'successful upload must identify the document as PDF-derived');
  assert.equal(response.body.document.metadata.sourceMethod, 'pdf_upload');
  assert.equal(response.body.document.metadata.originalBasename, 'Acme-Beta-NDA.pdf');
  assert.equal(response.body.document.metadata.safeOriginalBasename, 'Acme-Beta-NDA.pdf');
  assert.equal(response.body.document.metadata.mimeType, 'application/pdf');
  assert.equal(response.body.document.metadata.sizeBytes, pdfBytes.length);
  assert.match(response.body.document.metadata.uploadedAt, /^\d{4}-\d{2}-\d{2}T/, 'PDF metadata must expose upload time');
  assert.equal(converterCalls.length, 1, 'valid PDFs must be converted exactly once');
  assert.match(response.body.document.content, /Acme must keep Beta financial information confidential for three years/);

  const chunks = await documents.listChunks({ currentUser: owner, documentId: response.body.document.id });
  assert.ok(chunks.length >= 1, 'converted PDF text must flow through the existing chunking pipeline');
  assert.match(
    chunks.map((chunk) => chunk.contentExcerpt).join('\n'),
    /financial information confidential|return materials within ten days/,
    'persisted chunks must be derived from converter text, not the uploaded filename or raw PDF bytes',
  );

  const renamed = await requestJson(baseUrl, `/api/documents/${response.body.document.id}`, {
    method: 'PATCH',
    body: { title: 'Renamed PDF Source' },
  });
  assert.equal(renamed.status, 200, 'rename endpoint must update PDF source title');
  assert.equal(renamed.body.document.title, 'Renamed PDF Source');
  assert.equal(renamed.body.document.content, response.body.document.content, 'rename must preserve source content');
  assert.deepEqual(renamed.body.document.metadata, response.body.document.metadata, 'rename must preserve safe original filename metadata');

  const persisted = await documents.getDocument({ currentUser: owner, documentId: response.body.document.id });
  assert.equal(persisted.title, 'Renamed PDF Source');
  assert.deepEqual(persisted.metadata, response.body.document.metadata, 'safe PDF metadata must survive repository persistence');
  await assertNoTempFiles(tempRoot);
});

test('real assessment PDF endpoint regression covers upload, chunks, analysis, and representative chat semantics', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'doculens-pdf-assessment-regression-'));
  const analysisFixture = {
    summary: 'The Full Stack AI Engineer Assessment asks the candidate to build an AI-powered full-stack document review app with backend APIs, retrieval-grounded AI, React UX, reliability evidence, deployment thinking, and clear deliverables.',
    sections: [
      { title: 'Backend requirements', summary: 'REST API, authentication, analysis, chat, source retrieval, persistence, and ownership checks are required.' },
      { title: 'Frontend requirements', summary: 'React source intake, review briefing, chat input, answer cards, evidence inspection, loading states, and error states are required.' },
      { title: 'Deliverables', summary: 'A runnable Git repository and README must explain setup, architecture, AI design, privacy, reliability, deployment, and trade-offs.' },
    ],
    entities: [{ name: 'Full Stack AI Engineer Assessment', type: 'assessment' }],
    requirements: [
      { category: 'Backend', text: 'Provide REST API endpoints, an LLM provider boundary, persistence, JWT authentication, and ownership checks.' },
      { category: 'Frontend', text: 'Implement React source intake, review briefing, chat input, answer cards, inspectable evidence, loading states, and error states.' },
      { category: 'Deployment', text: 'Describe or provision AWS infrastructure and separate configuration and secrets from code.' },
    ],
    obligations: [],
    deliverables: [{ text: 'Deliver a Git repository with runnable local setup instructions and a README covering architecture, AI design, data flow, privacy, reliability, deployment, and trade-offs.' }],
    risks: [{ severity: 'medium', text: 'Reliability, privacy-safe logging, conversion failures, retrieval misses, provider failures, and network failures need targeted tests and safe recovery.' }],
    uncertainties: ['The assessment does not mandate a single database or AWS topology.'],
    recommendedQuestions: [
      'What are the main requirements in this source?',
      'What deliverables does this source request?',
      'What frontend UX requirements should be implemented?',
    ],
    metadata: { provider: 'minimax', model: 'MiniMax-M3', promptId: 'doculens.analysis', promptVersion: '2026-07-07.1', contextStrategy: 'full_document' },
  };
  const chatCalls = [];
  const answerForQuestion = (payload) => {
    chatCalls.push(payload);
    const lowerQuestion = payload.question.toLowerCase();
    const retrievedChunk = payload.chunks?.[0];
    const chunkId = retrievedChunk?.chunkId;
    const quote = String(retrievedChunk?.contentExcerpt ?? retrievedChunk?.content ?? '').slice(0, 160);
    const citation = chunkId && quote ? [{ chunkId, quote }] : [];
    const metadata = {
      provider: 'minimax',
      model: 'MiniMax-M3',
      promptId: payload.prompt.id,
      promptVersion: payload.prompt.version,
      contextStrategy: payload.contextStrategy,
    };
    if (lowerQuestion.includes('backend')) {
      return {
        text: 'The backend requirements include REST API endpoints for authentication, document creation, analysis, chat, source retrieval, persistence, JWT authentication, ownership checks, and an LLM provider boundary.',
        citations: citation,
        uncertainty: 'low',
        metadata,
      };
    }
    if (lowerQuestion.includes('frontend')) {
      return {
        text: 'The frontend must use React and provide source intake, review briefing, starter questions, chat input, answer cards, inspectable evidence, loading states, empty states, error states, and retry or refine actions.',
        citations: citation,
        uncertainty: 'low',
        metadata,
      };
    }
    if (lowerQuestion.includes('deliverables')) {
      return {
        text: 'The deliverables are a Git repository with runnable local setup instructions and a README explaining architecture, AI design, data flow, privacy decisions, reliability strategy, deployment approach, and trade-offs.',
        citations: citation,
        uncertainty: 'low',
        metadata,
      };
    }
    if (lowerQuestion.includes('requirements')) {
      return {
        text: 'The main requirements cover REST APIs, an LLM provider boundary, retrieval-grounded chat, React reviewer UX, privacy-safe logging, targeted reliability tests, and AWS deployment thinking.',
        citations: citation,
        uncertainty: 'medium',
        metadata,
      };
    }
    return {
      text: 'The assessment is about building an AI-powered full-stack document review application with backend, frontend, retrieval, privacy, reliability, deployment, and deliverable expectations.',
      citations: [],
      uncertainty: 'medium',
      metadata,
    };
  };
  const { baseUrl } = await createPdfUploadHarness(t, {
    tempRoot,
    pdfConverter: async () => ({ text: assessmentFixtureText, pageCount: 3 }),
    aiProvider: {
      async analyzeDocument() {
        return analysisFixture;
      },
      async answerQuestion(payload) {
        return answerForQuestion(payload);
      },
    },
  });

  const upload = await postPdf(baseUrl, {
    title: 'Full Stack AI Engineer Assessment',
    filename: 'full-stack-ai-engineer-assessment.pdf',
    bytes: assessmentPdfBytes,
  });

  assert.equal(upload.status, 201, 'assessment PDF upload must create a ready document');
  assert.equal(upload.body.document.sourceType, 'pdf');
  assert.equal(upload.body.document.status, 'ready');
  assert.equal(upload.body.document.metadata.safeOriginalBasename, 'full-stack-ai-engineer-assessment.pdf');
  assert.equal(upload.body.document.metadata.mimeType, 'application/pdf');
  assert.equal(upload.body.document.metadata.sizeBytes, assessmentPdfBytes.length);
  for (const marker of ['Full Stack AI Engineer Assessment', 'Backend requirements', 'Frontend requirements', 'Deliverables']) {
    assert.match(upload.body.document.content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `uploaded assessment content must include ${marker}`);
  }

  const documentId = upload.body.document.id;
  const chunks = await requestJson(baseUrl, `/api/documents/${documentId}/chunks`);
  assert.equal(chunks.status, 200, 'uploaded assessment chunks must be readable through the endpoint');
  assert.ok(chunks.body.chunks.length >= 8, 'assessment upload must produce enough chunks for retrieval-backed chat');
  assert.equal(
    chunks.body.chunks.every((chunk) => JSON.stringify(chunk.headingPath) === JSON.stringify(['Untitled'])),
    false,
    'assessment upload chunks must expose useful section headings instead of all-Untitled metadata',
  );
  assert.match(
    chunks.body.chunks.map((chunk) => `${chunk.headingPath.join(' ')} ${chunk.contentExcerpt}`).join('\n'),
    /Backend requirements|Frontend requirements|Deliverables/i,
    'chunk endpoint must expose section metadata and excerpts suitable for retrieval',
  );

  const analysis = await requestJson(baseUrl, `/api/documents/${documentId}/analysis`, { method: 'POST' });
  assert.equal(analysis.status, 201, 'assessment analysis endpoint must create a structured briefing');
  assert.match(analysis.body.analysis.summary, /AI-powered full-stack document review app/i);
  assert.ok(analysis.body.analysis.requirements.length >= 2, 'assessment analysis must include requirements rather than fallback-only copy');
  assert.ok(analysis.body.analysis.deliverables.length >= 1, 'assessment analysis must include deliverables rather than fallback-only copy');
  assert.doesNotMatch(JSON.stringify(analysis.body.analysis), /could not convert|```|\[object Object\]|rawProvider|responseId|MINIMAX_API_KEY|\/Users\//i, 'analysis display fields must remain safe and structured');

  const supportedQuestions = [
    { name: 'overview', question: 'What is this document about?', mustMention: ['AI-powered full-stack', 'backend', 'frontend'] },
    { name: 'main requirements', question: 'What are the main requirements in this source?', mustMention: ['REST APIs', 'LLM provider', 'React'] },
    { name: 'backend', question: assessmentGoldenAssertions.chatGoldenQuestions.backend.question, mustMention: ['REST API', 'JWT', 'ownership'] },
    { name: 'frontend', question: assessmentGoldenAssertions.chatGoldenQuestions.frontend.question, mustMention: ['React', 'answer cards', 'loading'] },
    { name: 'deliverables', question: 'What deliverables does this source request?', mustMention: ['Git repository', 'README', 'deployment'] },
  ];
  for (const currentQuestion of supportedQuestions) {
    const chat = await requestJson(baseUrl, `/api/documents/${documentId}/chat`, {
      method: 'POST',
      body: { question: currentQuestion.question },
    });
    assert.equal(chat.status, 201, `${currentQuestion.name} chat question must create an answer`);
    assert.notEqual(chat.body.answer.displayState.kind, 'insufficient_evidence', `${currentQuestion.name} must not degrade to insufficient evidence`);
    assert.ok(['grounded', 'full_document_overview'].includes(chat.body.answer.displayState.kind), `${currentQuestion.name} must be grounded or a source-wide overview`);
    for (const term of currentQuestion.mustMention) {
      assert.match(chat.body.answer.text, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${currentQuestion.name} answer must mention ${term}`);
    }
    assert.doesNotMatch(JSON.stringify({
      text: chat.body.answer.text,
      displayText: chat.body.answer.displayText,
      displayState: chat.body.answer.displayState,
    }), /```|\[object Object\]|rawProvider|responseId|MINIMAX_API_KEY|\/Users\//i, `${currentQuestion.name} answer display fields must not leak unsafe provider or internal output`);
  }

  const unsupported = await requestJson(baseUrl, `/api/documents/${documentId}/chat`, {
    method: 'POST',
    body: { question: 'What is the latest stock price of the company today?' },
  });
  assert.equal(unsupported.status, 200, 'outside-source assessment question must be handled without model fabrication');
  assert.equal(unsupported.body.answer.displayState.kind, 'unsupported');
  assert.deepEqual(unsupported.body.answer.citations, [], 'unsupported assessment answer must not fabricate citations');
  assert.equal(
    chatCalls.some((call) => /latest stock price/i.test(call.question)),
    false,
    'outside-source assessment question must not invoke the AI provider',
  );
});

test('PDF upload sanitizes hostile original basenames before title fallback and metadata persistence', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'doculens-pdf-hostile-name-'));
  const { baseUrl } = await createPdfUploadHarness(t, {
    tempRoot,
    pdfConverter: async () => ({ text: '# Hostile filename source\n\nSafe converted text from a valid PDF.' }),
  });

  const response = await postPdf(baseUrl, {
    omitTitle: true,
    filename: '..\\..\\sk-test_SECRET-token-abc123456789.pdf',
  });

  assert.equal(response.status, 201, 'valid hostile-name PDF upload must still create a source');
  assert.equal(response.body.document.title, 'redacted-filename');
  assert.equal(response.body.document.metadata.originalBasename, 'redacted-filename.pdf');
  assert.equal(response.body.document.metadata.safeOriginalBasename, 'redacted-filename.pdf');
  assert.equal(response.body.document.metadata.sourceMethod, 'pdf_upload');
  assert.match(response.body.document.metadata.uploadedAt, /^\d{4}-\d{2}-\d{2}T/);
  const serialized = JSON.stringify(response.body.document);
  assert.doesNotMatch(serialized, /sk-test|SECRET|token-abc|[\\/]\.\./i, 'source API must not expose hostile path or secret-shaped filename parts');
  await assertNoTempFiles(tempRoot);
});

test('PDF upload rejects unauthenticated, missing, multiple, unsupported/mismatched, protected, malformed, and oversized bodies without conversion or persistence', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'doculens-pdf-validation-'));
  let convertCalls = 0;
  const { baseUrl, documents } = await createPdfUploadHarness(t, {
    tempRoot,
    pdfUploadLimits: { maxFileBytes: 2_048, maxPages: 20, maxExtractedChars: 120_000, conversionTimeoutMs: 15_000 },
    pdfConverter: {
      async convert() {
        convertCalls += 1;
        return { text: 'Should not be reached for validation failures', pageCount: 1 };
      },
    },
  });

  const unauthenticated = await postUnauthenticatedUpload(baseUrl);
  assertSafePdfFailure(unauthenticated, 401, 'unauthenticated upload');

  const missingFile = await postPdf(baseUrl, { appendFile: false });
  assertSafePdfFailure(missingFile, 400, 'missing file upload');

  const multipleFiles = await postPdf(baseUrl, {
    extraFiles: [{ filename: 'second.pdf', bytes: safePdfBytes('second file') }],
  });
  assertSafePdfFailure(multipleFiles, 400, 'multiple file upload');

  const unsupported = await postPdf(baseUrl, {
    filename: 'Acme-Beta-NDA.txt',
    type: 'text/plain',
    bytes: Buffer.from('plain text is not a PDF'),
  });
  assertSafePdfFailure(unsupported, 415, 'unsupported upload', { category: 'unsupported_or_mismatch' });

  const mismatched = await postPdf(baseUrl, {
    filename: 'Acme-Beta-NDA.pdf',
    type: 'application/pdf',
    bytes: Buffer.from('not actually a PDF despite the extension'),
  });
  assertSafePdfFailure(mismatched, 415, 'PDF extension with non-PDF bytes', { category: 'unsupported_or_mismatch' });

  const encrypted = await postPdf(baseUrl, {
    bytes: Buffer.concat([safePdfBytes('encrypted PDF'), Buffer.from('\n/Encrypt')]),
  });
  assertSafePdfFailure(encrypted, 422, 'encrypted or protected upload', { category: 'unreadable_or_protected' });

  const malformedBody = await postMalformedMultipart(baseUrl);
  assertSafePdfFailure(malformedBody, 400, 'malformed multipart upload');

  const oversized = await postPdf(baseUrl, {
    bytes: Buffer.concat([safePdfBytes('large PDF'), Buffer.alloc(2_048, 'x')]),
  });
  assertSafePdfFailure(oversized, 413, 'oversized upload', { category: 'oversized' });

  assert.equal(convertCalls, 0, 'validation failures must not invoke the converter');
  assert.deepEqual(await documents.listDocuments({ currentUser: owner }), [], 'validation failures must not create ready documents');
  await assertNoTempFiles(tempRoot);
});

test('PDF conversion failures for malformed, scanned/no-text, converter unavailable, and backend failure paths are categorized safely and leave no partial state', async (t) => {
  const scenarios = [
    {
      label: 'malformed PDF',
      expectedStatus: 422,
      expectedCategory: 'unsupported_or_mismatch',
      converter: async () => {
        throw converterError('ConverterBinaryInternalError: Traceback /Users/demo/pdf.py RAW_PDF_TEXT_CANARY SECRET_SHAPED_VALUE', {
          code: 'PDF_MALFORMED',
          statusCode: 422,
        });
      },
    },
    {
      label: 'scanned no-text PDF',
      expectedStatus: 422,
      expectedCategory: 'unreadable_or_protected',
      converter: async () => ({ text: '   \n\t', pageCount: 3 }),
    },
    {
      label: 'converter unavailable',
      expectedStatus: 503,
      expectedCategory: 'processing_failed',
      converter: async () => {
        throw converterError('markitdown --input /tmp/private.pdf failed with stderr Traceback SECRET_SHAPED_VALUE', {
          code: 'CONVERTER_UNAVAILABLE',
        });
      },
    },
    {
      label: 'backend processing failure',
      expectedStatus: 503,
      expectedCategory: 'processing_failed',
      converter: async () => {
        throw converterError('BackendFailure stdout=RAW_PDF_TEXT_CANARY stderr=SECRET_SHAPED_VALUE stack trace at /Users/demo/LocalPathCanary/pdf-worker.js', {
          code: 'PDF_BACKEND_FAILURE',
          statusCode: 503,
        });
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.label, async (st) => {
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), `doculens-pdf-${scenario.expectedStatus}-`));
      const { baseUrl, documents } = await createPdfUploadHarness(st, {
        tempRoot,
        pdfConverter: { convert: scenario.converter },
      });

      const response = await postPdf(baseUrl, { title: `${scenario.label} document` });

      assertSafePdfFailure(response, scenario.expectedStatus, scenario.label, { category: scenario.expectedCategory });
      assert.deepEqual(await documents.listDocuments({ currentUser: owner }), [], `${scenario.label} must not create a ready document`);
      await assertNoTempFiles(tempRoot);
    });
  }
});
