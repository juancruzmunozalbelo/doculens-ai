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
  navIntake: 'nav.intake',
  navWorkspace: 'nav.workspace',
  sampleCta: 'intake.sample-cta',
  pastePanel: 'intake.paste-panel',
  pdfPanel: 'intake.pdf-panel',
  pdfInput: 'intake.pdf-input',
  pdfSubmit: 'intake.pdf-submit',
  workspaceRoot: 'workspace.root',
  sourceEvidence: 'workspace.source-evidence',
  answerCard: 'answer.card',
  evidenceChip: 'answer.evidence-chip',
  trustBar: 'ai.trust-bar',
  aiDetails: 'ai.details',
  sourceCreate: 'source.create',
  sourceRail: 'source.rail',
  sourceCard: 'source.card',
  sourceStatus: 'source.status',
  activeSource: 'source.active',
  reviewBriefing: 'review.briefing',
  starterQuestions: 'review.starter-questions',
  starterQuestion: 'review.starter-question',
  trustSummary: 'trust.summary',
  technicalDetails: 'trust.technical-details',
  inlineCitation: 'answer.inline-citation',
  evidencePanel: 'evidence.panel',
  evidenceSource: 'evidence.source',
  evidenceSection: 'evidence.section',
  evidenceExcerpt: 'evidence.excerpt',
  pdfSelected: 'pdf.selected-source',
  pdfStatus: 'pdf.status',
  pdfRecovery: 'pdf.recovery',
  pasteTextFallback: 'pdf.paste-text-fallback',
  sourceManagement: 'source.management',
  printOutput: 'print.review-output',
});

const accessToken = 'ui-e2e-access-token';
const sampleDocumentId = 'seed-nda-contract';
const pastedDocumentId = 'doc-ui-e2e-001';
const pdfDocumentId = 'doc-ui-pdf-001';
const recentDocumentId = 'doc-recent-needs-detail';
const rawChunkUuid = '018f4d31-229a-7cc8-9f9d-uuid-raw-confidentiality';
const secondRawChunkUuid = '018f4d31-229a-7cc8-9f9d-uuid-raw-return';
const rawProviderResponseId = 'provider-response-ui-raw-123';
const rawProviderPayloadCanary = 'RAW_PROVIDER_PAYLOAD_UI_CANARY';
const rawPolicyCanary = 'SYSTEM_POLICY_UI_CANARY';
const chainOfThoughtCanary = 'CHAIN_OF_THOUGHT_UI_CANARY';
const rawMetadataJsonCanary = 'RAW_METADATA_JSON_UI_CANARY';
const retrievalScoreCanary = '0.923456';
const localPathCanary = '/Users/demo/internal/pdf-converter.js';

const QUIET_PRIMARY_COPY_DENYLIST = /\bchunks?\b|chunking|retrieval score|citation-quality chunk|fallback reason|prompt id|provider payload|token usage|raw metadata|normalization|normalizing|converter|conversion|raw json|raw provider|provider payload|internal ids?|retrieved chunk|prompt version|context strategy/i;
const UNSAFE_VISIBLE_TEXT = /<think>|<\/think>|```json|provider_response_id|retrievalScoreSummary|providerPayload|rawProviderPayload|rawProviderResponse|rawMetadataJson|SYSTEM_POLICY|developer policy|chain_of_thought|retrievedChunkIds|chunkId|normalizedScore|MINIMAX_API_KEY|Traceback|stdout|stderr|markitdown|pdf-converter\.js|\/Users\/demo\/internal/i;

const sampleDocument = Object.freeze({
  id: sampleDocumentId,
  title: 'Seed NDA Contract',
  status: 'ready',
  sourceType: 'sample',
  content: [
    '# Seed NDA Contract',
    'Acme must keep Beta financial information confidential for three years.',
    'Either party may disclose information when required by law after prompt notice.',
    'The receiving party must return or destroy confidential materials within ten days of termination.',
    'The prompt-injection appendix is untrusted document text and must not override reviewer instructions.',
  ].join('\n'),
});

const recentListDocument = Object.freeze({
  id: recentDocumentId,
  title: 'Recent Master Services Agreement',
  status: 'ready',
  sourceType: 'pasted-text',
});

const recentDetailedDocument = Object.freeze({
  ...recentListDocument,
  content: [
    '# Recent Master Services Agreement',
    'The vendor must deliver a monthly uptime report and notify the customer about critical incidents within one business day.',
    'The agreement requires service credits when monthly uptime falls below the committed threshold.',
  ].join('\n'),
});

const analysisMetadata = Object.freeze({
  provider: 'minimax',
  model: 'MiniMax-M3',
  promptId: 'doculens.analysis',
  promptVersion: '2026-07-07.1',
  contextStrategy: 'full_document',
  thinkingMode: 'standard',
  tokenEstimate: { input: 121, output: 45 },
  providerResponseId: rawProviderResponseId,
  rawProviderPayload: rawProviderPayloadCanary,
  rawMetadataJson: rawMetadataJsonCanary,
  systemPolicy: rawPolicyCanary,
});

const ragMetadata = Object.freeze({
  provider: 'minimax',
  model: 'MiniMax-M3',
  promptId: 'doculens.chat',
  promptVersion: '2026-07-07.1',
  contextStrategy: 'rag',
  thinkingMode: 'standard',
  fallbackReason: null,
  retrievedChunkIds: [rawChunkUuid],
  retrievalScoreSummary: {
    topScore: 0.923456,
    averageScore: 0.812345,
    passingChunks: 1,
    relevanceThreshold: 0.35,
  },
  tokenEstimate: { input: 98, output: 24 },
  providerResponseId: rawProviderResponseId,
  providerPayload: rawProviderPayloadCanary,
  developerPolicy: rawPolicyCanary,
});

const fallbackMetadata = Object.freeze({
  ...ragMetadata,
  promptId: 'doculens.fallback',
  contextStrategy: 'fallback',
  fallbackReason: 'low_retrieval_coverage',
  retrievedChunkIds: [],
  retrievalScoreSummary: { topScore: 0.12, averageScore: 0.1, passingChunks: 0, relevanceThreshold: 0.35 },
  citationPolicy: 'fallback_full_document_no_chunk_citations',
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

function testIdSelector(name) {
  return `[data-testid="${TEST_IDS[name]}"]`;
}

function primaryReviewSurfaces(page) {
  return [
    'sourceCreate',
    'sourceRail',
    'sourceCard',
    'sourceStatus',
    'activeSource',
    'reviewBriefing',
    'starterQuestions',
    'trustSummary',
    'answerCard',
    'evidencePanel',
    'pdfPanel',
    'pdfSelected',
    'pdfStatus',
    'pdfRecovery',
  ].map((name) => page.locator(testIdSelector(name)));
}

function pdfBytes({ extraText = 'Acme Beta PDF NDA text.' } = {}) {
  return Buffer.from([
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj',
    `4 0 obj << /Length ${extraText.length + 35} >> stream`,
    `BT /F1 12 Tf 72 720 Td (${extraText}) Tj ET`,
    'endstream endobj',
    'xref',
    '0 5',
    '0000000000 65535 f ',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n'));
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

async function signIn(page, { delayLoginUntil } = {}) {
  await page.goto('/');
  await expectLoginControls(page);
  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Correct Horse Battery Staple');
  const click = byTestId(page, 'loginSubmit').click();
  if (delayLoginUntil) {
    await expect(byTestId(page, 'loading')).toContainText(/signing in|loading|please wait|preparing/i);
    delayLoginUntil();
  }
  await click;
}

async function expectQuietPrimaryCopy(page) {
  for (const surface of primaryReviewSurfaces(page)) {
    const text = await surface.evaluateAll((nodes) => nodes.map((node) => node.innerText ?? '').join('\n'));
    expect(text).not.toMatch(QUIET_PRIMARY_COPY_DENYLIST);
  }
}

async function expectNoUnsafeReviewerArtifacts(page) {
  await expect(page.locator('body')).not.toContainText(UNSAFE_VISIBLE_TEXT);
  for (const canary of [
    rawProviderResponseId,
    rawProviderPayloadCanary,
    rawMetadataJsonCanary,
    rawChunkUuid,
    secondRawChunkUuid,
    retrievalScoreCanary,
    rawPolicyCanary,
    chainOfThoughtCanary,
    localPathCanary,
  ]) {
    await expect(page.locator('body')).not.toContainText(canary);
  }
}

function analysisFor(document) {
  return {
    summary: `${document.title} requires the reviewer to verify confidentiality, delivery, risk, and recovery obligations in this source.`,
    entities: [
      { name: 'Acme', type: 'party' },
      { name: 'Beta', type: 'party' },
    ],
    obligations: [{ party: 'Acme', text: 'Protect Beta financial information for three years.' }],
    risks: [{ severity: 'medium', text: 'Prompt notice is required before legally compelled disclosure.' }],
    uncertainties: ['The document does not define all permitted recipients.'],
    recommendedQuestions: [
      'What must Acme keep confidential?',
      'Which risks should a reviewer escalate?',
    ],
    metadata: analysisMetadata,
  };
}

function groundedAnswerFor(document, question) {
  const isRecent = document.id === recentDocumentId;
  const safeAnswer = isRecent
    ? 'The vendor must deliver a monthly uptime report and notify the customer about critical incidents within one business day.'
    : 'Acme must protect Beta financial information for three years.';
  const sectionLabel = isRecent ? 'Service reporting' : 'Confidentiality clause';
  const quote = isRecent ? 'deliver a monthly uptime report' : 'confidential for three years';
  const chunkText = isRecent
    ? 'The vendor must deliver a monthly uptime report and notify the customer about critical incidents within one business day.'
    : 'Acme must keep Beta financial information confidential for three years.';

  return {
    answer: {
      text: `<think>${chainOfThoughtCanary}: compare all clauses step by step</think>\n\n\`\`\`json\n{"answer":"${safeAnswer}","provider_response_id":"${rawProviderResponseId}","provider_payload":"${rawProviderPayloadCanary}","policy":"${rawPolicyCanary}","metadata":{"raw":"${rawMetadataJsonCanary}"}}\n\`\`\`\n\n${safeAnswer}`,
      citations: [{ chunkId: rawChunkUuid, label: sectionLabel, quote, citationIndex: 1 }],
      uncertainty: 'low',
      state: 'grounded',
      metadata: ragMetadata,
      unsafeProviderPayload: rawProviderPayloadCanary,
    },
    retrievedChunks: [
      {
        chunkId: rawChunkUuid,
        label: sectionLabel,
        headingPath: [document.title, sectionLabel],
        text: chunkText,
        contentExcerpt: chunkText,
        normalizedScore: 0.923456,
        metadata: { raw: rawMetadataJsonCanary },
      },
    ],
    question,
  };
}

async function installDocuLensApiFake(page, {
  documents = [sampleDocument],
  documentDetails = [sampleDocument, recentDetailedDocument],
  delayLoginUntil,
  delayAnalysisUntil,
  delayPdfUntil,
  onDocumentDetailFetch,
  onChatRequest,
} = {}) {
  const detailsById = new Map(documentDetails.map((document) => [document.id, document]));
  detailsById.set(sampleDocument.id, sampleDocument);

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
      await fulfillJson(route, 200, { documents });
      return;
    }

    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const body = route.request().postDataJSON();
    expect(body).toMatchObject({
      title: expect.any(String),
      content: expect.any(String),
    });
    const isSample = /Seed NDA Contract/i.test(body.title) || /financial information confidential for three years/i.test(body.content);
    const document = {
      id: isSample ? sampleDocumentId : pastedDocumentId,
      title: body.title || (isSample ? sampleDocument.title : 'Pasted source'),
      content: body.content,
      status: 'ready',
      sourceType: isSample ? 'sample' : 'pasted-text',
    };
    detailsById.set(document.id, document);
    await fulfillJson(route, 201, { document });
  });

  for (const [documentId, document] of detailsById.entries()) {
    await page.route(`**/api/documents/${documentId}`, async (route) => {
      expect(route.request().method()).toBe('GET');
      expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
      onDocumentDetailFetch?.(documentId);
      await fulfillJson(route, 200, { document });
    });

    await page.route(`**/api/documents/${documentId}/analysis`, async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
      if (delayAnalysisUntil) {
        await delayAnalysisUntil(route.request());
      }
      await fulfillJson(route, 201, { analysis: analysisFor(document) });
    });

    await page.route(`**/api/documents/${documentId}/chat`, async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
      const { question } = route.request().postDataJSON();
      onChatRequest?.({ documentId, question });

      if (/provider error/i.test(question)) {
        await fulfillJson(route, 503, {
          error: `Traceback ${localPathCanary} ${rawProviderPayloadCanary} MINIMAX_API_KEY=secret ${rawPolicyCanary}`,
        });
        return;
      }

      if (/stock price|outside/i.test(question)) {
        await fulfillJson(route, 200, {
          answer: {
            text: 'This question is outside this document. Try asking about confidentiality duties, return obligations, or disclosure exceptions in the selected source.',
            unsupported: true,
            citations: [],
            uncertainty: null,
            state: 'unsupported',
            suggestedQuestions: [
              'What duties does this document describe?',
              'Which sections discuss confidentiality?',
            ],
            metadata: unsupportedMetadata,
          },
          retrievedChunks: [],
        });
        return;
      }

      if (/whole document|summarize everything/i.test(question)) {
        await fulfillJson(route, 201, {
          answer: {
            text: 'Fallback analysis: the NDA centers on confidentiality, compelled disclosure, and material return duties.',
            citations: [],
            uncertainty: 'medium',
            state: 'fallback',
            suggestedRefinements: [
              'Ask about confidentiality duties.',
              'Ask which sections mention return or destruction of materials.',
            ],
            metadata: fallbackMetadata,
          },
          retrievedChunks: [],
        });
        return;
      }

      await fulfillJson(route, 201, groundedAnswerFor(document, question));
    });
  }

  await page.route('**/api/documents/uploads/pdf', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    expect(route.request().headers()['content-type']).toMatch(/multipart\/form-data/i);
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    expect(body).toContain('form-data; name="file"');

    if (body.includes('Scanned-NDA.pdf')) {
      await fulfillJson(route, 422, {
        error: `No readable text was extracted. markitdown stderr: ${localPathCanary} ${rawProviderPayloadCanary}`,
      });
      return;
    }
    if (body.includes('Oversized-NDA.pdf')) {
      await fulfillJson(route, 413, {
        error: 'PDF exceeds max page and byte limits. multipart parser raw metadata hidden.',
      });
      return;
    }
    if (body.includes('Temporary-Down-NDA.pdf')) {
      await fulfillJson(route, 503, {
        error: `converter backend timeout stdout=${rawMetadataJsonCanary} stack=${localPathCanary}`,
      });
      return;
    }
    if (body.includes('Not-A-PDF.txt')) {
      await fulfillJson(route, 415, {
        error: 'Unsupported file type from MIME parser internals. Upload a text-based PDF or paste the document text instead.',
      });
      return;
    }

    expect(body).toMatch(/filename="Acme-Beta-NDA\.pdf"/);
    if (delayPdfUntil) {
      await delayPdfUntil(route.request());
    }
    const document = {
      id: pdfDocumentId,
      title: 'Acme Beta PDF NDA',
      content: 'Acme must keep Beta financial information confidential for three years in this PDF source.',
      status: 'ready',
      sourceType: 'pdf',
    };
    detailsById.set(document.id, document);
    await fulfillJson(route, 201, { document });
  });

  await page.route(`**/api/documents/${pdfDocumentId}/analysis`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    await fulfillJson(route, 201, { analysis: analysisFor({ ...sampleDocument, id: pdfDocumentId, title: 'Acme Beta PDF NDA' }) });
  });

  await page.route(`**/api/documents/${pdfDocumentId}/chat`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const { question } = route.request().postDataJSON();
    onChatRequest?.({ documentId: pdfDocumentId, question });
    await fulfillJson(route, 201, groundedAnswerFor({ ...sampleDocument, id: pdfDocumentId, title: 'Acme Beta PDF NDA' }, question));
  });
}

async function openSampleSource(page) {
  const existingCard = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  if (await existingCard.count()) {
    await existingCard.click();
    return;
  }
  await byTestId(page, 'sampleCta').click();
}

async function askQuestion(page, question) {
  await byTestId(page, 'chatInput').fill(question);
  await byTestId(page, 'chatSubmit').click();
}

test('source-first notebook creates a ready active source, offers briefing and starter questions before analysis, and keeps chat scoped to the source', async ({ page }) => {
  let releaseAnalysis;
  const analysisRequestSeen = new Promise((resolve) => {
    releaseAnalysis = resolve;
  });
  const chatRequests = [];
  await installDocuLensApiFake(page, {
    documents: [],
    delayAnalysisUntil: async () => {
      await analysisRequestSeen;
    },
    onChatRequest: (request) => chatRequests.push(request),
  });
  await signIn(page);

  await expect(byTestId(page, 'sourceCreate')).toBeVisible();
  await expect(byTestId(page, 'sourceCreate')).toContainText(/create (a )?source|start a review/i);
  await expect(byTestId(page, 'sourceCreate')).toContainText(/sample|pdf|paste/i);
  await expectQuietPrimaryCopy(page);

  await byTestId(page, 'sampleCta').click();

  await expect(byTestId(page, 'sourceRail')).toBeVisible();
  const sourceCard = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toContainText(/Ready/i);
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'sourceStatus')).toContainText(/Ready/i);
  await expect(byTestId(page, 'evidencePanel')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/financial information confidential for three years/i);

  await expect(byTestId(page, 'reviewBriefing')).toBeVisible();
  await expect(byTestId(page, 'reviewBriefing')).toContainText(/Generate (review )?(summary|briefing)/i);
  await expect(byTestId(page, 'reviewBriefing')).not.toContainText(/Run structured analysis/i);
  await expect(byTestId(page, 'starterQuestions')).toBeVisible();
  await expect(byTestId(page, 'starterQuestions')).toContainText(/what|obligation|risk|deliverable|section/i);
  await expect(byTestId(page, 'technicalDetails')).toBeVisible();
  await expect(byTestId(page, 'technicalDetails')).not.toHaveAttribute('open', /.+/);
  await expectQuietPrimaryCopy(page);

  const starterText = (await byTestId(page, 'starterQuestion').first().innerText()).trim();
  await byTestId(page, 'starterQuestion').first().click();
  await expect(byTestId(page, 'chatInput')).toHaveValue(starterText);
  await byTestId(page, 'chatSubmit').click();
  await expect(byTestId(page, 'answerCard').first()).toContainText(/Based on this document|Acme must protect Beta financial information/i);
  expect(chatRequests.at(-1)).toMatchObject({ documentId: sampleDocumentId, question: starterText });
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);

  const analyzeClick = byTestId(page, 'documentAnalyze').click();
  await expect(byTestId(page, 'loading')).toContainText(/Generating summary|Generating review briefing|Preparing document/i);
  await expect(byTestId(page, 'loading')).not.toContainText(QUIET_PRIMARY_COPY_DENYLIST);
  releaseAnalysis();
  await analyzeClick;

  await expect(byTestId(page, 'reviewBriefing')).toContainText(/verify confidentiality, delivery, risk, and recovery obligations/i);
  await expect(byTestId(page, 'reviewBriefing')).toContainText(/Obligations|Risks|Uncertainties|Recommended/i);
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('answer cards normalize JSON-shaped provider text and inline citations select persistent evidence', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);

  await askQuestion(page, 'What must Acme keep confidential?');

  const answerCard = byTestId(page, 'answerCard').first();
  await expect(answerCard).toContainText('Acme must protect Beta financial information for three years');
  await expect(answerCard).toContainText(/Based on this document/i);
  await expect(byTestId(page, 'trustSummary')).toContainText(/Based on this document/i);
  await expect(byTestId(page, 'trustSummary')).toContainText(/1\s+citation/i);
  await expect(answerCard).not.toContainText(UNSAFE_VISIBLE_TEXT);
  await expect(answerCard).not.toContainText(/\{"answer"|provider_response_id|RAW_PROVIDER_PAYLOAD_UI_CANARY|SYSTEM_POLICY_UI_CANARY/i);

  await expect(byTestId(page, 'inlineCitation').first()).toBeVisible();
  await expect(byTestId(page, 'inlineCitation').first()).toContainText(/1|Confidentiality/i);
  await byTestId(page, 'inlineCitation').first().click();

  await expect(byTestId(page, 'evidencePanel')).toBeVisible();
  await expect(byTestId(page, 'evidenceSource')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'evidenceSection')).toContainText(/Confidentiality clause/i);
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/confidential for three years/i);
  await expect(byTestId(page, 'evidencePanel')).not.toContainText(/chunk|retrieval score|0\.923456|018f4d31|raw metadata/i);

  await expect(byTestId(page, 'technicalDetails')).not.toHaveAttribute('open', /.+/);
  await byTestId(page, 'technicalDetails').click();
  await expect(byTestId(page, 'technicalDetails')).toContainText(/Provider|model|prompt|retrieval|citation|token/i);
  await expect(byTestId(page, 'technicalDetails')).not.toContainText(UNSAFE_VISIBLE_TEXT);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('fallback without citations renders not-enough-evidence guidance and outside-document questions render an unsupported state', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);

  await askQuestion(page, 'Summarize the whole document.');
  const fallbackCard = byTestId(page, 'answerCard').first();
  await expect(fallbackCard).toContainText(/Not enough evidence|Insufficient evidence/i);
  await expect(fallbackCard).toContainText(/refine|specific|ask about confidentiality|ask which sections/i);
  await expect(fallbackCard).not.toContainText(/Fallback analysis: the NDA centers on confidentiality, compelled disclosure, and material return duties/i);
  await expect(fallbackCard).not.toContainText(/fallback|low_retrieval_coverage|citation-quality|chunk|0 citations/i);
  await expect(byTestId(page, 'trustSummary')).toContainText(/Not enough evidence|Insufficient evidence/i);
  await expect(byTestId(page, 'inlineCitation')).toHaveCount(0);

  await askQuestion(page, 'What is Acme stock price?');
  const unsupportedCard = byTestId(page, 'answerCard').filter({ hasText: /Outside this document|unsupported by this document/i }).first();
  await expect(unsupportedCard).toBeVisible();
  await expect(byTestId(page, 'unsupported')).toContainText(/Outside this document|not supported by this document/i);
  await expect(unsupportedCard).toContainText(/Ask about|confidentiality|duties|sections/i);
  await expect(unsupportedCard).not.toContainText(/generic error|Traceback|outside_document_scope|no_citations_for_unsupported_answer/i);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('opening a recent source fetches document detail when the list response omits content', async ({ page }) => {
  const detailFetches = [];
  await installDocuLensApiFake(page, {
    documents: [recentListDocument],
    documentDetails: [recentDetailedDocument],
    onDocumentDetailFetch: (documentId) => detailFetches.push(documentId),
  });
  await signIn(page);

  const recentCard = byTestId(page, 'sourceCard').filter({ hasText: recentListDocument.title }).first();
  await expect(recentCard).toBeVisible();
  await expect(recentCard).toContainText(/Ready/i);
  await recentCard.click();

  await expect.poll(() => detailFetches.filter((documentId) => documentId === recentDocumentId).length).toBe(1);
  await expect(byTestId(page, 'activeSource')).toContainText(recentListDocument.title);
  await expect(byTestId(page, 'evidencePanel')).toContainText(recentListDocument.title);
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/monthly uptime report|critical incidents within one business day/i);
  await expect(byTestId(page, 'evidencePanel')).not.toContainText(/missing list response|not included in this list response|placeholder|retrieved excerpt/i);
  await expectQuietPrimaryCopy(page);
});

test('PDF upload shows selected and reading states, then creates a ready PDF source with normal review affordances', async ({ page }) => {
  let releasePdf;
  const pdfRequestSeen = new Promise((resolve) => {
    releasePdf = resolve;
  });
  await installDocuLensApiFake(page, {
    documents: [],
    delayPdfUntil: async () => {
      await pdfRequestSeen;
    },
  });
  await signIn(page);

  await byTestId(page, 'pdfInput').setInputFiles({
    name: 'Acme-Beta-NDA.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes(),
  });
  await expect(byTestId(page, 'pdfSelected')).toContainText('Acme-Beta-NDA.pdf');
  await expect(byTestId(page, 'pdfSelected')).toContainText(/PDF/i);
  await expect(byTestId(page, 'pdfPanel')).not.toContainText(/converter|conversion timeout|normalization|chunk/i);

  const submit = byTestId(page, 'pdfSubmit').click();
  await expect(byTestId(page, 'pdfStatus')).toContainText(/Reading PDF|Preparing document/i);
  await expect(byTestId(page, 'pdfStatus')).not.toContainText(QUIET_PRIMARY_COPY_DENYLIST);
  await expect(byTestId(page, 'sourceCard').filter({ hasText: 'Acme-Beta-NDA.pdf' }).first()).toContainText(/Reading PDF|Preparing document/i);
  releasePdf();
  await submit;

  await expect(byTestId(page, 'activeSource')).toContainText('Acme Beta PDF NDA');
  await expect(byTestId(page, 'sourceStatus')).toContainText(/Ready/i);
  await expect(byTestId(page, 'sourceCard').filter({ hasText: 'Acme Beta PDF NDA' }).first()).toContainText(/Ready/i);
  await expect(byTestId(page, 'reviewBriefing')).toContainText(/Generate (review )?(summary|briefing)/i);
  await expect(byTestId(page, 'starterQuestions')).toBeVisible();
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/financial information confidential/i);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('PDF failures preserve safe file context and expose choose-another or paste-text recovery without backend internals', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [] });
  await signIn(page);

  const failures = [
    {
      name: 'Scanned-NDA.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes({ extraText: '' }),
      expected: /could not be read|no readable text|choose another PDF|paste text/i,
    },
    {
      name: 'Oversized-NDA.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes({ extraText: 'large file marker' }),
      expected: /outside the supported limits|too large|choose a smaller PDF|paste text/i,
    },
    {
      name: 'Temporary-Down-NDA.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBytes({ extraText: 'temporary backend failure marker' }),
      expected: /could not read|temporarily unavailable|try again|retry|paste text/i,
    },
  ];

  for (const failure of failures) {
    await byTestId(page, 'pdfInput').setInputFiles({ name: failure.name, mimeType: failure.mimeType, buffer: failure.buffer });
    await expect(byTestId(page, 'pdfSelected')).toContainText(failure.name);
    await byTestId(page, 'pdfSubmit').click();

    await expect(byTestId(page, 'pdfRecovery')).toContainText(failure.expected);
    await expect(byTestId(page, 'pdfRecovery')).toContainText(failure.name);
    await expect(byTestId(page, 'pdfRecovery')).toContainText(/Choose another PDF|Paste text/i);
    await expect(byTestId(page, 'pasteTextFallback')).toBeVisible();
    await expect(byTestId(page, 'pdfRecovery')).not.toContainText(/markitdown|stdout|stderr|Traceback|\/Users\/|converter backend|raw metadata|RAW_PROVIDER_PAYLOAD|RAW_METADATA/i);
    await expectQuietPrimaryCopy(page);
  }

  await byTestId(page, 'pasteTextFallback').click();
  await expect(byTestId(page, 'pastePanel')).toBeVisible();
  await expect(byTestId(page, 'documentContent')).toBeVisible();
});

test('print media keeps the review summary, source, answers, citations, and evidence while hiding app chrome and technical panels', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);
  await byTestId(page, 'documentAnalyze').click();
  await askQuestion(page, 'What must Acme keep confidential?');
  await byTestId(page, 'inlineCitation').first().click();

  await page.emulateMedia({ media: 'print' });

  await expect(byTestId(page, 'printOutput')).toBeVisible();
  await expect(byTestId(page, 'printOutput')).toContainText(/DocuLens review summary|Review summary/i);
  await expect(byTestId(page, 'printOutput')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'printOutput')).toContainText(/verify confidentiality|protect Beta financial information/i);
  await expect(byTestId(page, 'printOutput')).toContainText(/Based on this document|1\s+citation/i);
  await expect(byTestId(page, 'printOutput')).toContainText(/confidential for three years/i);

  for (const selector of [
    testIdSelector('navIntake'),
    testIdSelector('navWorkspace'),
    testIdSelector('sourceManagement'),
    testIdSelector('technicalDetails'),
    `${testIdSelector('workspaceRoot')} form`,
    testIdSelector('pdfPanel'),
  ]) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await expect(byTestId(page, 'printOutput')).not.toContainText(QUIET_PRIMARY_COPY_DENYLIST);
  await expect(byTestId(page, 'printOutput')).not.toContainText(/technical details|provider|prompt|token|raw metadata|retrieval score/i);
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
