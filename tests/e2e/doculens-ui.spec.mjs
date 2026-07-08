import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const assessmentFixtureManifest = JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/manifest.json'), 'utf8'));
const assessmentGoldenAssertions = JSON.parse(readFileSync(path.join(repoRoot, 'tests/fixtures/assessment/golden-assertions.json'), 'utf8'));
const assessmentFixturePdf = readFileSync(path.join(repoRoot, assessmentFixtureManifest.files.pdf.path));

const TEST_IDS = Object.freeze({
  email: 'auth.email-input',
  password: 'auth.password-input',
  loginSubmit: 'auth.login-submit',
  logout: 'auth.logout',
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
  sourceSearch: 'source.search',
  sourceCard: 'source.card',
  sourceStatus: 'source.status',
  activeSource: 'source.active',
  reviewBriefing: 'review.briefing',
  briefingSearch: 'review.briefing-search',
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
const assessmentDocumentId = 'doc-ui-assessment-pdf-001';
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

const assessmentDocument = Object.freeze({
  id: assessmentDocumentId,
  title: 'Full Stack AI Engineer Assessment',
  status: 'ready',
  sourceType: 'pdf',
  content: [
    '# Full Stack AI Engineer Assessment',
    'Backend requirements include a REST API, LLM provider boundary, persistence, JWT authentication, ownership checks, and source retrieval.',
    'Frontend requirements include React, source intake, review briefing, starter questions, chat input, answer cards, inspectable evidence, loading states, empty states, error states, retry, refine, uncertainty, and active source.',
    'Data, privacy, and logging expectations cover stored document data, third-party AI provider use, retention, logs, raw document text, provider payloads, stack traces, secret-shaped values, safe original basename, MIME type, upload time, and source control.',
    'Deployment requirements include AWS, Terraform or CloudFormation, configuration from code, managed secret stores, scaling considerations, API, database, PDF processing, AI provider latency, and teardown.',
    'Deliverables include a Git repository, runnable local setup instructions, README, architecture, AI design, data flow, privacy decisions, reliability strategy, deployment approach, trade-offs, targeted tests, and safe AI provider configuration.',
  ].join('\n'),
  metadata: {
    originalBasename: assessmentFixtureManifest.sourceMetadataExpectations.originalBasename,
    safeOriginalBasename: assessmentFixtureManifest.sourceMetadataExpectations.safeOriginalBasename,
    mimeType: assessmentFixtureManifest.sourceMetadataExpectations.mimeType,
    sizeBytes: assessmentFixtureManifest.sourceMetadataExpectations.sizeBytes,
    sourceMethod: assessmentFixtureManifest.sourceMetadataExpectations.sourceMethod,
    uploadedAt: '2026-07-07T12:00:00.000Z',
  },
});

const fallbackBriefingDocument = Object.freeze({
  id: 'doc-ui-fallback-briefing-001',
  title: 'Recovered Provider Briefing',
  status: 'ready',
  sourceType: 'pasted-text',
  content: [
    '# Recovered Provider Briefing',
    'This source has readable assessment requirements, but the first AI analysis response was fallback-only.',
    'Reviewers should be able to retry analysis without seeing a normal empty structured briefing.',
  ].join('\n'),
});

const longPdfBasename = 'Full_Stack_AI_Engineer_Assessment_With_Extraordinarily_Long_Client_Confidential_Addendum_And_Reviewer_Notes_2026_Final_Final.pdf';
const longFilenameDocument = Object.freeze({
  id: 'doc-ui-long-filename-001',
  title: 'Full Stack AI Engineer Assessment With Extraordinarily Long Client Confidential Addendum And Reviewer Notes 2026 Final Final',
  status: 'ready',
  sourceType: 'pdf',
  content: [
    '# Full Stack AI Engineer Assessment With Extraordinarily Long Client Confidential Addendum And Reviewer Notes 2026 Final Final',
    ...Array.from({ length: 28 }, (_, index) => `Section ${index + 1}: Backend, frontend, data privacy, reliability, deployment, and deliverable review requirements remain readable in the source preview without hiding source controls.`),
  ].join('\n'),
  metadata: {
    originalBasename: longPdfBasename,
    safeOriginalBasename: longPdfBasename,
    mimeType: 'application/pdf',
    sizeBytes: 7818,
    sourceMethod: 'pdf',
    uploadedAt: '2026-07-07T12:00:00.000Z',
  },
});

const longStructuredBriefingDocument = Object.freeze({
  id: 'doc-ui-long-structured-briefing-001',
  title: 'Long Structured Procurement Review',
  status: 'ready',
  sourceType: 'pasted-text',
  content: [
    '# Long Structured Procurement Review',
    'This source contains many requirements, risks, deliverables, and reviewer questions so the briefing must scroll without displacing chat.',
    ...Array.from({ length: 36 }, (_, index) => `Control ${index + 1}: Procurement reviewers must validate ownership, credential rotation, release readiness, latency budgets, rollback planning, and evidence retention.`),
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

const overviewMetadata = Object.freeze({
  ...ragMetadata,
  promptId: 'doculens.fallback',
  contextStrategy: 'fallback',
  fallbackReason: 'global_question',
  retrievedChunkIds: [],
  retrievalScoreSummary: { topScore: 0.9, averageScore: 0.9, passingChunks: 1, relevanceThreshold: 0.35 },
  citationPolicy: 'full_document_overview_no_chunk_citations',
  displayState: {
    kind: 'full_document_overview',
    label: 'Full-document overview',
    message: 'This is a full-document overview, not a precisely cited answer.',
  },
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

async function expectSingleBriefingLoadingStatus(page) {
  const loading = byTestId(page, 'loading');
  await expect(loading).toHaveCount(1);
  await expect(loading).toContainText(/Generating summary|Generating review briefing|Preparing document|Building briefing/i);
  await expect(loading).not.toContainText(QUIET_PRIMARY_COPY_DENYLIST);
  await expect(byTestId(page, 'reviewBriefing').getByTestId(TEST_IDS.loading)).toHaveCount(1);
}

async function expectContainedNarrowSourcePreview(page) {
  const layout = await page.evaluate((testIds) => {
    const root = document.documentElement;
    const select = (testId) => document.querySelector(`[data-testid="${testId}"]`);
    const bounds = (testId) => select(testId)?.getBoundingClientRect();
    const preview = bounds(testIds.evidencePanel);
    const active = bounds(testIds.activeSource);
    const sourceRail = bounds(testIds.sourceManagement);
    const briefing = bounds(testIds.reviewBriefing);
    const previewNode = select(testIds.evidencePanel);
    const horizontallyContained = (rect) => !rect || (rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= root.clientWidth + 2);
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      previewClientHeight: previewNode?.clientHeight ?? 0,
      previewScrollHeight: previewNode?.scrollHeight ?? 0,
      viewportHeight: window.innerHeight,
      previewContained: horizontallyContained(preview),
      activeContained: horizontallyContained(active),
      sourceRailContained: horizontallyContained(sourceRail),
      briefingContained: horizontallyContained(briefing),
      briefingHeight: briefing?.height ?? 0,
    };
  }, TEST_IDS);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 2);
  expect(layout.previewContained).toBe(true);
  expect(layout.activeContained).toBe(true);
  expect(layout.sourceRailContained).toBe(true);
  if (layout.briefingHeight > 0) expect(layout.briefingContained).toBe(true);
  expect(layout.previewClientHeight).toBeLessThanOrEqual(Math.ceil(layout.viewportHeight * 0.65));
  expect(layout.previewScrollHeight).toBeGreaterThan(layout.previewClientHeight);
}

async function expectNoHorizontalPageOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 2);
}

async function expectDesktopLoginLayout(page) {
  await expectNoHorizontalPageOverflow(page);
  const layout = await page.evaluate((testIds) => {
    const form = document.querySelector(`[data-testid="${testIds.loginSubmit}"]`)?.closest('form');
    const hero = form?.previousElementSibling;
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      viewportWidth: window.innerWidth,
      hero: toRect(hero),
      form: toRect(form),
    };
  }, TEST_IDS);

  expect(layout.hero).toBeTruthy();
  expect(layout.form).toBeTruthy();
  expect(layout.hero.left).toBeGreaterThanOrEqual(-2);
  expect(layout.hero.right).toBeLessThanOrEqual(layout.form.left + 8);
  expect(layout.form.right).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(Math.abs(layout.hero.top - layout.form.top)).toBeLessThanOrEqual(24);
}

async function expectNarrowLoginLayout(page) {
  await expectNoHorizontalPageOverflow(page);
  const layout = await page.evaluate((testIds) => {
    const form = document.querySelector(`[data-testid="${testIds.loginSubmit}"]`)?.closest('form');
    const hero = form?.previousElementSibling;
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      viewportWidth: window.innerWidth,
      hero: toRect(hero),
      form: toRect(form),
    };
  }, TEST_IDS);

  expect(layout.hero).toBeTruthy();
  expect(layout.form).toBeTruthy();
  expect(layout.hero.left).toBeGreaterThanOrEqual(-2);
  expect(layout.form.left).toBeGreaterThanOrEqual(-2);
  expect(layout.hero.right).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.form.right).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.hero.bottom).toBeLessThanOrEqual(layout.form.top + 24);
}


async function expectDesktopAddSourceLayout(page) {
  await expect(byTestId(page, 'sourceCreate')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  const layout = await page.evaluate((testIds) => {
    const select = (name) => document.querySelector(`[data-testid="${testIds[name]}"]`);
    const sourceCreate = select('sourceCreate');
    const sourceRail = select('sourceRail');
    const pdfPanel = select('pdfPanel');
    const createColumn = sourceCreate?.parentElement;
    const sourceColumn = createColumn?.nextElementSibling;
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      viewportWidth: window.innerWidth,
      sourceCreate: toRect(sourceCreate),
      sourceRail: toRect(sourceRail),
      pdfPanel: toRect(pdfPanel),
      createColumn: toRect(createColumn),
      sourceColumn: toRect(sourceColumn),
    };
  }, TEST_IDS);

  expect(layout.sourceCreate).toBeTruthy();
  expect(layout.sourceRail).toBeTruthy();
  expect(layout.pdfPanel).toBeTruthy();
  expect(layout.createColumn).toBeTruthy();
  expect(layout.sourceColumn).toBeTruthy();
  expect(layout.sourceCreate.left).toBeGreaterThanOrEqual(-2);
  expect(layout.sourceColumn.left).toBeGreaterThanOrEqual(layout.createColumn.right - 8);
  expect(layout.sourceRail.right).toBeLessThanOrEqual(layout.viewportWidth + 2);
  expect(layout.pdfPanel.left).toBeGreaterThanOrEqual(layout.sourceCreate.left - 2);
  expect(layout.pdfPanel.right).toBeLessThanOrEqual(layout.sourceCreate.right + 2);
  expect(Math.abs(layout.createColumn.top - layout.sourceColumn.top)).toBeLessThanOrEqual(24);
}

async function expectNarrowAddSourceLayout(page) {
  await expect(byTestId(page, 'sourceCreate')).toBeVisible();
  await expect(byTestId(page, 'sourceRail')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  const layout = await page.evaluate((testIds) => {
    const select = (name) => document.querySelector(`[data-testid="${testIds[name]}"]`);
    const sourceCreate = select('sourceCreate');
    const sourceRail = select('sourceRail');
    const evidencePanel = select('evidencePanel') ?? [...document.querySelectorAll('section')].find((section) => /Source preview/i.test(section.innerText ?? ''));
    const pdfPanel = select('pdfPanel');
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const contained = (rect) => Boolean(rect && rect.left >= -2 && rect.right <= window.innerWidth + 2 && rect.width <= document.documentElement.clientWidth + 2);
    return {
      sourceCreate: toRect(sourceCreate),
      sourceRail: toRect(sourceRail),
      evidencePanel: toRect(evidencePanel),
      pdfPanel: toRect(pdfPanel),
      sourceCreateContained: contained(toRect(sourceCreate)),
      sourceRailContained: contained(toRect(sourceRail)),
      evidencePanelContained: contained(toRect(evidencePanel)),
      pdfPanelContained: contained(toRect(pdfPanel)),
    };
  }, TEST_IDS);

  expect(layout.sourceCreate).toBeTruthy();
  expect(layout.sourceRail).toBeTruthy();
  expect(layout.evidencePanel).toBeTruthy();
  expect(layout.pdfPanel).toBeTruthy();
  expect(layout.sourceCreateContained).toBe(true);
  expect(layout.sourceRailContained).toBe(true);
  expect(layout.evidencePanelContained).toBe(true);
  expect(layout.pdfPanelContained).toBe(true);
  expect(layout.sourceCreate.bottom).toBeLessThanOrEqual(layout.sourceRail.top + 24);
  expect(layout.sourceRail.bottom).toBeLessThanOrEqual(layout.evidencePanel.top + 24);
}


async function expectDesktopReviewWorkspaceLayout(page, { expectAnswer = false } = {}) {
  await expect(byTestId(page, 'activeSource')).toBeVisible();
  await expect(byTestId(page, 'sourceRail')).toBeVisible();
  await expect(byTestId(page, 'evidencePanel')).toBeVisible();
  await expect(byTestId(page, 'reviewBriefing')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);

  const layout = await page.evaluate((testIds) => {
    const select = (name) => document.querySelector(`[data-testid="${testIds[name]}"]`);
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    const chatInput = select('chatInput');
    const chatSection = chatInput?.closest('section');
    const chatBand = chatSection?.parentElement;
    const answerCards = [...document.querySelectorAll(`[data-testid="${testIds.answerCard}"]`)];
    return {
      viewportWidth: window.innerWidth,
      activeSource: toRect(select('activeSource')),
      sourceRail: toRect(select('sourceRail')),
      sourceManagement: toRect(select('sourceManagement')),
      preview: toRect(select('evidencePanel')),
      briefing: toRect(select('reviewBriefing')),
      chatBand: toRect(chatBand),
      chatInput: toRect(chatInput),
      latestAnswer: toRect(answerCards.at(-1)),
    };
  }, TEST_IDS);

  expect(layout.activeSource).toBeTruthy();
  expect(layout.sourceRail).toBeTruthy();
  expect(layout.sourceManagement).toBeTruthy();
  expect(layout.preview).toBeTruthy();
  expect(layout.briefing).toBeTruthy();
  expect(layout.chatBand).toBeTruthy();
  expect(layout.chatInput).toBeTruthy();

  const layoutDebug = `desktop review layout boxes: ${JSON.stringify(layout)}`;
  const sourceBandBottom = Math.max(layout.activeSource.bottom, layout.sourceManagement.bottom);
  const middleRowTop = Math.min(layout.preview.top, layout.briefing.top);
  expect(sourceBandBottom, layoutDebug).toBeLessThanOrEqual(middleRowTop + 16);
  expect(layout.sourceRail.bottom, layoutDebug).toBeLessThanOrEqual(middleRowTop + 16);

  expect(layout.preview.right, layoutDebug).toBeLessThanOrEqual(layout.briefing.left + 16);
  const middleRowOverlap = Math.min(layout.preview.bottom, layout.briefing.bottom) - Math.max(layout.preview.top, layout.briefing.top);
  expect(middleRowOverlap, layoutDebug).toBeGreaterThan(Math.min(layout.preview.height, layout.briefing.height) * 0.35);

  expect(layout.chatBand.top, layoutDebug).toBeGreaterThanOrEqual(Math.max(layout.preview.bottom, layout.briefing.bottom) - 16);
  expect(layout.chatBand.left, layoutDebug).toBeLessThanOrEqual(Math.min(layout.preview.left, layout.briefing.left) + 8);
  expect(layout.chatBand.right, layoutDebug).toBeGreaterThanOrEqual(Math.max(layout.preview.right, layout.briefing.right) - 8);
  expect(layout.chatBand.right, layoutDebug).toBeLessThanOrEqual(layout.viewportWidth + 2);

  if (expectAnswer) {
    expect(layout.latestAnswer).toBeTruthy();
    expect(layout.latestAnswer.left).toBeGreaterThanOrEqual(layout.chatBand.left - 2);
    expect(layout.latestAnswer.right).toBeLessThanOrEqual(layout.chatBand.right + 2);
    expect(layout.latestAnswer.top).toBeGreaterThanOrEqual(layout.chatBand.top - 2);
  }
}

async function expectLatestAnswerScrolledIntoView(page) {
  await expect.poll(async () => page.evaluate((testIds) => {
    const answerCards = [...document.querySelectorAll(`[data-testid="${testIds.answerCard}"]`)];
    const latestAnswer = answerCards.at(-1);
    const rect = latestAnswer?.getBoundingClientRect();
    return Boolean(rect && window.scrollY > 0 && rect.top >= -2 && rect.top <= window.innerHeight * 0.7 && rect.bottom > 0);
  }, TEST_IDS)).toBe(true);
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

function assessmentAnalysisFor() {
  return {
    summary: 'Full Stack AI Engineer Assessment for an AI-powered full-stack application covering backend, frontend, data flow, privacy, reliability, AWS deployment, and deliverables.',
    sections: assessmentGoldenAssertions.analysis.sections.expectedTitles.map((title) => ({ title, summary: `${title} requirements from the assessment source.` })),
    entities: [{ name: 'Full Stack AI Engineer Assessment', type: 'assessment' }],
    requirements: assessmentGoldenAssertions.analysis.requirements.mustMention.map((text) => ({ category: 'Assessment requirement', text })),
    obligations: [],
    deliverables: assessmentGoldenAssertions.analysis.deliverables.mustMention.map((text) => ({ text })),
    risks: assessmentGoldenAssertions.analysis.risks.mustMentionSupportedOrDerived.map((text) => ({ severity: 'medium', text, derivedReviewerRisk: true })),
    uncertainties: ['The assessment leaves implementation choices to the candidate when the source does not mandate one.'],
    recommendedQuestions: assessmentGoldenAssertions.analysis.recommendedQuestions,
    metadata: analysisMetadata,
  };
}

function longStructuredAnalysisFor() {
  const rows = Array.from({ length: 24 }, (_, index) => index + 1);
  return {
    summary: 'Long structured procurement briefing covering credential controls, release governance, latency budgets, rollback readiness, and reviewer evidence retention.',
    sections: rows.slice(0, 14).map((number) => ({ title: `Assessment part ${number}`, summary: `Part ${number} covers procurement review controls, ownership evidence, and launch readiness.` })),
    entities: [
      { name: 'Procurement Review Board', type: 'reviewer' },
      { name: 'Platform Delivery Team', type: 'owner' },
      { name: 'Security Operations', type: 'control owner' },
    ],
    requirements: rows.map((number) => ({
      category: number % 2 ? 'Security requirement' : 'Operations requirement',
      text: number === 1
        ? 'Credential rotation must be completed before production launch and verified by the reviewer.'
        : `Requirement ${number}: owners must provide mapped evidence, decision records, and acceptance notes before approval.`,
    })),
    deliverables: rows.slice(0, 16).map((number) => ({
      text: number === 1
        ? 'The reviewer pack must include a rollback checklist, evidence index, and decision owner list.'
        : `Deliverable ${number}: include source excerpts, reviewer notes, and signed acceptance evidence.`,
    })),
    risks: rows.map((number) => ({
      severity: number % 3 === 0 ? 'high' : 'medium',
      text: number === 1
        ? 'Latency budget risk must be escalated when AI response time threatens the review workflow.'
        : `Risk ${number}: unresolved ownership, missing rollback evidence, or stale approvals can delay release.`,
    })),
    uncertainties: rows.slice(0, 10).map((number) => `Uncertainty ${number}: the source does not identify every approval substitute for outage scenarios.`),
    recommendedQuestions: rows.slice(0, 12).map((number) => `Which evidence item ${number} supports release readiness?`),
    metadata: analysisMetadata,
  };
}

function fallbackOnlyAnalysisFor() {
  return {
    summary: 'Summary Summary DocuLens could not convert the AI response into a structured briefing.',
    sections: [],
    entities: [],
    requirements: [],
    obligations: [],
    deliverables: [],
    risks: [],
    uncertainties: [],
    recommendedQuestions: [],
    metadata: { ...analysisMetadata, fallbackReason: 'provider_shape_unrecognized' },
  };
}

function assessmentAnswerFor(question) {
  const entry = Object.values(assessmentGoldenAssertions.chatGoldenQuestions).find((assertion) => assertion.question === question);
  if (entry?.question === assessmentGoldenAssertions.chatGoldenQuestions.overview.question) {
    return {
      answer: {
        text: entry.mustMention.join(' '),
        citations: [],
        uncertainty: 'medium',
        state: 'full_document_overview',
        displayState: overviewMetadata.displayState,
        metadata: overviewMetadata,
      },
      retrievedChunks: [],
      question,
    };
  }

  const answerAssertion = entry ?? assessmentGoldenAssertions.chatGoldenQuestions.backend;
  const quote = answerAssertion.evidenceSnippets?.[0] ?? answerAssertion.mustMention[0];
  return {
    answer: {
      text: answerAssertion.mustMention.join(' '),
      citations: [{ chunkId: rawChunkUuid, label: 'Assessment evidence', quote, citationIndex: 1 }],
      uncertainty: 'low',
      state: 'grounded',
      displayState: { kind: 'grounded', label: 'Based on this document', message: 'Based on this document.' },
      metadata: ragMetadata,
      unsafeProviderPayload: rawProviderPayloadCanary,
    },
    retrievedChunks: [{
      chunkId: rawChunkUuid,
      label: 'Assessment evidence',
      headingPath: ['Full Stack AI Engineer Assessment', 'Assessment evidence'],
      text: quote,
      contentExcerpt: quote,
      normalizedScore: 0.923456,
      metadata: { raw: rawMetadataJsonCanary },
    }],
    question,
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
      await fulfillJson(route, 201, { analysis: document.id === assessmentDocumentId ? assessmentAnalysisFor() : document.id === longStructuredBriefingDocument.id ? longStructuredAnalysisFor() : document.id === fallbackBriefingDocument.id ? fallbackOnlyAnalysisFor() : analysisFor(document) });
    });

    await page.route(`**/api/documents/${documentId}/chat`, async (route) => {
      expect(route.request().method()).toBe('POST');
      expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
      const { question } = route.request().postDataJSON();
      onChatRequest?.({ documentId, question });

      if (document.id === assessmentDocumentId) {
        if (/capital|salary/i.test(question)) {
          await fulfillJson(route, 200, {
            answer: {
              text: 'This question is outside the selected source or not covered by the assessment requirements. Ask about backend, frontend, data, reliability, deployment, or deliverables.',
              unsupported: true,
              citations: [],
              uncertainty: null,
              state: 'unsupported',
              displayState: { kind: 'unsupported', label: 'Outside this document', message: 'Outside the selected source.' },
              metadata: unsupportedMetadata,
            },
            retrievedChunks: [],
          });
          return;
        }
        await fulfillJson(route, 201, assessmentAnswerFor(question));
        return;
      }

      if (/provider error/i.test(question)) {
        await fulfillJson(route, 503, {
          error: `Traceback ${localPathCanary} ${rawProviderPayloadCanary} MINIMAX_API_KEY=secret ${rawPolicyCanary}`,
        });
        return;
      }

      if (/insurance cap|specific unsupported detail/i.test(question)) {
        await fulfillJson(route, 201, {
          answer: {
            text: 'I did not find enough cited evidence in this source to answer that exact insurance-cap question confidently.',
            citations: [],
            uncertainty: 'high',
            state: 'insufficient_evidence',
            displayState: { kind: 'insufficient_evidence', label: 'Needs stronger evidence', message: 'No answer-specific evidence supports this detail.' },
            suggestedRefinements: [
              'Ask for the source overview.',
              'Ask which sections discuss risk or insurance obligations.',
            ],
            metadata: fallbackMetadata,
          },
          retrievedChunks: [],
        });
        return;
      }

      if (/stock price|outside|what time is|current time|current date/i.test(question)) {
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

      if (/whole document|summarize everything|what is this document about|what (?:does|do) (?:this )?(?:source|document) require|what is required by (?:this )?(?:source|document)|requirements? (?:of|for|in) (?:this )?(?:source|document)/i.test(question)) {
        await fulfillJson(route, 201, {
          answer: {
            text: 'The document is a mutual NDA about protecting confidential information, permitted legal disclosures, and returning or destroying materials.',
            citations: [],
            uncertainty: 'medium',
            state: 'full_document_overview',
            displayState: overviewMetadata.displayState,
            metadata: overviewMetadata,
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

    const isAssessmentUpload = body.includes(assessmentFixtureManifest.sourceMetadataExpectations.originalBasename);
    expect(body).toMatch(isAssessmentUpload ? new RegExp(`filename="${assessmentFixtureManifest.sourceMetadataExpectations.originalBasename}"`) : /filename="Acme-Beta-NDA\.pdf"/);
    if (delayPdfUntil) {
      await delayPdfUntil(route.request());
    }
    const document = isAssessmentUpload ? assessmentDocument : {
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

  await page.route(`**/api/documents/${assessmentDocumentId}/analysis`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    await fulfillJson(route, 201, { analysis: assessmentAnalysisFor() });
  });

  await page.route(`**/api/documents/${assessmentDocumentId}/chat`, async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe(`Bearer ${accessToken}`);
    const { question } = route.request().postDataJSON();
    onChatRequest?.({ documentId: assessmentDocumentId, question });
    if (/capital|salary/i.test(question)) {
      await fulfillJson(route, 200, {
        answer: {
          text: 'This question is outside the selected source or not covered by the assessment requirements. Ask about backend, frontend, data, reliability, deployment, or deliverables.',
          unsupported: true,
          citations: [],
          uncertainty: null,
          state: 'unsupported',
          displayState: { kind: 'unsupported', label: 'Outside this document', message: 'Outside the selected source.' },
          metadata: unsupportedMetadata,
        },
        retrievedChunks: [],
      });
      return;
    }
    await fulfillJson(route, 201, assessmentAnswerFor(question));
  });
}

async function openSampleSource(page) {
  const existingCard = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  if (await existingCard.count()) {
    await existingCard.click();
    return;
  }
  if (!(await byTestId(page, 'sampleCta').count())) {
    await page.getByLabel('Try sample').check();
  }
  await byTestId(page, 'sampleCta').click();
}

async function askQuestion(page, question) {
  await byTestId(page, 'chatInput').fill(question);
  await byTestId(page, 'chatSubmit').click();
}

async function expectElementReceivesPointer(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const receivesPointer = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const topElement = document.elementFromPoint(x, y);
    return topElement === element || element.contains(topElement);
  });
  expect(receivesPointer).toBe(true);
}

test('desktop source-first review workspace keeps source, briefing, and chat rows ordered and scrolls latest answer into view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await page.goto('/');

  await expectLoginControls(page);
  await expectDesktopLoginLayout(page);
  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Correct Horse Battery Staple');
  await byTestId(page, 'loginSubmit').click();

  await expect(byTestId(page, 'sourceCreate')).toBeVisible();
  await expectDesktopAddSourceLayout(page);

  await openSampleSource(page);
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'evidencePanel')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'reviewBriefing')).toContainText(/Generate (review )?(summary|briefing)/i);
  await expectDesktopReviewWorkspaceLayout(page);

  const question = 'What must Acme keep confidential?';
  await askQuestion(page, question);
  const answerCard = byTestId(page, 'answerCard').filter({ hasText: question }).first();
  await expect(answerCard).toContainText('Acme must protect Beta financial information for three years');
  await expectDesktopReviewWorkspaceLayout(page, { expectAnswer: true });
  await expectLatestAnswerScrolledIntoView(page);
});

test('narrow login and add-source intake avoid horizontal overflow while keeping source controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await installDocuLensApiFake(page, { documents: [sampleDocument, longFilenameDocument], documentDetails: [sampleDocument, longFilenameDocument] });
  await page.goto('/');

  await expectLoginControls(page);
  await expectNarrowLoginLayout(page);
  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Correct Horse Battery Staple');
  await byTestId(page, 'loginSubmit').click();

  await expectNarrowAddSourceLayout(page);
  await expectElementReceivesPointer(page, page.getByLabel('Upload PDF'));
  await expectElementReceivesPointer(page, page.getByLabel('Paste text'));
  await expectElementReceivesPointer(page, page.getByLabel('Try sample'));
  await expectElementReceivesPointer(page, byTestId(page, 'pdfSubmit'));

  const sourceCard = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  await expect(sourceCard).toBeVisible();
  for (const button of [
    sourceCard.getByRole('button', { name: /^Open$/ }),
    sourceCard.getByRole('button', { name: /Rename source/i }),
    sourceCard.getByRole('button', { name: /Delete source/i }),
  ]) {
    await expect(button).toBeEnabled();
    await expectElementReceivesPointer(page, button);
  }

  await page.getByLabel('Paste text').check();
  await expect(byTestId(page, 'pastePanel')).toBeVisible();
  await expectNoHorizontalPageOverflow(page);
  await expectElementReceivesPointer(page, byTestId(page, 'documentTitle'));
  await expectElementReceivesPointer(page, byTestId(page, 'documentContent'));
  await expectElementReceivesPointer(page, byTestId(page, 'documentSubmit'));
});

test('long structured briefing stays scrollable, filters briefing cards, and leaves chat reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installDocuLensApiFake(page, { documents: [longStructuredBriefingDocument], documentDetails: [longStructuredBriefingDocument] });
  await signIn(page);

  await byTestId(page, 'sourceCard').filter({ hasText: longStructuredBriefingDocument.title }).first().click();
  await byTestId(page, 'documentAnalyze').click();

  const briefing = byTestId(page, 'reviewBriefing');
  await expect(briefing).toContainText(/Long structured procurement briefing/i);
  await expect(briefing).toContainText(/Requirements|Deliverables|Risks and trade-offs|Recommended questions/i);
  await expect(byTestId(page, 'briefingSearch')).toBeVisible();

  const boundedLayout = await page.evaluate((testIds) => {
    const select = (name) => document.querySelector(`[data-testid="${testIds[name]}"]`);
    const briefingNode = select('reviewBriefing');
    const scrollRegion = briefingNode?.querySelector('[aria-label="Scrollable briefing results"]');
    const chatInput = select('chatInput');
    const chatBand = chatInput?.closest('section')?.parentElement;
    const toRect = (element) => {
      const rect = element?.getBoundingClientRect();
      return rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null;
    };
    return {
      viewportHeight: window.innerHeight,
      briefing: toRect(briefingNode),
      scrollClientHeight: scrollRegion?.clientHeight ?? 0,
      scrollScrollHeight: scrollRegion?.scrollHeight ?? 0,
      scrollOverflowY: scrollRegion ? getComputedStyle(scrollRegion).overflowY : '',
      chatBand: toRect(chatBand),
      chatInput: toRect(chatInput),
    };
  }, TEST_IDS);
  const boundedDebug = `bounded briefing layout: ${JSON.stringify(boundedLayout)}`;
  expect(boundedLayout.briefing, boundedDebug).toBeTruthy();
  expect(boundedLayout.chatBand, boundedDebug).toBeTruthy();
  expect(boundedLayout.chatInput, boundedDebug).toBeTruthy();
  expect(boundedLayout.scrollOverflowY, boundedDebug).toMatch(/auto|scroll/i);
  expect(boundedLayout.scrollScrollHeight, boundedDebug).toBeGreaterThan(boundedLayout.scrollClientHeight + 120);
  expect(boundedLayout.scrollClientHeight, boundedDebug).toBeLessThanOrEqual(Math.ceil(boundedLayout.viewportHeight * 0.52));
  expect(boundedLayout.chatBand.top, boundedDebug).toBeGreaterThanOrEqual(boundedLayout.briefing.bottom - 16);
  expect(boundedLayout.chatBand.top, boundedDebug).toBeLessThan(boundedLayout.viewportHeight + 200);

  await byTestId(page, 'briefingSearch').fill('credential rotation');
  await expect(briefing.getByRole('heading', { name: /^Requirements$/ })).toBeVisible();
  await expect(briefing).toContainText(/Credential rotation must be completed/i);
  await expect(briefing.getByRole('heading', { name: /Risks and trade-offs/i })).toHaveCount(0);
  await expect(briefing.getByRole('heading', { name: /^Deliverables$/ })).toHaveCount(0);

  await byTestId(page, 'briefingSearch').fill('latency budget risk');
  await expect(briefing.getByRole('heading', { name: /Risks and trade-offs/i })).toBeVisible();
  await expect(briefing).toContainText(/Latency budget risk must be escalated/i);
  await expect(briefing.getByRole('heading', { name: /^Requirements$/ })).toHaveCount(0);

  await byTestId(page, 'briefingSearch').fill('zzzzz no matching briefing item');
  await expect(briefing).toContainText(/No briefing items match "zzzzz no matching briefing item"/i);
  await expect(briefing.getByRole('heading', { name: /^Summary$/ })).toHaveCount(0);
  await expect(briefing.getByRole('heading', { name: /^Requirements$/ })).toHaveCount(0);
  await expect(briefing.getByRole('heading', { name: /Risks and trade-offs/i })).toHaveCount(0);
});

test('source search filters cards by title and filename while keeping compact controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await installDocuLensApiFake(page, {
    documents: [sampleDocument, longFilenameDocument, recentListDocument],
    documentDetails: [sampleDocument, longFilenameDocument, recentDetailedDocument],
  });
  await signIn(page);

  await expect(byTestId(page, 'sourceSearch')).toBeVisible();
  await byTestId(page, 'sourceSearch').fill('Final_Final.pdf');
  const filenameMatch = byTestId(page, 'sourceCard').filter({ hasText: /Final_Final\.pdf|Reviewer Notes 2026 Final Final/i }).first();
  await expect(filenameMatch).toBeVisible();
  await expect(byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title })).toHaveCount(0);
  await expect(byTestId(page, 'sourceCard').filter({ hasText: recentListDocument.title })).toHaveCount(0);

  for (const button of [
    filenameMatch.getByRole('button', { name: /^Open$/ }),
    filenameMatch.getByRole('button', { name: /Rename source/i }),
    filenameMatch.getByRole('button', { name: /Delete source/i }),
  ]) {
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  }

  const compactRail = await page.evaluate((testIds) => {
    const rail = document.querySelector(`[data-testid="${testIds.sourceRail}"]`);
    const cards = [...document.querySelectorAll(`[data-testid="${testIds.sourceCard}"]`)];
    const rect = (element) => {
      const bounds = element?.getBoundingClientRect();
      return bounds ? { height: bounds.height, top: bounds.top, bottom: bounds.bottom } : null;
    };
    return {
      viewportHeight: window.innerHeight,
      rail: rect(rail),
      cardHeights: cards.map((card) => rect(card)?.height ?? 0),
    };
  }, TEST_IDS);
  const compactDebug = `compact source rail layout: ${JSON.stringify(compactRail)}`;
  expect(compactRail.rail, compactDebug).toBeTruthy();
  expect(Math.max(...compactRail.cardHeights), compactDebug).toBeLessThanOrEqual(Math.ceil(compactRail.viewportHeight * 0.35));
  expect(compactRail.rail.height, compactDebug).toBeLessThanOrEqual(Math.ceil(compactRail.viewportHeight * 0.35));

  await byTestId(page, 'sourceSearch').fill('Seed NDA');
  const titleMatch = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  await expect(titleMatch).toBeVisible();
  await expect(byTestId(page, 'sourceCard').filter({ hasText: longFilenameDocument.title })).toHaveCount(0);
});


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
  await expect(byTestId(page, 'sourceCreate')).toContainText(/Add source|One flow for PDF|create (a )?source|start a review/i);
  await expect(byTestId(page, 'sourceCreate')).toContainText(/sample|pdf|paste/i);
  await expectQuietPrimaryCopy(page);

  await openSampleSource(page);

  await expect(byTestId(page, 'sourceRail')).toBeVisible();
  const sourceCard = byTestId(page, 'sourceCard').filter({ hasText: sampleDocument.title }).first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toContainText(/Ready/i);
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);
  await expect(byTestId(page, 'activeSource').getByTestId(TEST_IDS.sourceStatus)).toContainText(/Ready/i);
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
  await expect(byTestId(page, 'answerCard').first()).toContainText(/Based on this (?:document|source)|Full-document overview|Source overview|Acme must protect Beta financial information|mutual NDA/i);
  expect(chatRequests.at(-1)).toMatchObject({ documentId: sampleDocumentId, question: starterText });
  await expect(byTestId(page, 'activeSource')).toContainText(sampleDocument.title);

  const analyzeClick = byTestId(page, 'documentAnalyze').click();
  await expectSingleBriefingLoadingStatus(page);
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
  await expect(answerCard).toContainText(/Based on this (?:document|source)/i);
  await expect(byTestId(page, 'trustSummary')).toContainText(/Based on this (?:document|source)/i);
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

test('full-document overview and broad source requirement questions render caveated overview instead of low-evidence fallback', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);

  await askQuestion(page, 'Summarize the whole document.');
  const fallbackCard = byTestId(page, 'answerCard').first();
  await expect(fallbackCard).toContainText(/full-document overview|overview|source-wide/i);
  await expect(fallbackCard).toContainText(/mutual NDA|protecting confidential information|permitted legal disclosures|returning or destroying materials/i);
  await expect(fallbackCard).toContainText(/not claiming precise citation coverage|not precise citation|without precise citations|caveat/i);
  await expect(fallbackCard).not.toContainText(/Not enough evidence|Insufficient evidence|low_retrieval_coverage|citation-quality|chunk|0 citations/i);
  await expect(byTestId(page, 'trustSummary')).toContainText(/full-document overview|overview/i);
  await expect(byTestId(page, 'inlineCitation')).toHaveCount(0);

  for (const question of ['What does this source require?', 'What is required by this source?']) {
    await askQuestion(page, question);
    const requirementCard = byTestId(page, 'answerCard').filter({ hasText: question }).first();
    await expect(requirementCard).toContainText(/full-document overview|overview|source-wide/i);
    await expect(requirementCard).toContainText(/mutual NDA|protecting confidential information|permitted legal disclosures|returning or destroying materials/i);
    await expect(requirementCard).toContainText(/full selected source|not claiming precise citation coverage|not precise citation|without precise citations|caveat/i);
    await expect(requirementCard).not.toContainText(/Not enough answer-specific evidence|Needs stronger evidence|Insufficient evidence|low_retrieval_coverage|citation-quality|chunk|0 citations/i);
  }

  await askQuestion(page, 'What is Acme stock price?');
  const unsupportedCard = byTestId(page, 'answerCard').filter({ hasText: /Outside this document|unsupported by this document/i }).first();
  await expect(unsupportedCard).toBeVisible();
  await expect(byTestId(page, 'unsupported')).toContainText(/Outside this document|not supported by this document/i);
  await expect(unsupportedCard).toContainText(/Ask about|confidentiality|duties|sections/i);
  await expect(unsupportedCard).not.toContainText(/generic error|Traceback|outside_document_scope|no_citations_for_unsupported_answer/i);

  await askQuestion(page, 'what time is?');
  const currentTimeCard = byTestId(page, 'answerCard').filter({ hasText: /what time is\?/i }).first();
  await expect(currentTimeCard).toContainText(/Outside this source|Outside this document|not supported by this document/i);
  await expect(currentTimeCard.getByTestId(TEST_IDS.chatCitations)).toHaveCount(0);
  await expect(currentTimeCard.getByTestId(TEST_IDS.chatRetrievedChunks)).toHaveCount(0);
  await expect(currentTimeCard).not.toContainText(/chunk_|018f4d31|provider_response_id|provider payload|raw metadata|outside_document_scope|no_citations_for_unsupported_answer/i);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('briefing recovery renders fallback-only analysis as retryable state without duplicate summary labels', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [fallbackBriefingDocument], documentDetails: [fallbackBriefingDocument] });
  await signIn(page);

  await byTestId(page, 'sourceCard').filter({ hasText: fallbackBriefingDocument.title }).first().click();
  await byTestId(page, 'documentAnalyze').click();

  const briefing = byTestId(page, 'reviewBriefing');
  await expect(briefing).toContainText(/Briefing needs another pass/i);
  await expect(byTestId(page, 'analysisSummary')).toContainText(/retry analysis|reviewer-ready summary/i);
  await expect(briefing).toContainText(/Retry the briefing|source overview/i);
  await expect(briefing).not.toContainText(/\bSummary\s+Summary\b/i);
  await expect(briefing).not.toContainText(/DocuLens could not convert|structured briefing failure|provider_shape_unrecognized/i);
  await expect(briefing).not.toContainText(/Requirements|Deliverables|Risks and trade-offs|Recommended questions/i);
});

test('insufficient-evidence answers stay compact and omit empty citation controls', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);

  await askQuestion(page, 'What is the exact insurance cap in dollars?');

  const answerCard = byTestId(page, 'answerCard').filter({ hasText: /insurance cap/i }).first();
  await expect(answerCard).toContainText(/Not enough answer-specific evidence|Needs stronger evidence/i);
  await expect(answerCard).toContainText(/No answer-specific evidence was used/i);
  await expect(answerCard).toContainText(/Ask overview|Refine with source evidence/i);
  await expect(answerCard.getByTestId(TEST_IDS.chatCitations)).toHaveCount(0);
  await expect(answerCard.getByTestId(TEST_IDS.chatRetrievedChunks)).toHaveCount(0);
  await expect(answerCard).not.toContainText(/Citation controls|Evidence used|retrieved chunk|fallback reason|0 citations|low_retrieval_coverage/i);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('narrow source workspace wraps long PDF filenames and keeps preview plus source controls accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  await installDocuLensApiFake(page, { documents: [longFilenameDocument], documentDetails: [longFilenameDocument] });
  await signIn(page);

  const sourceCard = byTestId(page, 'sourceCard').filter({ hasText: /Extraordinarily Long Client Confidential/i }).first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toContainText(/Full_Stack_AI_Engineer_Assessment_With_|Final_Final\.pdf/i);
  await sourceCard.click();

  await expect(byTestId(page, 'activeSource')).toContainText(/Extraordinarily Long Client Confidential/i);
  await expect(byTestId(page, 'activeSource')).toContainText(/Full_Stack_AI_Engineer_Assessment_With_|Final_Final\.pdf/i);
  await expect(byTestId(page, 'evidencePanel')).toBeVisible();
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/Backend, frontend, data privacy/i);

  await expectContainedNarrowSourcePreview(page);

  await byTestId(page, 'documentAnalyze').click();
  const briefing = byTestId(page, 'reviewBriefing');
  await expect(briefing).toContainText(/requires the reviewer to verify confidentiality, delivery, risk, and recovery obligations/i);
  await expect(briefing).toContainText(/Obligations|Risks|Uncertainties|Recommended/i);
  await expect(byTestId(page, 'evidencePanel')).toContainText(/Source preview/i);
  await expectContainedNarrowSourcePreview(page);

  for (const button of [
    sourceCard.getByRole('button', { name: /^Open$/ }),
    sourceCard.getByRole('button', { name: /Rename source/i }),
    sourceCard.getByRole('button', { name: /Delete source/i }),
    byTestId(page, 'documentAnalyze'),
  ]) {
    await expect(button).toBeEnabled();
    await expectElementReceivesPointer(page, button);
  }
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
  await expect(byTestId(page, 'pdfStatus')).toContainText(/Uploading PDF|Reading text|Preparing source|Opening workspace|Reading PDF|Preparing document/i);
  await expect(byTestId(page, 'pdfStatus')).not.toContainText(QUIET_PRIMARY_COPY_DENYLIST);
  await expect(byTestId(page, 'sourceCard').filter({ hasText: 'Acme-Beta-NDA.pdf' }).first()).toContainText(/Preparing|Uploading PDF|Reading text|Preparing source|Opening workspace|Reading PDF|Preparing document/i);
  releasePdf();
  await submit;

  await expect(byTestId(page, 'activeSource')).toContainText('Acme Beta PDF NDA');
  await expect(byTestId(page, 'activeSource').getByTestId(TEST_IDS.sourceStatus)).toContainText(/Ready/i);
  await expect(byTestId(page, 'sourceCard').filter({ hasText: 'Acme Beta PDF NDA' }).first()).toContainText(/Ready/i);
  await expect(byTestId(page, 'reviewBriefing')).toContainText(/Generate (review )?(summary|briefing)/i);
  await expect(byTestId(page, 'starterQuestions')).toBeVisible();
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/financial information confidential/i);
  await expectQuietPrimaryCopy(page);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('assessment PDF golden path uploads fixture, opens source metadata, generates briefing, and answers golden questions safely', async ({ page }) => {
  const chatRequests = [];
  await installDocuLensApiFake(page, {
    documents: [],
    onChatRequest: (request) => chatRequests.push(request),
  });
  await signIn(page);

  await byTestId(page, 'pdfInput').setInputFiles({
    name: assessmentFixtureManifest.sourceMetadataExpectations.originalBasename,
    mimeType: assessmentFixtureManifest.files.pdf.mimeType,
    buffer: assessmentFixturePdf,
  });
  await expect(byTestId(page, 'pdfSelected')).toContainText(assessmentFixtureManifest.sourceMetadataExpectations.originalBasename);
  await byTestId(page, 'pdfSubmit').click();

  const sourceCard = byTestId(page, 'sourceCard').filter({ hasText: assessmentDocument.title }).first();
  await expect(sourceCard).toBeVisible();
  await expect(sourceCard).toContainText(/PDF/i);
  await expect(sourceCard).toContainText(/Ready/i);
  await expect(sourceCard).toContainText(/full-stack-ai-engineer-assessment\.pdf/i);
  await expect(sourceCard).toContainText(/uploaded|2026|KB|7\.6|7818/i);
  await expect(byTestId(page, 'activeSource')).toContainText(/Full Stack AI Engineer Assessment/i);
  await expect(byTestId(page, 'activeSource').getByTestId(TEST_IDS.sourceStatus)).toContainText(/Ready/i);
  await expect(byTestId(page, 'evidencePanel')).toContainText(/Source preview|Full Stack AI Engineer Assessment/i);
  await expect(byTestId(page, 'evidenceExcerpt')).toContainText(/Backend requirements|Frontend requirements|Data, privacy/i);

  await byTestId(page, 'documentAnalyze').click();
  const briefing = byTestId(page, 'reviewBriefing');
  await expect(briefing).toContainText(/Full Stack AI Engineer Assessment/i);
  for (const term of assessmentGoldenAssertions.analysis.summary.mustMention) {
    await expect(briefing).toContainText(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const term of ['REST API', 'JWT authentication', 'React', 'loading states', 'PII', 'AWS', 'README']) {
    await expect(briefing).toContainText(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  await expect(briefing).toContainText(/Requirements|Deliverables|Risks|Recommended questions/i);
  await expect(briefing).not.toContainText(/```json|\[object Object\]|providerPayload|retrievedChunkIds|chunk_|documentId|Traceback|MINIMAX_API_KEY/i);
  await expect(byTestId(page, 'starterQuestions')).toContainText(/backend requirements|frontend UX|deployment|deliverables|what is this document about/i);

  for (const assertion of Object.values(assessmentGoldenAssertions.chatGoldenQuestions)) {
    await askQuestion(page, assertion.question);
    const answerCard = byTestId(page, 'answerCard').filter({ hasText: assertion.question }).first();
    for (const term of assertion.mustMention) {
      await expect(answerCard).toContainText(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    await expect(answerCard).not.toContainText(/```json|providerPayload|rawProviderPayload|retrievedChunkIds|chunk_|documentId|Traceback|MINIMAX_API_KEY|AWS_SECRET_ACCESS_KEY/i);
    if (assertion.expectedDisplayStateKinds.includes('full_document_overview')) {
      await expect(answerCard).toContainText(/overview|full-document|source-wide|Based on this (?:document|source)/i);
    } else {
      await expect(answerCard).toContainText(/Based on this (?:document|source)/i);
      await expect(byTestId(page, 'inlineCitation').first()).toBeVisible();
    }
  }
  expect(chatRequests.map((request) => request.documentId).every((documentId) => documentId === assessmentDocumentId)).toBe(true);
  await expectNoUnsafeReviewerArtifacts(page);
});

test('product shell exposes DocuLens favicon metadata and keeps active source visible on desktop, mobile, and reduced motion', async ({ page }) => {
  let releaseAnalysis;
  const analysisGate = new Promise((resolve) => {
    releaseAnalysis = resolve;
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installDocuLensApiFake(page, {
    documents: [sampleDocument],
    delayAnalysisUntil: async () => {
      await analysisGate;
    },
  });
  await page.goto('/');

  const shellMetadata = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
    iconHrefs: [...document.querySelectorAll('link[rel~="icon"]')].map((link) => link.getAttribute('href') ?? ''),
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  expect(shellMetadata.title).toMatch(/DocuLens/i);
  expect(shellMetadata.description).toMatch(/document|review|source|AI/i);
  expect(shellMetadata.themeColor).toMatch(/^#|rgb|hsl/i);
  expect(shellMetadata.iconHrefs.length).toBeGreaterThan(0);
  expect(shellMetadata.iconHrefs.join(' ')).not.toMatch(/vite|missing|placeholder/i);
  expect(shellMetadata.reducedMotion).toBe(true);
  const iconResponse = await page.request.get(new URL(shellMetadata.iconHrefs[0], page.url()).href);
  expect(iconResponse.ok()).toBe(true);

  await expectLoginControls(page);
  await byTestId(page, 'email').fill('demo@doculens.local');
  await byTestId(page, 'password').fill('Correct Horse Battery Staple');
  await byTestId(page, 'loginSubmit').click();
  await openSampleSource(page);
  await expect(byTestId(page, 'activeSource')).toBeVisible();
  await expect(byTestId(page, 'sourceRail')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 760 });
  await expect(byTestId(page, 'activeSource')).toBeVisible();
  await expect(byTestId(page, 'workspaceRoot')).toContainText(sampleDocument.title);

  const analyzeClick = byTestId(page, 'documentAnalyze').click();
  await expectSingleBriefingLoadingStatus(page);
  releaseAnalysis();
  await analyzeClick;
});

test('keyboard citations, aria labels, print output, and error retry UI do not leak technical details', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });
  await signIn(page);
  await openSampleSource(page);
  await askQuestion(page, 'What must Acme keep confidential?');

  await byTestId(page, 'inlineCitation').first().focus();
  await page.keyboard.press('Enter');
  await expect(byTestId(page, 'evidencePanel')).toContainText(/confidential for three years/i);

  const ariaText = await page.locator('[aria-label], [role="status"], [aria-live]').evaluateAll((nodes) => nodes.map((node) => [
    node.getAttribute('aria-label'),
    node.getAttribute('role'),
    node.getAttribute('aria-live'),
    node.textContent,
  ].filter(Boolean).join(' ')).join('\n'));
  expect(ariaText).not.toMatch(UNSAFE_VISIBLE_TEXT);
  expect(ariaText).not.toMatch(/018f4d31|chunkId|retrievedChunkIds|provider-response-ui-raw|RAW_PROVIDER_PAYLOAD|SYSTEM_POLICY|MINIMAX_API_KEY/i);

  await askQuestion(page, 'provider error please');
  await expect(byTestId(page, 'error')).toContainText(/try again|retry|could not|unable|error/i);
  await expect(byTestId(page, 'error')).not.toContainText(/Traceback|\/Users\/|MINIMAX_API_KEY|RAW_PROVIDER_PAYLOAD|SYSTEM_POLICY|stack|stderr|stdout/i);
  await expect(byTestId(page, 'chatInput')).toHaveValue(/provider error please/i);

  await byTestId(page, 'documentAnalyze').click();
  await page.emulateMedia({ media: 'print' });
  await expect(byTestId(page, 'printOutput')).not.toContainText(/technical details|provider response|providerPayload|retrievedChunkIds|chunkId|Traceback|MINIMAX_API_KEY|SYSTEM_POLICY/i);
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

test('authenticated header logout clears the session and returns to sign-in', async ({ page }) => {
  await installDocuLensApiFake(page, { documents: [sampleDocument] });

  const authenticatedReviewRequestsAfterLogout = [];
  let afterLogoutClick = false;
  page.on('request', (request) => {
    if (!afterLogoutClick) {
      return;
    }
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/documents') && request.headers().authorization) {
      authenticatedReviewRequestsAfterLogout.push(`${request.method()} ${url.pathname}`);
    }
  });

  await signIn(page);
  await expect(page.getByText('Demo Reviewer')).toBeVisible();
  await expect(byTestId(page, 'sourceCreate')).toBeVisible();
  await expect(byTestId(page, 'logout')).toBeVisible();

  afterLogoutClick = true;
  await byTestId(page, 'logout').click();

  await expectLoginControls(page);
  await expect(byTestId(page, 'sourceCreate')).toBeHidden();
  await expect(byTestId(page, 'workspaceRoot')).toBeHidden();
  expect(authenticatedReviewRequestsAfterLogout).toEqual([]);
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
