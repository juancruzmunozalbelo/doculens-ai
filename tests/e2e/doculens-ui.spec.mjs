import { expect, test } from '@playwright/test';

const TEST_IDS = Object.freeze({
  email: 'auth.email-input',
  password: 'auth.password-input',
  loginSubmit: 'auth.login-submit',
  documentTitle: 'document.title-input',
  documentContent: 'document.content-input',
  documentSubmit: 'document.submit',
  documentAnalyze: 'document.analyze',
  analysisPanel: 'analysis.panel',
  analysisSummary: 'analysis.summary',
  chatInput: 'chat.input',
  chatSubmit: 'chat.submit',
  chatAnswer: 'chat.answer',
  chatCitations: 'chat.citations',
  chatRetrievedChunks: 'chat.retrieved-chunks',
  aiMetadata: 'ai.metadata',
  loading: 'state.loading',
  error: 'state.error',
  empty: 'state.empty',
  unsupported: 'answer.unsupported',
});

const accessToken = 'ui-e2e-access-token';
const documentId = 'doc-ui-e2e-001';
const analysisMetadata = Object.freeze({
  provider: 'minimax',
  model: 'MiniMax-M3',
  promptId: 'doculens.analysis',
  promptVersion: '2026-07-07.1',
  contextStrategy: 'full_document',
  thinkingMode: 'standard',
  tokenEstimate: { input: 121, output: 45 },
});
const ragMetadata = Object.freeze({
  provider: 'minimax',
  model: 'MiniMax-M3',
  promptId: 'doculens.chat',
  promptVersion: '2026-07-07.1',
  contextStrategy: 'rag',
  thinkingMode: 'standard',
  fallbackReason: null,
  retrievedChunkIds: ['chunk-confidentiality', 'chunk-return'],
  retrievalScoreSummary: {
    topScore: 0.92,
    averageScore: 0.81,
    passingChunks: 2,
    relevanceThreshold: 0.35,
  },
  tokenEstimate: { input: 98, output: 24 },
});
const fallbackMetadata = Object.freeze({
  ...ragMetadata,
  promptId: 'doculens.fallback',
  contextStrategy: 'fallback',
  fallbackReason: 'low_retrieval_coverage',
  retrievedChunkIds: [],
  retrievalScoreSummary: { topScore: 0.12, averageScore: 0.1, passingChunks: 0, relevanceThreshold: 0.35 },
});
const unsupportedMetadata = Object.freeze({
  ...ragMetadata,
  contextStrategy: 'unsupported',
  fallbackReason: null,
  unsupportedReason: 'outside_document_scope',
  citationPolicy: 'no_citations_for_unsupported_answer',
  retrievedChunkIds: [],
  retrievalScoreSummary: { topScore: 0, averageScore: 0, passingChunks: 0, relevanceThreshold: 0.35 },
});

function byTestId(page, name) {
  return page.getByTestId(TEST_IDS[name]);
}

async function fulfillJson(route, status, body) {
  await route.fulfill({
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function expectLoginControls(page) {
  await expect(byTestId(page, 'email')).toBeVisible();
  await expect(byTestId(page, 'password')).toBeVisible();
  await expect(byTestId(page, 'loginSubmit')).toBeVisible();
}

async function installDocuLensApiFake(page, { delayLoginUntil } = {}) {
  await page.route('**/api/auth/login', async (route) => {
    if (delayLoginUntil) {
      await delayLoginUntil(route.request());
    }
    await fulfillJson(route, 200, {
      accessToken,
      user: { id: 'user-ui-e2e-001', email: 'demo@doculens.local', displayName: 'Demo Reviewer' },
    });
  });

  await page.route('**/api/documents', async (route) => {
    if (route.request().method() === 'GET') {
      await fulfillJson(route, 200, { documents: [] });
      return;
    }

    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      title: 'Acme Mutual NDA',
      content: expect.stringContaining('financial information confidential for three years'),
    });
    await fulfillJson(route, 201, {
      document: {
        id: documentId,
        title: body.title,
        content: body.content,
        status: 'ready',
      },
    });
  });

  await page.route(`**/api/documents/${documentId}/analysis`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    await fulfillJson(route, 201, {
      analysis: {
        summary: 'The NDA requires Acme to protect Beta financial information for three years.',
        entities: [
          { name: 'Acme', type: 'party' },
          { name: 'Beta', type: 'party' },
        ],
        obligations: [{ party: 'Acme', text: 'Protect Beta financial information for three years.' }],
        risks: [{ severity: 'medium', text: 'Prompt notice is required before legally compelled disclosure.' }],
        uncertainties: ['The document does not define all permitted recipients.'],
        metadata: analysisMetadata,
      },
    });
  });

  await page.route(`**/api/documents/${documentId}/chat`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const { question } = route.request().postDataJSON();

    if (/stock price/i.test(question)) {
      await fulfillJson(route, 200, {
        answer: {
          text: 'This question is not supported by the document.',
          unsupported: true,
          citations: [],
          uncertainty: null,
          metadata: unsupportedMetadata,
        },
        retrievedChunks: [],
      });
      return;
    }

    if (/whole document/i.test(question)) {
      await fulfillJson(route, 201, {
        answer: {
          text: 'Fallback analysis: the NDA centers on confidentiality, compelled disclosure, and material return duties.',
          citations: [],
          uncertainty: 'medium',
          metadata: fallbackMetadata,
        },
        retrievedChunks: [],
      });
      return;
    }

    await fulfillJson(route, 201, {
      answer: {
        text: 'Acme must protect Beta financial information for three years.',
        citations: [{ chunkId: 'chunk-confidentiality', quote: 'confidential for three years', citationIndex: 0 }],
        uncertainty: 'low',
        metadata: ragMetadata,
      },
      retrievedChunks: [
        {
          chunkId: 'chunk-confidentiality',
          text: 'Acme must keep Beta financial information confidential for three years.',
          normalizedScore: 0.92,
        },
        {
          chunkId: 'chunk-return',
          text: 'The receiving party must return or destroy materials within ten days.',
          normalizedScore: 0.7,
        },
      ],
    });
  });
}

test('reviewer flow logs in, submits a document, analyzes it, and renders grounded chat evidence with canonical test ids', async ({ page }) => {
  let releaseLogin;
  const loginRequestSeen = new Promise((resolve) => {
    releaseLogin = resolve;
  });
  await installDocuLensApiFake(page, {
    delayLoginUntil: async () => {
      await loginRequestSeen;
    },
  });

  await page.goto('/');
  await expectLoginControls(page);


  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Correct Horse Battery Staple');
  const loginClick = byTestId(page, 'loginSubmit').click();
  await expect(byTestId(page, 'loading')).toContainText(/signing in|loading|please wait/i);
  releaseLogin();
  await loginClick;

  await expect(byTestId(page, 'empty')).toContainText(/no documents|add a document|empty/i);

  await byTestId(page, 'documentTitle').fill('Acme Mutual NDA');
  await byTestId(page, 'documentContent').fill([
    '# Mutual NDA',
    'Acme must keep Beta financial information confidential for three years.',
    'Either party may disclose information when required by law after prompt notice.',
    'The receiving party must return or destroy confidential materials within ten days of termination.',
  ].join('\n'));
  await byTestId(page, 'documentSubmit').click();

  await expect(byTestId(page, 'documentAnalyze')).toBeVisible();
  await byTestId(page, 'documentAnalyze').click();

  await expect(byTestId(page, 'analysisPanel')).toContainText('Acme Mutual NDA');
  await expect(byTestId(page, 'analysisSummary')).toContainText('protect Beta financial information for three years');
  await expect(byTestId(page, 'analysisPanel')).toContainText('Acme');
  await expect(byTestId(page, 'analysisPanel')).toContainText(/obligations/i);
  await expect(byTestId(page, 'analysisPanel')).toContainText('medium');
  await expect(byTestId(page, 'analysisPanel')).toContainText('does not define all permitted recipients');
  await expect(byTestId(page, 'aiMetadata')).toContainText('minimax');
  await expect(byTestId(page, 'aiMetadata')).toContainText('MiniMax-M3');
  await expect(byTestId(page, 'aiMetadata')).toContainText('doculens.analysis');
  await expect(byTestId(page, 'aiMetadata')).toContainText('2026-07-07.1');
  await expect(byTestId(page, 'aiMetadata')).toContainText('full_document');
  await expect(byTestId(page, 'aiMetadata')).toContainText(/input\D+121/i);
  await expect(byTestId(page, 'aiMetadata')).toContainText(/output\D+45/i);

  await byTestId(page, 'chatInput').fill('What must Acme keep confidential?');
  await byTestId(page, 'chatSubmit').click();
  await expect(byTestId(page, 'chatAnswer')).toContainText('protect Beta financial information for three years');
  await expect(byTestId(page, 'chatAnswer')).toContainText(/uncertainty\D+low/i);
  await expect(byTestId(page, 'chatCitations')).toContainText('chunk-confidentiality');
  await expect(byTestId(page, 'chatCitations')).toContainText('confidential for three years');
  await expect(byTestId(page, 'chatRetrievedChunks')).toContainText('chunk-confidentiality');
  await expect(byTestId(page, 'chatRetrievedChunks')).toContainText('0.92');
  await expect(byTestId(page, 'chatRetrievedChunks')).toContainText('chunk-return');
  await expect(byTestId(page, 'aiMetadata')).toContainText('doculens.chat');
  await expect(byTestId(page, 'aiMetadata')).toContainText('rag');
  await expect(byTestId(page, 'aiMetadata')).toContainText('chunk-confidentiality');
  await expect(byTestId(page, 'aiMetadata')).toContainText('chunk-return');
  await expect(byTestId(page, 'aiMetadata')).toContainText('0.35');

  await byTestId(page, 'chatInput').fill('Summarize the whole document.');
  await byTestId(page, 'chatSubmit').click();
  await expect(byTestId(page, 'chatAnswer')).toContainText('Fallback analysis');
  await expect(byTestId(page, 'chatAnswer')).toContainText(/uncertainty\D+medium/i);
  await expect(byTestId(page, 'aiMetadata')).toContainText('doculens.fallback');
  await expect(byTestId(page, 'aiMetadata')).toContainText('low_retrieval_coverage');

  await byTestId(page, 'chatInput').fill('What is Acme stock price?');
  await byTestId(page, 'chatSubmit').click();
  await expect(byTestId(page, 'unsupported')).toContainText('not supported by the document');
  await expect(byTestId(page, 'aiMetadata')).toContainText('unsupported');
  await expect(byTestId(page, 'aiMetadata')).toContainText('outside_document_scope');
});

test('login failure renders the canonical error state without echoing credentials', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await fulfillJson(route, 401, { error: 'Invalid credentials' });
  });

  await page.goto('/');
  await expectLoginControls(page);


  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Wrong Password 123');
  await byTestId(page, 'loginSubmit').click();

  await expect(byTestId(page, 'error')).toContainText('Invalid credentials');
  await expect(byTestId(page, 'error')).not.toContainText('Wrong Password 123');
});
