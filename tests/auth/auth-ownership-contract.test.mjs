import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixedNow = new Date('2026-07-07T12:00:00.000Z');
const jwtSecret = 'ContractTestJwtSecretWithEnoughEntropy123';

async function importRequired(relativePath, exportNames, purpose) {
  const modulePath = path.join(repoRoot, relativePath);
  try {
    const imported = await import(`${pathToFileURL(modulePath).href}?auth_contract=${Date.now()}-${Math.random()}`);
    for (const exportName of exportNames) {
      if (typeof imported[exportName] === 'function') {
        return imported[exportName];
      }
    }
    assert.fail(`${purpose} must export one of: ${exportNames.join(', ')}`);
  } catch (error) {
    if (error && (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'ENOENT')) {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

function testConfig() {
  return Object.freeze({
    nodeEnv: 'test',
    databaseUrl: 'postgresql://doculens_contract:doculens_contract@127.0.0.1:5432/doculens_contract',
    jwtSecret,
    aiProvider: 'minimax',
    minimax: Object.freeze({
      apiKey: 'minimax-contract-placeholder',
      baseUrl: 'https://api.minimax.chat/v1',
      model: 'MiniMax-M3',
    }),
  });
}

function decodeJwtPayload(token) {
  const segments = token.split('.');
  assert.equal(segments.length, 3, 'accessToken must be a compact JWT with header, payload, and signature');
  return JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
}

function assertDeniedWithoutLeak(response, forbiddenCanaries, label) {
  assert.ok([401, 403, 404].includes(response.status), `${label} must fail closed with 401, 403, or 404`);
  const serialized = JSON.stringify(response.body ?? {});
  for (const canary of forbiddenCanaries) {
    assert.doesNotMatch(serialized, new RegExp(canary, 'i'), `${label} leaked another user's protected content: ${canary}`);
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.equal(typeof address, 'object', 'test server must listen on an ephemeral TCP port');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function requestJson(baseUrl, pathname, { method = 'GET', token, body } = {}) {
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
  let parsed;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    assert.fail(`${method} ${pathname} must return JSON, received: ${text.slice(0, 120)}`);
  }
  return { status: response.status, headers: response.headers, body: parsed };
}

async function registerAndLogin(baseUrl, { email, password, displayName }) {
  const registration = await requestJson(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { email, password, displayName },
  });
  assert.equal(registration.status, 201, `registration for ${email} must create a user`);
  assert.equal(registration.body?.user?.email, email, 'registration response must identify the registered user');
  assert.equal('password' in (registration.body?.user ?? {}), false, 'registration response must not expose plaintext password');
  assert.equal('passwordHash' in (registration.body?.user ?? {}), false, 'registration response must not expose password hash');

  const login = await requestJson(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.status, 200, `login for ${email} must succeed with the registered password`);
  assert.match(login.body?.accessToken ?? '', /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'login must return a compact JWT accessToken');
  assert.match(login.body?.expiresAt ?? '', /^\d{4}-\d{2}-\d{2}T/, 'login must return an absolute token expiration time');

  return { user: registration.body.user, accessToken: login.body.accessToken };
}

test('registration stores a password hash, login returns an expiring JWT, and invalid credentials fail closed', async () => {
  const createAuthService = await importRequired(
    'src/server/auth/service.mjs',
    ['createAuthService', 'createAuthenticationService'],
    'authentication service',
  );
  const storedUsers = [];
  const users = {
    async createUser(record) {
      const passwordHash = record.passwordHash ?? record.password_hash;
      assert.equal(typeof passwordHash, 'string', 'registration must persist a password hash string');
      const user = {
        id: `user-${storedUsers.length + 1}`,
        email: record.email,
        displayName: record.displayName ?? record.display_name,
        passwordHash,
      };
      storedUsers.push(user);
      return { id: user.id, email: user.email, displayName: user.displayName };
    },
    async findByEmail(email) {
      return storedUsers.find((user) => user.email === email) ?? null;
    },
    async findUserByEmail(email) {
      return storedUsers.find((user) => user.email === email) ?? null;
    },
  };
  const auth = createAuthService({ users, jwtSecret, tokenTtlSeconds: 900, now: () => fixedNow });
  const plaintextPassword = 'Correct Horse Battery Staple 2!';

  const registration = await auth.register({
    email: 'alice.auth-contract@example.test',
    password: plaintextPassword,
    displayName: 'Alice Auth Contract',
  });
  const registeredUser = registration.user ?? registration;
  const stored = storedUsers[0];
  assert.equal(stored.email, 'alice.auth-contract@example.test', 'registration must persist the normalized user email');
  assert.equal(stored.displayName, 'Alice Auth Contract', 'registration must persist the supplied display name');
  assert.notEqual(stored.passwordHash, plaintextPassword, 'registration must never store the plaintext password');
  assert.doesNotMatch(stored.passwordHash, /Correct Horse Battery Staple 2!/i, 'password hash must not embed the plaintext password');
  assert.ok(stored.passwordHash.length >= 40, 'stored password credential must be long enough to be a salted password hash');
  assert.equal('password' in registeredUser, false, 'registration result must not expose the plaintext password');
  assert.equal('passwordHash' in registeredUser, false, 'registration result must not expose the password hash');

  await assert.rejects(
    () => auth.login({ email: 'alice.auth-contract@example.test', password: 'wrong-password' }),
    /invalid|unauthorized|credential/i,
    'login must reject an incorrect password for an existing user',
  );
  await assert.rejects(
    () => auth.login({ email: 'missing.auth-contract@example.test', password: plaintextPassword }),
    /invalid|unauthorized|credential/i,
    'login must reject a missing user without distinguishing account existence',
  );

  const login = await auth.login({ email: 'alice.auth-contract@example.test', password: plaintextPassword });
  const accessToken = login.accessToken ?? login.token;
  assert.match(accessToken ?? '', /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, 'valid login must return a signed compact JWT');
  const payload = decodeJwtPayload(accessToken);
  assert.equal(payload.sub, stored.id, 'JWT subject must be the authenticated user id');
  assert.equal(Number.isInteger(payload.exp), true, 'JWT payload must include an integer exp claim');
  assert.ok(payload.exp * 1000 > fixedNow.getTime(), 'JWT exp claim must be in the future');
  assert.ok(payload.exp * 1000 <= fixedNow.getTime() + 900_000, 'JWT exp claim must honor the configured test TTL');
  assert.equal(payload.password, undefined, 'JWT payload must not contain plaintext password material');
  assert.equal(payload.passwordHash, undefined, 'JWT payload must not contain password hash material');
});

test('authenticated document routes reject missing tokens and pass current-user context to handlers', async () => {
  const createDocuLensServer = await importRequired('src/server/index.mjs', ['createDocuLensServer'], 'HTTP server factory');
  const seenCurrentUsers = [];
  const server = createDocuLensServer(testConfig(), {
    auth: {
      async authenticateBearerToken(token) {
        return token === 'alice-route-token' ? { id: 'route-user-alice', email: 'alice.routes@example.test' } : null;
      },
    },
    documents: {
      async createDocument({ currentUser, title, content }) {
        seenCurrentUsers.push(currentUser);
        return { id: 'route-doc-1', userId: currentUser.id, title, contentLength: content.length };
      },
    },
  });
  const baseUrl = await listen(server);
  try {
    const unauthenticated = await requestJson(baseUrl, '/api/documents', {
      method: 'POST',
      body: { title: 'Route Protection NDA', content: 'route protection document text' },
    });
    assertDeniedWithoutLeak(unauthenticated, ['route protection document text'], 'unauthenticated document create');

    const authenticated = await requestJson(baseUrl, '/api/documents', {
      method: 'POST',
      token: 'alice-route-token',
      body: { title: 'Route Protection NDA', content: 'route protection document text' },
    });
    assert.equal(authenticated.status, 201, 'authenticated document create must succeed');
    assert.equal(seenCurrentUsers.length, 1, 'document handler must receive exactly one authenticated current-user context');
    assert.deepEqual(
      seenCurrentUsers[0],
      { id: 'route-user-alice', email: 'alice.routes@example.test' },
      'document handler must receive the user resolved from the bearer token',
    );
  } finally {
    await close(server);
  }
});

test('document create, list, read, and delete endpoints are scoped to the authenticated owner', async () => {
  const createDocuLensServer = await importRequired('src/server/index.mjs', ['createDocuLensServer'], 'HTTP server factory');
  const server = createDocuLensServer(testConfig());
  const baseUrl = await listen(server);
  try {
    const alice = await registerAndLogin(baseUrl, {
      email: 'alice.docs-contract@example.test',
      password: 'Alice docs password 2!',
      displayName: 'Alice Docs',
    });
    const bob = await registerAndLogin(baseUrl, {
      email: 'bob.docs-contract@example.test',
      password: 'Bob docs password 2!',
      displayName: 'Bob Docs',
    });

    const aliceContentCanary = 'ALICE_NDA_SECRET_OWNERSHIP_CANARY';
    const aliceCreate = await requestJson(baseUrl, '/api/documents', {
      method: 'POST',
      token: alice.accessToken,
      body: { title: 'Alice NDA', content: `Confidential terms ${aliceContentCanary}` },
    });
    assert.equal(aliceCreate.status, 201, 'Alice must be able to create her own document');
    const aliceDocumentId = aliceCreate.body?.document?.id ?? aliceCreate.body?.id;
    assert.match(aliceDocumentId ?? '', /^[0-9a-f-]{20,}$/i, 'created document response must include a stable document id');

    const bobCreate = await requestJson(baseUrl, '/api/documents', {
      method: 'POST',
      token: bob.accessToken,
      body: { title: 'Bob NDA', content: 'Bob private content' },
    });
    assert.equal(bobCreate.status, 201, 'Bob must be able to create his own document');
    const bobDocumentId = bobCreate.body?.document?.id ?? bobCreate.body?.id;

    const aliceList = await requestJson(baseUrl, '/api/documents', { token: alice.accessToken });
    assert.equal(aliceList.status, 200, 'Alice document list must succeed');
    const aliceDocuments = aliceList.body?.documents ?? aliceList.body;
    assert.ok(Array.isArray(aliceDocuments), 'document list response must be an array or { documents }');
    assert.equal(aliceDocuments.some((document) => document.id === aliceDocumentId), true, 'Alice list must include Alice document');
    assert.equal(aliceDocuments.some((document) => document.id === bobDocumentId), false, 'Alice list must not include Bob document');

    const aliceRead = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, { token: alice.accessToken });
    assert.equal(aliceRead.status, 200, 'Alice must be able to read her own document by id');
    assert.match(JSON.stringify(aliceRead.body), /ALICE_NDA_SECRET_OWNERSHIP_CANARY/, 'owner read must return the owner document content');

    const bobReadAlice = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, { token: bob.accessToken });
    assertDeniedWithoutLeak(bobReadAlice, [aliceContentCanary, 'Alice NDA'], 'Bob direct read of Alice document');

    const bobDeleteAlice = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, {
      method: 'DELETE',
      token: bob.accessToken,
    });
    assertDeniedWithoutLeak(bobDeleteAlice, [aliceContentCanary, 'Alice NDA'], 'Bob direct delete of Alice document');

    const aliceReadAfterBobDeleteAttempt = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, { token: alice.accessToken });
    assert.equal(aliceReadAfterBobDeleteAttempt.status, 200, 'failed cross-user delete must not remove the owner document');

    const aliceDelete = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, {
      method: 'DELETE',
      token: alice.accessToken,
    });
    assert.ok([200, 204].includes(aliceDelete.status), 'owner delete must succeed');

    const aliceReadAfterDelete = await requestJson(baseUrl, `/api/documents/${aliceDocumentId}`, { token: alice.accessToken });
    assert.equal(aliceReadAfterDelete.status, 404, 'deleted owner document must no longer be readable');
  } finally {
    await close(server);
  }
});

test('document service uses owner-scoped resource-id queries and authorizes child resources through the parent document', async () => {
  const createDocumentService = await importRequired(
    'src/server/documents/service.mjs',
    ['createDocumentService', 'createOwnedDocumentService'],
    'owner-scoped document service',
  );
  const ownedDocuments = new Map([
    ['alice-existing-doc', {
      id: 'alice-existing-doc',
      userId: 'user-alice',
      title: 'Alice Existing NDA',
      content: 'ALICE_EXISTING_DOC_PRIVATE_TEXT',
    }],
    ['bob-existing-doc', {
      id: 'bob-existing-doc',
      userId: 'user-bob',
      title: 'Bob Existing NDA',
      content: 'BOB_EXISTING_DOC_PRIVATE_TEXT',
    }],
  ]);
  const repository = {
    async createForUser({ userId, title, content }) {
      const id = `created-${userId}`;
      const row = { id, userId, title, content };
      ownedDocuments.set(id, row);
      return row;
    },
    async listForUser({ userId }) {
      return [...ownedDocuments.values()].filter((document) => document.userId === userId);
    },
    async findByIdForUser({ documentId, userId }) {
      const document = ownedDocuments.get(documentId);
      return document && document.userId === userId ? document : null;
    },
    async deleteByIdForUser({ documentId, userId }) {
      const document = ownedDocuments.get(documentId);
      if (!document || document.userId !== userId) {
        return false;
      }
      ownedDocuments.delete(documentId);
      return true;
    },
  };
  const documents = createDocumentService({ documents: repository });
  const alice = { id: 'user-alice', email: 'alice.service@example.test' };
  const bob = { id: 'user-bob', email: 'bob.service@example.test' };

  const created = await documents.createDocument({ currentUser: alice, title: 'Alice Created NDA', content: 'created by Alice' });
  assert.equal(created.userId, alice.id, 'createDocument must persist the current user as the owner');

  const aliceList = await documents.listDocuments({ currentUser: alice });
  assert.deepEqual(
    aliceList.map((document) => document.id).sort(),
    ['alice-existing-doc', 'created-user-alice'].sort(),
    'listDocuments must return only documents owned by the current user',
  );

  await assert.rejects(
    () => documents.getDocument({ currentUser: bob, documentId: 'alice-existing-doc' }),
    /not found|forbidden|unauthorized/i,
    'getDocument must use both document id and current user id so another owner cannot read it',
  );
  await assert.rejects(
    () => documents.deleteDocument({ currentUser: bob, documentId: 'alice-existing-doc' }),
    /not found|forbidden|unauthorized/i,
    'deleteDocument must use both document id and current user id so another owner cannot delete it',
  );
  assert.equal(ownedDocuments.has('alice-existing-doc'), true, 'failed cross-user delete must leave the owner document intact');

  const childResourceChecks = [
    ['analysis', 'read'],
    ['message', 'read'],
    ['message', 'create'],
    ['chunk', 'read'],
    ['citation', 'read'],
    ['delete-cascade', 'delete'],
  ];
  for (const [resourceType, action] of childResourceChecks) {
    const authorization = await documents.authorizeDocumentChildResource({
      currentUser: alice,
      documentId: 'alice-existing-doc',
      resourceType,
      action,
    });
    assert.equal(authorization.documentId, 'alice-existing-doc', `${resourceType} authorization must resolve the parent document id for the owner`);

    await assert.rejects(
      () => documents.authorizeDocumentChildResource({
        currentUser: bob,
        documentId: 'alice-existing-doc',
        resourceType,
        action,
      }),
      /not found|forbidden|unauthorized/i,
      `${resourceType} ${action} must be denied through parent document ownership`,
    );
  }
});

test('child-resource HTTP routes deny cross-user analysis, message, chunk, citation, and cascade access without leaking document content', async () => {
  const createDocuLensServer = await importRequired('src/server/index.mjs', ['createDocuLensServer'], 'HTTP server factory');
  const server = createDocuLensServer(testConfig());
  const baseUrl = await listen(server);
  try {
    const alice = await registerAndLogin(baseUrl, {
      email: 'alice.child-contract@example.test',
      password: 'Alice child password 2!',
      displayName: 'Alice Child',
    });
    const bob = await registerAndLogin(baseUrl, {
      email: 'bob.child-contract@example.test',
      password: 'Bob child password 2!',
      displayName: 'Bob Child',
    });
    const childCanary = 'ALICE_CHILD_RESOURCE_PRIVATE_TEXT';
    const create = await requestJson(baseUrl, '/api/documents', {
      method: 'POST',
      token: alice.accessToken,
      body: { title: 'Alice Child NDA', content: `Section 1 ${childCanary}` },
    });
    assert.equal(create.status, 201, 'Alice must be able to create a parent document for child-resource authorization');
    const documentId = create.body?.document?.id ?? create.body?.id;

    const deniedRequests = [
      ['GET', `/api/documents/${documentId}/analysis`, undefined, 'analysis read'],
      ['GET', `/api/documents/${documentId}/messages`, undefined, 'message read'],
      ['POST', `/api/documents/${documentId}/messages`, { question: 'Summarize the NDA' }, 'message create'],
      ['GET', `/api/documents/${documentId}/chunks`, undefined, 'retrieved chunk read'],
      ['GET', `/api/documents/${documentId}/citations`, undefined, 'citation read'],
      ['DELETE', `/api/documents/${documentId}`, undefined, 'delete cascade'],
    ];
    for (const [method, pathname, body, label] of deniedRequests) {
      const response = await requestJson(baseUrl, pathname, { method, token: bob.accessToken, body });
      assertDeniedWithoutLeak(response, [childCanary, 'Alice Child NDA'], `Bob ${label} for Alice document`);
    }
  } finally {
    await close(server);
  }
});

test('demo seed data includes both auth users, an owned NDA document, and an adversarial prompt-injection section', async () => {
  const loadDemoSeedData = await importRequired(
    'src/server/demo/seed-data.mjs',
    ['loadDemoSeedData', 'buildDemoSeedData'],
    'demo seed data contract',
  );
  const seed = await loadDemoSeedData();
  const users = seed.users ?? [];
  const documents = seed.documents ?? [];
  const chunks = seed.documentChunks ?? seed.chunks ?? [];

  const demoUser = users.find((user) => user.email === 'demo@doculens.local');
  assert.ok(demoUser, 'seed data must include the demo user used for the assessment walkthrough');
  const authzUser = users.find((user) => user.email === 'authz-test@doculens.local');
  assert.ok(authzUser, 'seed data must include a second authz-test user for cross-user denial checks');
  assert.notEqual(authzUser.id, demoUser.id, 'demo and authz-test users must be distinct owners');

  const ndaDocument = documents.find((document) => document.userId === demoUser.id && /nda/i.test(document.title ?? ''));
  assert.ok(ndaDocument, 'seed data must include an NDA document owned by the demo user');
  const adversarialSection = chunks.find((chunk) => {
    const sameDocument = chunk.documentId === ndaDocument.id || chunk.document_id === ndaDocument.id;
    const text = `${chunk.headingPath ?? chunk.heading_path ?? ''} ${chunk.content ?? ''}`;
    return sameDocument && /prompt[- ]?injection|ignore (?:all )?(?:previous|prior) instructions|reveal secrets|untrusted document/i.test(text);
  });
  assert.ok(adversarialSection, 'seeded NDA must contain an adversarial prompt-injection section as untrusted document text');
  assert.doesNotMatch(
    `${adversarialSection.content ?? ''}`,
    /MINIMAX_API_KEY|JWT_SECRET|postgres(?:ql)?:\/\//i,
    'adversarial seed content must not contain real-looking secrets or connection URLs',
  );
});
