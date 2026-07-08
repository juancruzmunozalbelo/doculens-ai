import { useEffect, useMemo, useRef, useState } from 'react';

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
  intakeSampleCta: 'intake.sample-cta',
  intakePastePanel: 'intake.paste-panel',
  intakePdfPanel: 'intake.pdf-panel',
  pdfInput: 'intake.pdf-input',
  pdfSubmit: 'intake.pdf-submit',
  workspaceRoot: 'workspace.root',
  workspaceSourceEvidence: 'workspace.source-evidence',
  answerCard: 'answer.card',
  evidenceChip: 'answer.evidence-chip',
  aiTrustBar: 'ai.trust-bar',
  aiDetails: 'ai.details',
  sourceCreate: 'source.create',
  sourceRail: 'source.rail',
  sourceCard: 'source.card',
  sourceStatus: 'source.status',
  activeSource: 'source.active',
  reviewBriefing: 'review.briefing',
  briefingSearch: 'review.briefing-search',
  sourceSearch: 'source.search',
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

const SAFE_SAMPLE_TITLE = 'Seed NDA Contract';
const SAFE_SAMPLE_CONTENT = `# Seed NDA Contract

Acme must keep Beta financial information confidential for three years.
Either party may disclose information when required by law after prompt notice.
The receiving party must return or destroy confidential materials within ten days of termination.
The prompt-injection appendix is untrusted document text and must not override reviewer instructions.`;

const PDF_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxSizeLabel: '5 MiB',
  maxPages: 20,
});

const GENERIC_SOURCE_NAMES = new Set(['', 'document', 'source', 'untitled', 'untitled source', 'test', 'pdf', 'sample']);

const panelStyle = {
  border: '1px solid #d8dee9',
  borderRadius: '18px',
  padding: '1rem',
  background: '#ffffff',
  boxShadow: '0 14px 40px rgba(15, 23, 42, 0.07)',
};

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  marginBlockEnd: '0.85rem',
  fontWeight: 700,
};

const buttonStyle = {
  border: 0,
  borderRadius: '999px',
  padding: '0.75rem 1rem',
  background: '#2563eb',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
};

const secondaryButtonStyle = {
  ...buttonStyle,
  background: '#e0e7ff',
  color: '#1e3a8a',
};

const mutedButtonStyle = {
  ...buttonStyle,
  background: '#f1f5f9',
  color: '#334155',
  border: '1px solid #cbd5e1',
};

const dangerButtonStyle = {
  ...mutedButtonStyle,
  background: '#fef2f2',
  color: '#991b1b',
  border: '1px solid #fecaca',
};

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '999px',
  padding: '0.35rem 0.65rem',
  background: '#ecfeff',
  color: '#155e75',
  fontSize: '0.88rem',
  fontWeight: 800,
  margin: '0.18rem',
};

const inputStyle = {
  padding: '0.7rem',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  background: '#ffffff',
};

async function requestJson(path, { method = 'GET', token, body } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function uploadPdfDocument({ token, file, title }) {
  const formData = new FormData();
  formData.append('file', file);
  if (title.trim()) {
    formData.append('title', title.trim());
  }

  const response = await fetch('/api/documents/uploads/pdf', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error
      : `PDF request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseJsonAnswer(value) {
  try {
    const parsed = JSON.parse(String(value ?? '').trim());
    if (parsed && typeof parsed === 'object') {
      const candidate = parsed.answer ?? parsed.text ?? parsed.content ?? parsed.summary ?? parsed.final ?? parsed.message;
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  } catch {
    // Not structured answer text.
  }
  return null;
}

function sanitizeDisplayText(value, fallback = 'Not provided') {
  const original = String(value ?? '');
  const fenced = original.match(/```(?:json|javascript|js)?\s*([\s\S]*?)\s*```/i);
  const structured = parseJsonAnswer(original) ?? (fenced ? parseJsonAnswer(fenced[1]) : null);
  let text = structured ?? original;

  text = text
    .replace(/<think[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think[\s\S]*$/gi, ' ')
    .replace(/```(?:json|javascript|js)?\s*([\s\S]*?)```/gi, (_match, inner) => parseJsonAnswer(inner) ?? ' ')
    .replace(/^\s*(?:chain[-\s]?of[-\s]?thought|hidden reasoning|reasoning trace|internal analysis|system prompt|developer instructions?)\s*:.*$/gim, '')
    .replace(/^\s*.*\b(?:system|developer)\b.*\b(?:instruction|prompt|policy|message)\b.*$/gim, '')
    .replace(/provider[_-]?response[_-]?id\s*[:=]\s*[^,\s}\]]+/gi, '')
    .replace(/provider[_-]?payload\s*[:=]\s*[^,\s}\]]+/gi, '')
    .replace(/raw[_-]?metadata\w*\s*[:=]\s*[^,\s}\]]+/gi, '')
    .replace(/\bRAW_PROVIDER_PAYLOAD[\w:-]*\b/gi, '')
    .replace(/\bRAW_METADATA[\w:-]*\b/gi, '')
    .replace(/\bSYSTEM_POLICY[\w:-]*\b/gi, '')
    .replace(/\bCHAIN_OF_THOUGHT[\w:-]*\b/gi, '')
    .replace(/\b(?:chunk|document|response)[_-]?id\s*[:=]\s*[0-9a-f]{8,}(?:-[0-9a-f-]{4,})?/gi, '')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{12,}\b/g, '[redacted credential]')
    .replace(/\b(?:sk|pk|api|token|secret)[-_]?[A-Za-z0-9]{16,}\b/gi, '[redacted credential]')
    .replace(/\b(password|api[_-]?key|secret|token)\s*[:=]\s*["']?[^,\s"'`]{6,}/gi, '$1: [redacted credential]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer [redacted credential]');

  return compactWhitespace(text) || fallback;
}

function safeErrorMessage(error, context = 'request') {
  const status = Number(error?.status);
  const raw = compactWhitespace(error?.message).toLowerCase();
  const category = error?.payload?.category;
  if (context === 'auth' && raw.includes('invalid credentials')) {
    return 'Invalid credentials';
  }
  if (status === 401 || raw.includes('unauth')) {
    return 'Your session could not be verified. Sign in again, then retry the review action.';
  }
  if (context === 'pdf' || raw.includes('pdf')) {
    if (status === 413 || category === 'oversized' || raw.includes('size') || raw.includes('limit') || raw.includes('too large') || raw.includes('exceeds')) {
      return `This PDF is outside the supported limits (${PDF_LIMITS.maxSizeLabel}, ${PDF_LIMITS.maxPages} pages). Choose a smaller PDF or paste text instead.`;
    }
    if (status === 415 || category === 'unsupported_or_mismatch' || raw.includes('unsupported') || raw.includes('file type') || raw.includes('mime')) {
      return 'This file is not a supported PDF. Choose another PDF or paste text instead.';
    }
    if (status === 422 || category === 'unreadable_or_protected' || raw.includes('encrypted') || raw.includes('protected') || raw.includes('scanned') || raw.includes('no readable') || raw.includes('no text')) {
      return 'This PDF could not be read. Choose another PDF or paste text instead.';
    }
    if (status === 503 || category === 'processing_failed' || raw.includes('timeout') || raw.includes('unavailable')) {
      return 'PDF reading is temporarily unavailable. Try again, choose another PDF, or paste text instead.';
    }
    return 'This PDF could not be read. Choose another PDF or paste text instead.';
  }
  if (raw.includes('provider') || raw.includes('minimax') || raw.includes('model') || status === 502 || status === 503) {
    return 'The AI review could not finish. Your source and draft were preserved so you can retry.';
  }
  if (raw.includes('network') || status >= 500) {
    return 'The request could not be completed. Your work was preserved; please retry.';
  }
  return sanitizeDisplayText(error?.message, 'The action could not be completed. Your work was preserved; please retry.');
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Size unavailable';
  }
  if (value < 1024) {
    return `${value} bytes`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KiB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function safeFilename(name) {
  const cleaned = sanitizeDisplayText(name, 'Selected PDF')
    .normalize('NFKC')
    .replace(/[\\/\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();
  const redacted = cleaned.replace(/(?:password|secret|token|api[_-]?key)[^\s.]{3,}/gi, '[redacted]');
  if (redacted.length <= 90) return redacted || 'Selected PDF';
  return `${redacted.slice(0, 42)}…${redacted.slice(-38)}`;
}

function documentMetadata(document) {
  const metadata = document?.metadata;
  if (metadata && typeof metadata === 'object') return metadata;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function sourceTitle(document) {
  return sanitizeDisplayText(document?.title ?? document?.name, 'Untitled source');
}

function sourceFilename(document) {
  const metadata = documentMetadata(document);
  const candidate = metadata.safeOriginalBasename ?? metadata.originalBasename ?? document?.safeOriginalBasename ?? document?.originalBasename ?? metadata.fileName ?? metadata.filename;
  return candidate ? safeFilename(candidate) : '';
}

function sourceCreatedAt(document) {
  const metadata = documentMetadata(document);
  return metadata.uploadedAt ?? metadata.createdAt ?? document?.uploadedAt ?? document?.createdAt ?? document?.created_at ?? null;
}

function formatRelativeTime(value) {
  if (!value) return 'Time unavailable';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  const diff = Date.now() - timestamp;
  const abs = Math.abs(diff);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return 'just now';
  if (abs < hour) return `${Math.max(1, Math.round(abs / minute))} min ago`;
  if (abs < day) return `${Math.round(abs / hour)} hr ago`;
  if (abs < 7 * day) return `${Math.round(abs / day)} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sourceTypeLabel(document) {
  const metadata = documentMetadata(document);
  const value = String(metadata.sourceMethod ?? metadata.source ?? document?.sourceType ?? document?.type ?? '').toLowerCase();
  if (value.includes('pdf')) return 'PDF';
  if (value.includes('sample')) return 'Sample';
  if (value.includes('paste') || value.includes('text')) return 'Pasted text';
  return 'Document';
}

function documentStatusLabel(document) {
  const status = sanitizeDisplayText(document?.status, 'ready').toLowerCase();
  if (document?.pending) return 'Preparing';
  if (status === 'ready') return 'Ready';
  if (status === 'processing' || status === 'preparing') return 'Preparing';
  if (status === 'reading_pdf' || status === 'reading pdf') return 'Reading PDF';
  if (status === 'failed') return 'Needs recovery';
  return sanitizeDisplayText(status, 'Status unavailable');
}

function sourceSizeLabel(document) {
  const metadata = documentMetadata(document);
  const size = metadata.sizeBytes ?? document?.sizeBytes ?? document?.size;
  return formatBytes(size);
}

function sourceMetadataLine(document) {
  return [sourceTypeLabel(document), documentStatusLabel(document), formatRelativeTime(sourceCreatedAt(document)), sourceSizeLabel(document)]
    .filter(Boolean)
    .join(' · ');
}

function needsDisambiguation(document, titleCounts) {
  const title = sourceTitle(document).toLowerCase();
  return (titleCounts.get(title) ?? 0) > 1 || GENERIC_SOURCE_NAMES.has(title);
}

function hasFullSourceContent(document) {
  return typeof (document?.content ?? document?.text) === 'string' && (document.content ?? document.text).trim().length > 0;
}

function parseRouteFromHash() {
  if (typeof window === 'undefined') {
    return { view: 'intake', documentId: null };
  }
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('review/')) {
    return { view: 'review', documentId: decodeURIComponent(hash.slice('review/'.length)) || null };
  }
  return { view: 'intake', documentId: null };
}

function routeHash(route) {
  if (route?.view === 'review' && route.documentId) {
    return `#/review/${encodeURIComponent(route.documentId)}`;
  }
  return '#/intake';
}

function formatAnalysisItem(item) {
  if (item === null || item === undefined) return 'Not provided';
  if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return sanitizeDisplayText(item);
  if (typeof item === 'object') {
    const parts = [];
    const primary = item.name ?? item.party ?? item.title ?? item.type ?? item.severity ?? item.category;
    const detail = item.text ?? item.description ?? item.summary ?? item.value ?? item.obligation ?? item.requirement ?? item.risk;
    const quote = item.sourceQuote ?? item.quote;
    if (primary) parts.push(sanitizeDisplayText(primary));
    if (detail && detail !== primary) parts.push(sanitizeDisplayText(detail));
    if (quote) parts.push(`Source note: ${sanitizeDisplayText(quote)}`);
    if (parts.length > 0) return parts.join(' — ');
    return Object.entries(item)
      .filter(([key]) => !/id|score|metadata|raw|payload|reasoning|stack/i.test(key))
      .map(([key, value]) => `${sanitizeDisplayText(key)}: ${sanitizeDisplayText(value)}`)
      .join('; ') || 'Item available';
  }
  return sanitizeDisplayText(item);
}

function stripDuplicateSummaryLabel(value) {
  return String(value ?? '')
    .replace(/^summary\s+summary\s*[:—-]?\s*/i, '')
    .replace(/^summary\s*[:—-]\s*/i, '')
    .trim();
}

function safeBriefingSummary(value) {
  const text = sanitizeDisplayText(value, 'Generate the briefing to summarize this source.');
  const reviewerText = stripDuplicateSummaryLabel(text) || text;
  if (/provider returned|structured json|raw json|diagnostic|stack trace|could not convert.*structured briefing|failed.*briefing conversion/i.test(text)) {
    return 'The briefing needs another pass. Retry analysis to rebuild a reviewer-ready summary for this source.';
  }
  return reviewerText;
}

function hasAnalysisItems(items) {
  return asArray(items).some((item) => sanitizeDisplayText(formatAnalysisItem(item), '').trim());
}

function isFallbackOnlyBriefing(analysis) {
  if (!analysis) return false;
  const requirements = asArray(analysis?.requirements).length > 0 ? analysis.requirements : analysis?.obligations;
  const hasStructuredContent = [
    analysis.sections,
    analysis.entities,
    requirements,
    analysis.deliverables,
    analysis.risks,
    analysis.uncertainties,
    analysis.recommendedQuestions,
  ].some(hasAnalysisItems);
  const summary = sanitizeDisplayText(analysis.summary, '');
  return !hasStructuredContent && /could not convert.*structured briefing|failed.*briefing conversion|fallback-only|unable to produce.*briefing/i.test(summary);
}

function metadataValue(metadata, keys, fallback = 'Not available') {
  for (const key of keys) {
    const value = metadata?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      return sanitizeDisplayText(value);
    }
  }
  return fallback;
}

function tokenUsageLabel(metadata) {
  const usage = metadata?.tokenUsage ?? metadata?.usage ?? metadata?.tokenEstimate ?? null;
  if (!usage || typeof usage !== 'object') {
    const estimate = metadata?.tokens;
    return estimate ? `${sanitizeDisplayText(estimate)} estimated` : 'Not reported';
  }
  const total = usage.total ?? usage.total_tokens;
  const input = usage.input ?? usage.prompt_tokens;
  const output = usage.output ?? usage.completion_tokens;
  if (total) return `${sanitizeDisplayText(total)} total`;
  if (input || output) return `${sanitizeDisplayText(input ?? 0)} in / ${sanitizeDisplayText(output ?? 0)} out`;
  return 'Not reported';
}

function evidenceFromAnswer(answer, retrievedItems) {
  const items = asArray(retrievedItems);
  const citations = asArray(answer?.citations);
  return citations.map((citation, index) => {
    const matching = items.find((item) => (item.chunkId ?? item.id) === citation?.chunkId) ?? {};
    const section = sanitizeDisplayText(citation?.label ?? asArray(matching.headingPath).at(-1) ?? matching.label, `Citation ${index + 1}`);
    const excerpt = sanitizeDisplayText(citation?.quote ?? matching.contentExcerpt ?? matching.text ?? matching.content ?? matching.excerpt, 'Evidence excerpt unavailable.');
    return {
      key: `citation-${index + 1}`,
      label: section,
      marker: index + 1,
      section,
      excerpt,
    };
  });
}

function answerPresentation(answer, retrievedItems) {
  const metadata = answer?.metadata ?? {};
  const displayState = answer?.displayState ?? metadata.displayState ?? {};
  const stateKind = displayState.kind ?? metadata.displayStateKind ?? metadata.answerState;
  const citations = asArray(answer?.citations);
  const contextStrategy = metadata.contextStrategy ?? metadata.strategy;
  const hasGrounding = citations.length > 0 && contextStrategy !== 'fallback' && stateKind !== 'insufficient_evidence';

  if (stateKind === 'error' || answer?.error) {
    return {
      kind: 'error',
      badge: 'Answer unavailable',
      title: 'Answer unavailable',
      lead: 'The source and draft question were preserved. Retry or refine the question.',
      answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'The answer could not be generated safely.'),
      tone: '#fef2f2',
      color: '#991b1b',
      testId: TEST_IDS.chatAnswer,
      trust: 'Answer unavailable',
    };
  }

  if (answer?.unsupported || contextStrategy === 'unsupported' || stateKind === 'unsupported') {
    return {
      kind: 'unsupported',
      badge: 'Outside this source',
      title: 'Outside this source',
      lead: 'Ask about requirements, deliverables, risks, dates, parties, or sections in the selected source.',
      answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'This question is outside this source.'),
      tone: '#fef3c7',
      color: '#92400e',
      testId: TEST_IDS.unsupported,
      trust: 'Outside this source',
    };
  }

  if (stateKind === 'full_document_overview' || contextStrategy === 'full_document_overview') {
    return {
      kind: 'full_document_overview',
      badge: 'Source overview',
      title: 'Full-document overview',
      lead: 'This answer summarizes the selected source broadly. It is not claiming precise citation coverage for every sentence.',
      answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'Overview unavailable.'),
      tone: '#eff6ff',
      color: '#1d4ed8',
      testId: TEST_IDS.chatAnswer,
      trust: 'Full-document overview',
    };
  }

  if (!hasGrounding || stateKind === 'insufficient_evidence') {
    const suggestions = asArray(answer?.suggestedRefinements).length > 0
      ? asArray(answer.suggestedRefinements).map((item) => sanitizeDisplayText(item)).join(' ')
      : 'Try a more specific question, ask for a source overview, or inspect the source preview.';
    return {
      kind: 'insufficient',
      badge: 'Needs stronger evidence',
      title: 'Not enough answer-specific evidence',
      lead: suggestions,
      answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'I did not find enough cited evidence in this source to answer that confidently.'),
      tone: '#fff7ed',
      color: '#9a3412',
      testId: TEST_IDS.chatAnswer,
      trust: 'Not enough evidence',
    };
  }

  return {
    kind: 'grounded',
    badge: 'Based on this source',
    title: `Based on this source · ${citations.length} citation${citations.length === 1 ? '' : 's'}`,
    lead: 'Use the citation controls to inspect the exact evidence used for this answer.',
    answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'Answer unavailable.'),
    tone: '#ecfdf5',
    color: '#047857',
    testId: TEST_IDS.chatAnswer,
    trust: `Based on this source · ${citations.length} citation${citations.length === 1 ? '' : 's'}`,
  };
}

function starterQuestionsFor(document, analysis) {
  const recommended = asArray(analysis?.recommendedQuestions).filter(Boolean).map((item) => sanitizeDisplayText(item));
  if (recommended.length > 0) return recommended.slice(0, 6);
  const type = sourceTypeLabel(document);
  if (type === 'PDF') {
    return [
      'What is this document about?',
      'What requirements does it describe?',
      'What deliverables are expected?',
      'Which risks or uncertainties should a reviewer inspect?',
    ];
  }
  return [
    'What is this document about?',
    'What requirements or obligations does it describe?',
    'Which risks should a reviewer escalate?',
    'Which sections support the key duties?',
  ];
}

function operationStatus(loading) {
  const label = sanitizeDisplayText(loading, '');
  const lower = label.toLowerCase();
  if (!label) return null;
  if (lower.includes('pdf')) {
    return { label, steps: ['Uploading PDF…', 'Reading text…', 'Preparing source…', 'Opening workspace…'] };
  }
  if (lower.includes('briefing') || lower.includes('analysis')) {
    return { label, steps: ['Building briefing…', 'Extracting requirements…', 'Identifying risks…', 'Preparing questions…'] };
  }
  if (lower.includes('search') || lower.includes('answer') || lower.includes('evidence')) {
    return { label, steps: ['Searching selected source…', 'Drafting answer…', 'Checking evidence…'] };
  }
  if (lower.includes('source') || lower.includes('document')) {
    return { label, steps: ['Preparing source…', 'Preserving context…', 'Updating workspace…'] };
  }
  return { label, steps: [label] };
}

function AppStyles() {
  return (
    <style>{`
      :root { color-scheme: light; }
      *:focus-visible { outline: 3px solid #f59e0b; outline-offset: 3px; }
      button:disabled, input:disabled, textarea:disabled { cursor: not-allowed; opacity: 0.68; }
      .workspace-grid { display: grid; grid-template-columns: minmax(280px, 0.9fr) minmax(360px, 1.1fr); grid-template-areas: "sources sources" "preview briefing" "chat chat"; gap: 1rem; align-items: start; }
      .workspace-sources { grid-area: sources; display: grid; grid-template-columns: minmax(240px, 0.42fr) minmax(0, 1fr); gap: 1rem; align-items: stretch; }
      .workspace-briefing { grid-area: briefing; min-width: 0; }
      .workspace-chat-band { grid-area: chat; display: grid; gap: 1rem; min-width: 0; scroll-margin-top: 1rem; }
      .source-management-panel { min-width: 0; overflow: hidden; padding: 0.85rem !important; }
      .source-management-header { display: grid; gap: 0.5rem; align-items: start; margin-block-end: 0.65rem; }
      .source-management-header h2 { margin: 0; }
      .source-management-header p { margin: 0.25rem 0 0; color: #64748b; }
      .source-search-input, .briefing-search-input { width: min(28rem, 100%); border: 1px solid #cbd5e1; border-radius: 999px; padding: 0.55rem 0.8rem; font: inherit; background: #ffffff; }
      .source-rail-list { display: flex; gap: 0.65rem; overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 0.2rem; scroll-snap-type: x proximity; }
      .source-rail-list [data-testid="${TEST_IDS.sourceCard}"] { flex: 0 0 min(17rem, 78vw); scroll-snap-align: start; }
      .review-briefing-panel { height: clamp(20rem, 52vh, 34rem); overflow: hidden; display: flex; flex-direction: column; align-self: start; }
      .briefing-scroll { flex: 1 1 auto; min-height: 0; max-height: none; overflow: auto; padding-inline-end: 0.35rem; scroll-padding-top: 0.5rem; }
      .briefing-scroll article { scroll-margin-top: 0.5rem; }
      .intake-grid { display: grid; grid-template-columns: minmax(320px, 0.95fr) minmax(320px, 1.05fr); grid-template-areas: "sources sources" "create preview"; gap: 1rem; align-items: start; }
      .intake-sources { grid-area: sources; min-width: 0; }
      .intake-create { grid-area: create; min-width: 0; }
      .intake-preview { grid-area: preview; min-width: 0; }
      .login-grid { min-width: 0; }
      .login-feature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-block-start: 1rem; }
      .login-feature-card { border: 1px solid rgba(255,255,255,0.18); border-radius: 16px; padding: 0.75rem; background: rgba(255,255,255,0.08); color: #dbeafe; min-width: 0; }
      .screen-shell { overflow-x: clip; }
      .screen-shell, .review-workspace, .workspace-grid, .workspace-sources, .workspace-chat-band, .intake-grid, .login-grid, .intake-grid > *, .login-grid > *, .source-management-panel, .source-preview-column, [data-testid="${TEST_IDS.activeSource}"], [data-testid="${TEST_IDS.sourceCreate}"], [data-testid="${TEST_IDS.sourceCard}"] { min-width: 0; }
      .source-title-text, .source-filename-text { display: block; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; }
      .source-filename-text { color: inherit; }
      .source-preview-column { grid-area: preview; max-width: 100%; height: clamp(20rem, 52vh, 34rem); overflow: hidden; display: flex; flex-direction: column; align-self: start; }
      .source-preview-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; overscroll-behavior: contain; }
      .source-preview-column [data-testid="${TEST_IDS.evidenceExcerpt}"] { overflow-wrap: anywhere; word-break: break-word; }
      .source-card-enter { animation: card-in 180ms ease-out; }
      .status-dot { width: 0.48rem; height: 0.48rem; border-radius: 999px; background: #2563eb; display: inline-block; animation: pulse 900ms ease-in-out infinite alternate; }
      .skeleton { position: relative; overflow: hidden; background: #e2e8f0; border-radius: 12px; min-height: 0.9rem; }
      .skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent); animation: shimmer 1.4s infinite; }
      @keyframes shimmer { 100% { transform: translateX(100%); } }
      @keyframes pulse { from { transform: translateY(0); opacity: .45; } to { transform: translateY(-2px); opacity: 1; } }
      @keyframes card-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      @media (max-width: 1060px) { .workspace-grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "sources" "preview" "briefing" "chat"; } .workspace-sources { grid-template-columns: minmax(0, 1fr); } .intake-grid { grid-template-columns: minmax(0, 1fr); grid-template-areas: "sources" "create" "preview"; } .source-preview-column { grid-column: auto; } }
      @media (max-width: 780px) { .workspace-grid, .intake-grid, .login-grid { grid-template-columns: minmax(0, 1fr) !important; } .login-feature-grid { grid-template-columns: minmax(0, 1fr); } .app-header { align-items: flex-start !important; } .source-preview-column, .review-briefing-panel { height: clamp(18rem, 58vh, 32rem); } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.001ms !important; } }
      @media print {
        body { background: #ffffff !important; }
        [data-testid="${TEST_IDS.navIntake}"],
        [data-testid="${TEST_IDS.navWorkspace}"],
        [data-testid="${TEST_IDS.sourceManagement}"],
        [data-testid="${TEST_IDS.technicalDetails}"],
        [data-testid="${TEST_IDS.intakePdfPanel}"],
        .no-print,
        .review-workspace form { display: none !important; }
        .screen-shell { background: #ffffff !important; }
        .print-only { display: block !important; }
        .print-hidden { display: none !important; }
        .review-workspace { display: block !important; }
        article, section { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; }
      }
      @media screen { .print-only { display: none !important; } }
    `}</style>
  );
}

function AppShell({ auth, route, selectedDocument, onNavigateIntake, onNavigateWorkspace, onLogout = () => {}, children }) {
  return (
    <main className="screen-shell" style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eef6ff 0%, #f8fafc 42%, #ffffff 100%)', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <AppStyles />
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '1rem' }}>
        <header className="app-header no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBlockEnd: '1rem' }}>
          <div>
            <p style={{ margin: 0, color: '#2563eb', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>DocuLens</p>
            <h1 style={{ margin: '0.12rem 0', fontSize: auth ? 'clamp(1.35rem, 3vw, 2.05rem)' : 'clamp(1.9rem, 5vw, 3.2rem)', lineHeight: 1 }}>Source review workspace</h1>
          </div>
          {auth ? (
            <nav aria-label="Reviewer flow navigation" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button data-testid={TEST_IDS.navIntake} type="button" onClick={onNavigateIntake} style={route.view === 'intake' ? buttonStyle : mutedButtonStyle}>Add source</button>
              <button data-testid={TEST_IDS.navWorkspace} type="button" onClick={onNavigateWorkspace} disabled={!selectedDocument} aria-current={route.view === 'review' ? 'page' : undefined} style={route.view === 'review' ? buttonStyle : mutedButtonStyle}>Review</button>
              <span style={{ ...chipStyle, background: '#f8fafc', color: '#475569' }}>{sanitizeDisplayText(auth.user?.displayName ?? auth.user?.email, 'Signed-in reviewer')}</span>
              <button data-testid={TEST_IDS.logout} type="button" onClick={onLogout} style={mutedButtonStyle}>Log out</button>
            </nav>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}

function OperationStatus({ loading, error, empty, kind = 'info', testId, actions = null }) {
  if (!loading && !error && !empty) return null;
  const background = error ? '#fef2f2' : kind === 'success' ? '#ecfdf5' : '#eff6ff';
  const border = error ? '#fecaca' : kind === 'success' ? '#bbf7d0' : '#bfdbfe';
  const color = error ? '#991b1b' : kind === 'success' ? '#065f46' : '#1e3a8a';
  const status = operationStatus(loading);
  return (
    <section data-testid={testId} role={error ? 'alert' : 'status'} aria-live="polite" style={{ border: `1px solid ${border}`, background, color, borderRadius: '14px', padding: '0.85rem 1rem', marginBlock: '1rem' }}>
      {status ? (
        <div data-testid={TEST_IDS.loading}>
          <p style={{ margin: 0, fontWeight: 900 }}>{status.label}</p>
          <div aria-hidden="true" style={{ display: 'flex', gap: '0.25rem', marginBlockStart: '0.45rem' }}><span className="status-dot" /><span className="status-dot" style={{ animationDelay: '120ms' }} /><span className="status-dot" style={{ animationDelay: '240ms' }} /></div>
          <ol style={{ margin: '0.55rem 0 0', paddingInlineStart: '1.2rem' }}>{status.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
      ) : null}
      {error ? <p data-testid={TEST_IDS.error} style={{ margin: 0, fontWeight: 800 }}>{sanitizeDisplayText(error)}</p> : null}
      {empty ? <p data-testid={TEST_IDS.empty} style={{ margin: 0 }}>{sanitizeDisplayText(empty)}</p> : null}
      {actions ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBlockStart: '0.7rem' }}>{actions}</div> : null}
    </section>
  );
}

function LoginView({ email, password, loading, error, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    <AppShell auth={null} route={{ view: 'intake' }} selectedDocument={null} onNavigateIntake={() => {}} onNavigateWorkspace={() => {}}>
      <section className="login-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ ...panelStyle, background: '#0f172a', color: '#ffffff' }}>
          <p style={{ ...chipStyle, background: '#1e293b', color: '#bfdbfe' }}>Reviewer notebook</p>
          <h2 style={{ fontSize: '2.1rem', marginBlockEnd: '0.5rem' }}>Start with a source, then ask grounded questions.</h2>
          <p style={{ color: '#dbeafe', fontSize: '1.05rem' }}>Sign in to review a sample, pasted text, or a text-based PDF with citations and evidence available beside each answer.</p>
          <div className="login-feature-grid" aria-label="Reviewer flow highlights">
            {[
              ['1', 'Add PDFs or text', 'Keep source context attached to every review.'],
              ['2', 'Ask grounded questions', 'Answers stay scoped to the selected source.'],
              ['3', 'Inspect evidence', 'Citations and preview controls stay close to the answer.'],
            ].map(([step, title, body]) => (
              <article key={step} className="login-feature-card">
                <strong style={{ color: '#ffffff' }}>{step}. {title}</strong>
                <p style={{ marginBlock: '0.35rem 0', fontSize: '0.9rem' }}>{body}</p>
              </article>
            ))}
          </div>
        </div>
        <form onSubmit={onSubmit} style={panelStyle} aria-busy={Boolean(loading)}>
          <h2>Sign in</h2>
          <p style={{ color: '#475569' }}>Use the seeded demo account to enter the reviewer flow.</p>
          <OperationStatus loading={loading} error={error} />
          <label style={fieldStyle}>Email<input data-testid={TEST_IDS.email} type="email" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} required style={inputStyle} /></label>
          <label style={fieldStyle}>Password<input data-testid={TEST_IDS.password} type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required style={inputStyle} /></label>
          <button data-testid={TEST_IDS.loginSubmit} type="submit" disabled={Boolean(loading)} style={buttonStyle}>{loading ? 'Signing in…' : 'Sign in to review'}</button>
        </form>
      </section>
    </AppShell>
  );
}

function AddSourceFlow({ method, loading, documentTitle, documentContent, selectedPdf, pdfTitle, pdfStatus, pdfError, onMethodChange, onStartSample, onPasteSubmit, onTitleChange, onContentChange, onPdfFileChange, onPdfTitleChange, onPdfSubmit, onPasteTextFallback }) {
  const overLimit = selectedPdf ? selectedPdf.size > PDF_LIMITS.maxBytes : false;
  const busy = Boolean(loading);
  return (
    <section data-testid={TEST_IDS.sourceCreate} style={{ ...panelStyle, background: 'linear-gradient(135deg, #ffffff, #eff6ff)' }} aria-labelledby="create-source-heading" aria-busy={busy}>
      <p style={{ ...chipStyle, background: '#dbeafe', color: '#1d4ed8' }}>Add source</p>
      <h2 id="create-source-heading" style={{ marginBlock: '0.25rem' }}>One flow for PDF, pasted text, or sample</h2>
      <p style={{ color: '#334155' }}>Switch methods without losing entered context. The workspace stays scoped to one active source.</p>
      <fieldset style={{ border: 0, padding: 0, margin: '0 0 1rem' }}>
        <legend style={{ fontWeight: 900, marginBlockEnd: '0.5rem' }}>Source method</legend>
        <div role="radiogroup" aria-label="Source method" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
          {[
            ['pdf', 'Upload PDF'],
            ['paste', 'Paste text'],
            ['sample', 'Try sample'],
          ].map(([value, label]) => (
            <label key={value} style={{ ...mutedButtonStyle, background: method === value ? '#dbeafe' : '#f8fafc', borderColor: method === value ? '#2563eb' : '#cbd5e1' }}>
              <input type="radio" name="source-method" value={value} checked={method === value} onChange={() => onMethodChange(value)} style={{ marginInlineEnd: '0.4rem' }} />{label}
            </label>
          ))}
        </div>
      </fieldset>

      {method === 'pdf' ? (
        <form data-testid={TEST_IDS.intakePdfPanel} onSubmit={onPdfSubmit} aria-busy={busy}>
          <label style={fieldStyle}>Optional review title<input value={pdfTitle} onChange={(event) => onPdfTitleChange(event.target.value)} placeholder="e.g. Assessment PDF" style={inputStyle} /></label>
          <label style={fieldStyle}>PDF file<input data-testid={TEST_IDS.pdfInput} type="file" accept="application/pdf,.pdf" onChange={(event) => onPdfFileChange(event.target.files?.[0] ?? null)} style={{ ...inputStyle, border: '1px dashed #94a3b8', background: '#f8fafc' }} /></label>
          {selectedPdf ? (
            <div data-testid={TEST_IDS.pdfSelected} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem', marginBlock: '0.75rem', background: overLimit ? '#fff7ed' : '#f8fafc' }}>
              <strong>{safeFilename(selectedPdf.name)}</strong>
              <p style={{ margin: '0.25rem 0' }}>PDF · {formatBytes(selectedPdf.size)}</p>
              <p style={{ margin: 0 }}>{overLimit ? `This file appears larger than ${PDF_LIMITS.maxSizeLabel}. Choose a smaller PDF or paste text.` : 'Selected. Ready to read as a source.'}</p>
            </div>
          ) : null}
          <OperationStatus testId={TEST_IDS.pdfStatus} loading={pdfStatus} />
          <PdfRecovery fileName={selectedPdf ? safeFilename(selectedPdf.name) : ''} error={pdfError} onChooseOther={() => onPdfFileChange(null)} onPasteText={onPasteTextFallback} />
          <button data-testid={TEST_IDS.pdfSubmit} type="submit" disabled={busy || !selectedPdf || overLimit} style={secondaryButtonStyle}>{busy && pdfStatus ? 'Reading PDF…' : 'Read PDF'}</button>
        </form>
      ) : null}

      {method === 'paste' ? (
        <form data-testid={TEST_IDS.intakePastePanel} onSubmit={onPasteSubmit} aria-busy={busy}>
          <label style={fieldStyle}>Title<input data-testid={TEST_IDS.documentTitle} value={documentTitle} onChange={(event) => onTitleChange(event.target.value)} required style={inputStyle} /></label>
          <label style={fieldStyle}>Text content<textarea data-testid={TEST_IDS.documentContent} value={documentContent} onChange={(event) => onContentChange(event.target.value)} rows={10} required style={{ ...inputStyle, resize: 'vertical' }} /></label>
          <button data-testid={TEST_IDS.documentSubmit} type="submit" disabled={busy} style={secondaryButtonStyle}>{busy ? 'Creating source…' : 'Create source'}</button>
        </form>
      ) : null}

      {method === 'sample' ? (
        <div>
          <p style={{ color: '#475569' }}>Open a safe sample source to explore briefing, chat, and citations without uploading anything.</p>
          <button data-testid={TEST_IDS.intakeSampleCta} type="button" onClick={onStartSample} disabled={busy} style={buttonStyle}>{busy ? 'Opening sample…' : 'Try sample NDA'}</button>
        </div>
      ) : null}
    </section>
  );
}

function PdfRecovery({ fileName, error, onChooseOther, onPasteText }) {
  if (!error) return null;
  return (
    <section data-testid={TEST_IDS.pdfRecovery} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '14px', padding: '0.85rem', marginBlock: '0.75rem' }}>
      <p style={{ fontWeight: 900, marginTop: 0 }}>{fileName ? `${fileName}: ` : ''}{sanitizeDisplayText(error, 'This PDF could not be read.')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        <button type="button" onClick={onChooseOther} style={mutedButtonStyle}>Choose another PDF</button>
        <button data-testid={TEST_IDS.pasteTextFallback} type="button" onClick={onPasteText} style={secondaryButtonStyle}>Paste text instead</button>
      </div>
    </section>
  );
}

function SourceRail({ documents, activeDocument, pendingSource, loading, onOpenDocument, onRenameDocument, onDeleteDocument }) {
  const [sourceQuery, setSourceQuery] = useState('');
  const cards = pendingSource ? [pendingSource, ...documents] : documents;
  const normalizedQuery = compactWhitespace(sourceQuery).toLowerCase();
  const visibleCards = normalizedQuery
    ? cards.filter((document) => [
      sourceTitle(document),
      sourceFilename(document),
      sourceMetadataLine(document),
      document?.summary,
      document?.description,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
    : cards;
  const titleCounts = new Map(cards.map((document) => sourceTitle(document).toLowerCase()).map((title) => [title, cards.filter((entry) => sourceTitle(entry).toLowerCase() === title).length]));
  if (cards.length === 0) return null;
  return (
    <section data-testid={TEST_IDS.sourceManagement} className="source-management-panel no-print" style={panelStyle} aria-labelledby="sources-heading">
      <div className="source-management-header">
        <div>
          <h2 id="sources-heading">Sources</h2>
          <p>Open, rename, delete, or search sources. Scroll sideways when several sources are available.</p>
        </div>
        <label style={{ ...fieldStyle, margin: 0, width: 'min(28rem, 100%)' }}>Search sources<input data-testid={TEST_IDS.sourceSearch} className="source-search-input" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Search title, filename, type…" /></label>
      </div>
      {visibleCards.length === 0 ? <OperationStatus empty={`No sources match "${sanitizeDisplayText(sourceQuery, 'that search')}".`} /> : null}
      <div data-testid={TEST_IDS.sourceRail} role="list" className="source-rail-list">
        {visibleCards.map((document) => {
          const active = document.id && activeDocument?.id === document.id;
          const filename = sourceFilename(document);
          const showFilename = filename && filename.toLowerCase() !== sourceTitle(document).toLowerCase();
          const disambiguator = needsDisambiguation(document, titleCounts) ? (filename || `${sourceTypeLabel(document)} · ${formatRelativeTime(sourceCreatedAt(document))}`) : '';
          return (
            <article key={document.id ?? document.title} data-testid={TEST_IDS.sourceCard} role="listitem" className="source-card-enter" aria-current={active ? 'true' : undefined} style={{ border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`, borderRadius: '16px', padding: '0.75rem', background: active ? '#eff6ff' : '#f8fafc' }}>
              <button type="button" disabled={!document.id || document.pending || Boolean(loading)} onClick={() => document.id ? onOpenDocument(document) : undefined} style={{ ...mutedButtonStyle, width: '100%', textAlign: 'left', borderRadius: '12px', background: active ? '#dbeafe' : '#ffffff', minWidth: 0 }} aria-label={`Open source ${sourceTitle(document)}`}>
                <strong className="source-title-text">{sourceTitle(document)}</strong>
                {showFilename ? <span className="source-filename-text">{filename}</span> : null}
                {disambiguator && !showFilename ? <span className="source-filename-text">{disambiguator}</span> : null}
                <br />
                <span data-testid={TEST_IDS.sourceStatus}>{sourceMetadataLine(document)}</span>
              </button>
              {!document.pending && document.id ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBlockStart: '0.5rem' }}>
                  <button type="button" onClick={() => onOpenDocument(document)} disabled={Boolean(loading)} style={{ ...mutedButtonStyle, padding: '0.45rem 0.65rem' }}>Open</button>
                  <button type="button" onClick={() => onRenameDocument(document)} disabled={Boolean(loading)} style={{ ...mutedButtonStyle, padding: '0.45rem 0.65rem' }} aria-label={`Rename source ${sourceTitle(document)}`}>Rename</button>
                  <button type="button" onClick={() => onDeleteDocument(document)} disabled={Boolean(loading)} style={{ ...dangerButtonStyle, padding: '0.45rem 0.65rem' }} aria-label={`Delete source ${sourceTitle(document)}`}>Delete</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ActiveSourceCard({ document }) {
  const filename = sourceFilename(document);
  return (
    <section data-testid={TEST_IDS.activeSource} style={{ ...panelStyle, background: '#0f172a', color: '#ffffff' }}>
      <p style={{ ...chipStyle, background: '#1e293b', color: '#bfdbfe' }}>Active source</p>
      <h2 className="source-title-text" style={{ marginBlock: '0.3rem', fontSize: '1.45rem' }}>{sourceTitle(document)}</h2>
      {filename ? <p className="source-filename-text" style={{ color: '#dbeafe', marginBlock: '0.25rem' }}>{filename}</p> : null}
      <p><span data-testid={TEST_IDS.sourceStatus} style={{ ...chipStyle, background: '#dcfce7', color: '#166534' }}>{documentStatusLabel(document)}</span><span style={{ ...chipStyle, background: '#e0f2fe', color: '#075985' }}>{sourceTypeLabel(document)}</span></p>
      <p style={{ color: '#cbd5e1', marginBlockEnd: 0 }}>{sourceMetadataLine(document)}</p>
    </section>
  );
}

function SourcePreview({ document, activeEvidence }) {
  const excerptRef = useRef(null);
  const rawContent = document?.content ?? document?.text ?? '';
  const overview = sanitizeDisplayText(rawContent, 'Choose a source to see the source content.');
  const section = activeEvidence?.section ?? 'Source overview';
  const text = activeEvidence?.excerpt ?? overview;
  useEffect(() => {
    if (activeEvidence) excerptRef.current?.focus();
  }, [activeEvidence]);
  return (
    <section data-testid={TEST_IDS.evidencePanel} className="source-preview-column" style={panelStyle} aria-labelledby="source-preview-heading">
      <h2 id="source-preview-heading">Source preview</h2>
      <p data-testid={TEST_IDS.evidenceSource} style={{ minWidth: 0, overflowWrap: 'anywhere' }}><strong>Source:</strong> {sourceTitle(document)}</p>
      <p data-testid={TEST_IDS.evidenceSection}><strong>{activeEvidence ? 'Highlighted citation' : 'Preview'}:</strong> {sanitizeDisplayText(section, 'Source overview')}</p>
      <div ref={excerptRef} tabIndex={activeEvidence ? -1 : undefined} className="source-preview-scroll" style={{ border: `2px solid ${activeEvidence ? '#f59e0b' : '#e2e8f0'}`, borderRadius: '14px', padding: '0.8rem', background: activeEvidence ? '#fffbeb' : '#f8fafc' }} aria-label={activeEvidence ? 'Highlighted source excerpt' : 'Source preview excerpt'}>
        <p data-testid={TEST_IDS.evidenceExcerpt} style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{sanitizeDisplayText(text, 'Source excerpt unavailable.')}</p>
      </div>
      <p style={{ color: '#64748b' }}>{activeEvidence ? 'The highlighted excerpt is shown here for review.' : 'Ask a question or select evidence to highlight source text here.'}</p>
    </section>
  );
}

function AnalysisCard({ title, items }) {
  const normalizedItems = asArray(items).filter((item) => sanitizeDisplayText(formatAnalysisItem(item), '').trim());
  if (normalizedItems.length === 0) return null;
  return (
    <article style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem', background: '#f8fafc' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <ul style={{ marginBlockEnd: 0 }}>{normalizedItems.map((item, index) => <li key={`${title}-${index}`}>{formatAnalysisItem(item)}</li>)}</ul>
    </article>
  );
}

function ReviewBriefing({ analysis, loading, onAnalyze }) {
  const busy = Boolean(loading);
  const [briefingQuery, setBriefingQuery] = useState('');
  const requirements = asArray(analysis?.requirements).length > 0 ? analysis.requirements : analysis?.obligations;
  const recovery = isFallbackOnlyBriefing(analysis);
  const cards = analysis && !recovery ? [
    ['Assessment parts', analysis.sections],
    ['Key entities', analysis.entities],
    ['Requirements', requirements],
    ['Deliverables', analysis.deliverables],
    ['Risks and trade-offs', analysis.risks],
    ['Uncertainties', analysis.uncertainties],
    ['Recommended questions', analysis.recommendedQuestions],
  ] : [];
  const briefingNeedle = compactWhitespace(briefingQuery).toLowerCase();
  const itemText = (items) => asArray(items).map((item) => formatAnalysisItem(item)).join(' ');
  const summaryMatches = !briefingNeedle || safeBriefingSummary(analysis?.summary).toLowerCase().includes(briefingNeedle);
  const visibleCards = briefingNeedle
    ? cards.filter(([title, items]) => `${title} ${itemText(items)}`.toLowerCase().includes(briefingNeedle))
    : cards;
  const hasVisibleBriefing = summaryMatches || visibleCards.length > 0;
  return (
    <section data-testid={TEST_IDS.reviewBriefing} className="review-briefing-panel" style={panelStyle} aria-labelledby="briefing-heading" aria-busy={busy}>
      <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ ...chipStyle, background: '#eef2ff', color: '#3730a3' }}>Briefing</p>
          <h2 id="briefing-heading" style={{ marginTop: 0 }}>Review briefing</h2>
        </div>
        <button data-testid={TEST_IDS.documentAnalyze} type="button" onClick={onAnalyze} disabled={busy} style={secondaryButtonStyle}>{busy ? 'Building briefing…' : analysis ? 'Regenerate briefing' : 'Generate briefing'}</button>
      </div>
      {busy ? <OperationStatus loading={loading} /> : null}
      {analysis && !recovery ? (
        <label style={{ ...fieldStyle, marginBlock: '0.5rem 0.75rem' }}>Search briefing<input data-testid={TEST_IDS.briefingSearch} className="briefing-search-input" value={briefingQuery} onChange={(event) => setBriefingQuery(event.target.value)} placeholder="Search requirements, risks, questions…" /></label>
      ) : null}
      {analysis && recovery ? (
        <article style={{ border: '1px solid #fed7aa', borderRadius: '14px', padding: '0.9rem', background: '#fff7ed' }}>
          <h3 style={{ marginTop: 0 }}>Briefing needs another pass</h3>
          <p data-testid={TEST_IDS.analysisSummary}>{safeBriefingSummary(analysis.summary)}</p>
          <p style={{ marginBlockEnd: 0 }}>No structured sections were recovered for this source yet. Retry the briefing, or ask a source overview question while the source preview remains available.</p>
        </article>
      ) : analysis ? (
        <div className="briefing-scroll" role="region" aria-label="Scrollable briefing results">
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {summaryMatches ? (
              <article style={{ borderLeft: '4px solid #2563eb', paddingLeft: '0.85rem' }}>
                <h3>Summary</h3>
                <p data-testid={TEST_IDS.analysisSummary}>{safeBriefingSummary(analysis.summary)}</p>
              </article>
            ) : null}
            {visibleCards.map(([title, items]) => <AnalysisCard key={title} title={title} items={items} />)}
            {!hasVisibleBriefing ? <OperationStatus empty={`No briefing items match "${sanitizeDisplayText(briefingQuery, 'that search')}".`} /> : null}
          </div>
        </div>
      ) : !busy ? (
        <div>
          <p>Generate a scannable briefing with assessment parts, requirements, deliverables, risks, uncertainties, and recommended questions.</p>
        </div>
      ) : <SkeletonBlock label="Briefing is being prepared" />}
    </section>
  );
}

function SkeletonBlock({ label }) {
  return (
    <div aria-label={label} style={{ display: 'grid', gap: '0.5rem' }}>
      <div className="skeleton" style={{ width: '70%', height: '1rem' }} />
      <div className="skeleton" style={{ width: '90%', height: '1rem' }} />
      <div className="skeleton" style={{ width: '55%', height: '1rem' }} />
    </div>
  );
}

function StarterQuestions({ document, analysis, onSelectQuestion }) {
  const questions = starterQuestionsFor(document, analysis);
  return (
    <section data-testid={TEST_IDS.starterQuestions} style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem', background: '#f8fafc' }} aria-labelledby="starter-heading">
      <h3 id="starter-heading" style={{ marginTop: 0 }}>Suggested questions</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {questions.map((question) => (
          <button key={question} data-testid={TEST_IDS.starterQuestion} type="button" onClick={() => onSelectQuestion(question)} style={mutedButtonStyle}>{question}</button>
        ))}
      </div>
    </section>
  );
}

function ChatSection({ document, analysis, question, loading, error, answerHistory, onQuestionChange, onSubmit, onRetry, onSelectQuestion, onSelectEvidence }) {
  const busy = Boolean(loading);
  const latestAnswerRef = useRef(null);
  useEffect(() => {
    if (!busy && answerHistory.length > 0) {
      latestAnswerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [answerHistory.length, busy]);
  return (
    <section style={panelStyle} aria-labelledby="chat-heading" aria-busy={busy}>
      <h2 id="chat-heading">Ask this source</h2>
      <StarterQuestions document={document} analysis={analysis} onSelectQuestion={onSelectQuestion} />
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.65rem', marginBlockStart: '0.85rem' }}>
        <label style={fieldStyle}>Question<input data-testid={TEST_IDS.chatInput} value={question} onChange={(event) => onQuestionChange(event.target.value)} placeholder="What does this source require?" required style={inputStyle} /></label>
        <button data-testid={TEST_IDS.chatSubmit} type="submit" disabled={busy || !question.trim()} style={secondaryButtonStyle}>{busy ? 'Asking…' : 'Ask source'}</button>
      </form>
      {busy ? <OperationStatus loading={loading} /> : null}
      {error && question.trim() ? <OperationStatus error={error} actions={<><button type="button" onClick={onRetry} style={secondaryButtonStyle}>Retry answer</button><button type="button" onClick={() => onSelectQuestion('What is this document about?')} style={mutedButtonStyle}>Ask overview instead</button></>} /> : null}
      {answerHistory.length === 0 ? <OperationStatus empty="Ask a source-specific question to see answer states, citations, and evidence used." /> : (
        <div style={{ display: 'grid', gap: '0.85rem', marginBlockStart: '1rem' }}>
          {answerHistory.map((entry, index) => (
            <div key={entry.id} ref={index === answerHistory.length - 1 ? latestAnswerRef : null} style={{ scrollMarginTop: '1rem' }}>
              <AnswerCard entry={entry} ordinal={index + 1} onSelectQuestion={onSelectQuestion} onSelectEvidence={onSelectEvidence} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AnswerCard({ entry, ordinal, onSelectQuestion, onSelectEvidence }) {
  const presentation = answerPresentation(entry.answer, entry.retrievedChunks);
  const evidence = evidenceFromAnswer(entry.answer, entry.retrievedChunks);
  const canShowCitations = presentation.kind === 'grounded' && evidence.length > 0;
  const noEvidenceMessage = presentation.kind === 'full_document_overview'
    ? 'This overview uses the full selected source, not sentence-by-sentence citations.'
    : presentation.kind === 'unsupported'
      ? 'No answer-specific evidence was used because the question is outside this source.'
      : 'No answer-specific evidence was used. Refine the question or ask for a source overview.';
  return (
    <article data-testid={TEST_IDS.answerCard} className="source-card-enter" style={{ border: `1px solid ${presentation.color}`, background: presentation.tone, borderRadius: '16px', padding: '1rem' }}>
      <p style={{ ...chipStyle, background: '#ffffff', color: presentation.color }}>{presentation.badge}</p>
      <h3 style={{ marginBlock: '0.35rem' }}>Q{ordinal}: {sanitizeDisplayText(entry.question, 'Reviewer question')}</h3>
      <p style={{ color: presentation.color, fontWeight: 800 }}>{presentation.title}</p>
      <p>{presentation.lead}</p>
      <p data-testid={presentation.testId} style={{ fontSize: '1.03rem' }}>{presentation.answerText}{canShowCitations ? ' ' : ''}{canShowCitations ? evidence.map((item) => <button key={item.key} data-testid={TEST_IDS.inlineCitation} type="button" onClick={() => onSelectEvidence(item)} style={{ ...mutedButtonStyle, padding: '0.2rem 0.45rem', marginInlineStart: '0.25rem' }} aria-label={`Show source excerpt for citation ${item.marker}`}>[{item.marker}]</button>) : null}</p>
      {canShowCitations ? (
        <>
          <section data-testid={TEST_IDS.chatCitations} aria-label="Citation controls" style={{ marginBlockStart: '0.75rem' }}>
            <h4>Citation controls</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>{evidence.map((item) => <button key={`${item.key}-chip`} data-testid={TEST_IDS.evidenceChip} type="button" onClick={() => onSelectEvidence(item)} style={mutedButtonStyle}>Citation {item.marker}: {item.label}</button>)}</div>
          </section>
          <section data-testid={TEST_IDS.chatRetrievedChunks} aria-label="Evidence used" style={{ marginBlockStart: '0.75rem' }}>
            <h4>Evidence used</h4>
            <ul>{evidence.map((item) => <li key={`${item.key}-excerpt`}><strong>{item.label}:</strong> {item.excerpt}</li>)}</ul>
          </section>
        </>
      ) : <p style={{ marginBlockStart: '0.75rem', marginBlockEnd: 0 }}>{noEvidenceMessage}</p>}
      {presentation.kind === 'insufficient' || presentation.kind === 'unsupported' || presentation.kind === 'error' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBlockStart: '0.75rem' }}>
          <button type="button" onClick={() => onSelectQuestion('What is this document about?')} style={secondaryButtonStyle}>Ask overview</button>
          <button type="button" onClick={() => onSelectQuestion(`${sanitizeDisplayText(entry.question, 'Question')} — answer only with evidence from the selected source.`)} style={mutedButtonStyle}>Refine with source evidence</button>
        </div>
      ) : null}
    </article>
  );
}

function TrustLayer({ metadata, answer }) {
  const [open, setOpen] = useState(false);
  const presentation = answer ? answerPresentation(answer, []) : null;
  const citations = asArray(answer?.citations);
  const summary = presentation?.trust ?? 'No answer yet';
  const provider = `${metadataValue(metadata, ['provider'], 'Not reported')} / ${metadataValue(metadata, ['model'], 'Not reported')}`;
  return (
    <section data-testid={TEST_IDS.aiMetadata} style={panelStyle} aria-label="Review trust">
      <h2>Review trust</h2>
      <div data-testid={TEST_IDS.aiTrustBar} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.55rem' }}>
        <TrustMetric label="Answer state" value={summary} />
        <TrustMetric label="Citations" value={answer ? `${citations.length} citation${citations.length === 1 ? '' : 's'}` : 'No citations yet'} />
      </div>
      <p data-testid={TEST_IDS.trustSummary} style={{ ...chipStyle, background: '#f8fafc', color: '#334155' }}>{summary}</p>
      <details data-testid={TEST_IDS.technicalDetails} onToggle={(event) => setOpen(event.currentTarget.open)} style={{ marginBlockStart: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 900 }}>Technical details</summary>
        {open ? (
          <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.45rem 0.85rem' }}>
            <dt>Provider / model</dt><dd>{provider}</dd>
            <dt>Prompt version</dt><dd>{metadataValue(metadata, ['promptVersion'], 'Not reported')}</dd>
            <dt>Retrieval mode</dt><dd>{metadataValue(metadata, ['contextStrategy', 'retrievalMode', 'strategy'], 'Not reported')}</dd>
            <dt>Fallback reason</dt><dd>{metadataValue(metadata, ['fallbackReason', 'backendFallbackReason', 'unsupportedReason'], 'None')}</dd>
            <dt>Citation diagnostics</dt><dd>{citations.length} citation{citations.length === 1 ? '' : 's'} available; internal identifiers are hidden.</dd>
            <dt>Token usage</dt><dd>{tokenUsageLabel(metadata)}</dd>
          </dl>
        ) : null}
      </details>
    </section>
  );
}

function TrustMetric({ label, value }) {
  return <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.7rem', background: '#f8fafc' }}><dt style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 900 }}>{label}</dt><dd style={{ margin: 0, fontWeight: 800 }}>{sanitizeDisplayText(value)}</dd></div>;
}

function PrintReviewOutput({ document, analysis, answerHistory, activeEvidence, latestAnswer }) {
  const latestPresentation = latestAnswer ? answerPresentation(latestAnswer, []) : null;
  return (
    <section data-testid={TEST_IDS.printOutput} className="print-only" style={{ padding: '1rem', background: '#ffffff', color: '#111827' }}>
      <h1>DocuLens review summary</h1>
      <h2>{sourceTitle(document)}</h2>
      <p>{safeBriefingSummary(analysis?.summary ?? (document?.content ?? document?.text ?? '')).slice(0, 900)}</p>
      {latestPresentation ? <p>{latestPresentation.trust}</p> : null}
      {answerHistory.map((entry, index) => {
        const presentation = answerPresentation(entry.answer, entry.retrievedChunks);
        const evidence = evidenceFromAnswer(entry.answer, entry.retrievedChunks);
        return (
          <article key={entry.id}>
            <h3>Answer {index + 1}</h3>
            <p>{presentation.answerText}</p>
            <p>{presentation.trust}</p>
            {evidence.map((item) => <blockquote key={item.key}>{item.excerpt}</blockquote>)}
          </article>
        );
      })}
      {activeEvidence ? <blockquote>{activeEvidence.excerpt}</blockquote> : null}
    </section>
  );
}

function ReviewWorkspace({ auth, route, documents, document, analysis, latestAnswer, answerHistory, question, loading, error, activeEvidence, onNavigateIntake, onLogout, onAnalyze, onQuestionChange, onQuestionSubmit, onRetryQuestion, onSelectQuestion, onSelectEvidence, onOpenDocument, onRenameDocument, onDeleteDocument }) {
  if (!document) {
    return (
      <AppShell auth={auth} route={route} selectedDocument={null} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={onNavigateIntake} onLogout={onLogout}>
        <OperationStatus error="Choose a source to open the review workspace." actions={<button type="button" onClick={onNavigateIntake} style={buttonStyle}>Go to Add source</button>} />
      </AppShell>
    );
  }

  const latestMetadata = latestAnswer?.metadata ?? analysis?.metadata ?? null;
  const chatLoading = loading && /search|answer|evidence/i.test(loading) ? loading : '';
  const briefingLoading = loading && /briefing|analysis/i.test(loading) ? loading : '';
  const pageLoading = chatLoading || briefingLoading ? '' : loading;
  return (
    <AppShell auth={auth} route={route} selectedDocument={document} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={() => {}} onLogout={onLogout}>
      <section data-testid={TEST_IDS.workspaceRoot} className="review-workspace" style={{ display: 'grid', gap: '1rem' }}>
        <PrintReviewOutput document={document} analysis={analysis} answerHistory={answerHistory} activeEvidence={activeEvidence} latestAnswer={latestAnswer} />
        <OperationStatus loading={pageLoading} error={error && !question.trim() ? error : ''} />
        <section data-testid={TEST_IDS.analysisPanel} className="workspace-grid" aria-label={`Review workspace for ${sourceTitle(document)}`}>
          <div className="workspace-sources">
            <ActiveSourceCard document={document} />
            <SourceRail documents={documents} activeDocument={document} loading={loading} onOpenDocument={onOpenDocument} onRenameDocument={onRenameDocument} onDeleteDocument={onDeleteDocument} />
          </div>
          <SourcePreview document={document} activeEvidence={activeEvidence} />
          <div className="workspace-briefing">
            <ReviewBriefing analysis={analysis} loading={briefingLoading} onAnalyze={onAnalyze} />
          </div>
          <div className="workspace-chat-band">
            <ChatSection document={document} analysis={analysis} question={question} loading={chatLoading} error={error} answerHistory={answerHistory} onQuestionChange={onQuestionChange} onSubmit={onQuestionSubmit} onRetry={onRetryQuestion} onSelectQuestion={onSelectQuestion} onSelectEvidence={onSelectEvidence} />
            <TrustLayer metadata={latestMetadata} answer={latestAnswer} />
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function IntakeView({ auth, route, loading, error, empty, documents, selectedDocument, pendingSource, sourceMethod, documentTitle, documentContent, selectedPdf, pdfTitle, pdfStatus, pdfError, onNavigateIntake, onNavigateWorkspace, onLogout, onSourceMethodChange, onStartSample, onPasteSubmit, onDocumentTitleChange, onDocumentContentChange, onPdfFileChange, onPdfTitleChange, onPdfSubmit, onOpenDocument, onRenameDocument, onDeleteDocument, onPasteTextFallback }) {
  return (
    <AppShell auth={auth} route={route} selectedDocument={selectedDocument} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={onNavigateWorkspace} onLogout={onLogout}>
      <OperationStatus loading={loading && !pdfStatus ? loading : ''} error={error} empty={empty} />
      <div className="intake-grid">
        <div className="intake-sources">
          <SourceRail documents={documents} activeDocument={selectedDocument} pendingSource={pendingSource} loading={loading} onOpenDocument={onOpenDocument} onRenameDocument={onRenameDocument} onDeleteDocument={onDeleteDocument} />
        </div>
        <div className="intake-create">
          <AddSourceFlow method={sourceMethod} loading={loading} documentTitle={documentTitle} documentContent={documentContent} selectedPdf={selectedPdf} pdfTitle={pdfTitle} pdfStatus={pdfStatus} pdfError={pdfError} onMethodChange={onSourceMethodChange} onStartSample={onStartSample} onPasteSubmit={onPasteSubmit} onTitleChange={onDocumentTitleChange} onContentChange={onDocumentContentChange} onPdfFileChange={onPdfFileChange} onPdfTitleChange={onPdfTitleChange} onPdfSubmit={onPdfSubmit} onPasteTextFallback={onPasteTextFallback} />
        </div>
        <div className="intake-preview">
          {selectedDocument ? <SourcePreview document={selectedDocument} activeEvidence={null} /> : <section style={panelStyle}><h2>Source preview</h2><p>Add or open a source to preview its contents here.</p></section>}
        </div>
      </div>
    </AppShell>
  );
}

export function App() {
  const [auth, setAuth] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sourceMethod, setSourceMethod] = useState('pdf');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentContent, setDocumentContent] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [question, setQuestion] = useState('');
  const [answerHistory, setAnswerHistory] = useState([]);
  const [selectedPdf, setSelectedPdf] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfStatus, setPdfStatus] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [pendingSource, setPendingSource] = useState(null);
  const [activeEvidence, setActiveEvidence] = useState(null);
  const [route, setRoute] = useState(parseRouteFromHash);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const token = auth?.accessToken;
  const latestAnswer = answerHistory.at(-1)?.answer ?? null;
  const routeDocument = useMemo(() => {
    if (route.view !== 'review' || !route.documentId) return selectedDocument;
    if (selectedDocument?.id === route.documentId && hasFullSourceContent(selectedDocument)) return selectedDocument;
    return documents.find((document) => document.id === route.documentId) ?? selectedDocument;
  }, [documents, route, selectedDocument]);
  const hasNoSources = Boolean(auth) && !loading && documents.length === 0 && route.view === 'intake' && !pendingSource;

  useEffect(() => {
    function handleRouteChange() {
      setRoute(parseRouteFromHash());
    }
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    if (!window.location.hash) window.history.replaceState({ doculensView: 'intake' }, '', routeHash({ view: 'intake' }));
    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  useEffect(() => {
    if (!token || route.view !== 'review' || !route.documentId) return;
    const current = documents.find((document) => document.id === route.documentId) ?? selectedDocument;
    if (current && hasFullSourceContent(current)) {
      if (selectedDocument?.id !== current.id || !hasFullSourceContent(selectedDocument)) setSelectedDocument(current);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading('Preparing source…');
        const { document } = await requestJson(`/api/documents/${encodeURIComponent(route.documentId)}`, { token });
        if (cancelled) return;
        setDocuments((existing) => [document, ...existing.filter((entry) => entry.id !== document.id)]);
        setSelectedDocument(document);
      } catch (detailError) {
        if (!cancelled) {
          const fallback = documents.find((entry) => entry.id !== route.documentId) ?? null;
          setError(safeErrorMessage(detailError, 'document'));
          if (fallback) {
            resetReviewState();
            navigateToReview(fallback);
          } else {
            navigateToIntake();
          }
        }
      } finally {
        if (!cancelled) setLoading('');
      }
    })();
    return () => { cancelled = true; };
  }, [token, route, documents, selectedDocument]);

  function navigate(nextRoute) {
    const nextHash = routeHash(nextRoute);
    if (typeof window !== 'undefined' && window.location.hash !== nextHash) {
      window.history.pushState({ doculensView: nextRoute.view, documentId: nextRoute.documentId ?? null }, '', nextHash);
    }
    setRoute(nextRoute);
  }

  function navigateToIntake() {
    setError('');
    setActiveEvidence(null);
    navigate({ view: 'intake', documentId: null });
  }

  function navigateToReview(document) {
    setSelectedDocument(document);
    setActiveEvidence(null);
    navigate({ view: 'review', documentId: document.id });
  }

  function resetReviewState() {
    setAnalysis(null);
    setAnswerHistory([]);
    setActiveEvidence(null);
    setQuestion('');
  }

  function handleLogout() {
    setAuth(null);
    setEmail('');
    setPassword('');
    setDocuments([]);
    setSelectedDocument(null);
    setPendingSource(null);
    setSelectedPdf(null);
    setPdfTitle('');
    setPdfStatus('');
    setPdfError('');
    setLoading('');
    setError('');
    resetReviewState();
    navigate({ view: 'intake', documentId: null });
  }

  async function loadDocuments(nextToken) {
    const { documents: loadedDocuments = [] } = await requestJson('/api/documents', { token: nextToken });
    setDocuments(loadedDocuments);
    return loadedDocuments;
  }

  async function ensureDocumentDetail(document) {
    if (!document?.id) return document;
    if (hasFullSourceContent(document)) return document;
    setLoading('Preparing source…');
    const { document: detailed } = await requestJson(`/api/documents/${encodeURIComponent(document.id)}`, { token });
    setDocuments((current) => [detailed, ...current.filter((entry) => entry.id !== detailed.id)]);
    return detailed;
  }

  async function handleOpenDocument(document) {
    if (loading) return;
    setError('');
    setPdfError('');
    resetReviewState();
    try {
      const detailed = await ensureDocumentDetail(document);
      navigateToReview(detailed);
    } catch (detailError) {
      setError(safeErrorMessage(detailError, 'document'));
    } finally {
      setLoading('');
    }
  }

  async function handleRenameDocument(document) {
    if (loading || !document?.id) return;
    const nextTitle = window.prompt('Rename source', sourceTitle(document));
    if (nextTitle === null) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === sourceTitle(document)) return;
    setError('');
    setLoading('Renaming source…');
    try {
      const { document: updated } = await requestJson(`/api/documents/${encodeURIComponent(document.id)}`, { method: 'PATCH', token, body: { title: trimmed } });
      const nextDocument = updated ?? { ...document, title: trimmed };
      setDocuments((current) => current.map((entry) => entry.id === document.id ? { ...entry, ...nextDocument } : entry));
      if (selectedDocument?.id === document.id) setSelectedDocument((current) => ({ ...current, ...nextDocument }));
    } catch (renameError) {
      setError(safeErrorMessage(renameError, 'document'));
    } finally {
      setLoading('');
    }
  }

  async function handleDeleteDocument(document) {
    if (loading || !document?.id) return;
    const ok = window.confirm(`Delete source “${sourceTitle(document)}”? This removes it from the review workspace.`);
    if (!ok) return;
    setError('');
    setLoading('Deleting source…');
    try {
      await requestJson(`/api/documents/${encodeURIComponent(document.id)}`, { method: 'DELETE', token });
      const remaining = documents.filter((entry) => entry.id !== document.id);
      setDocuments(remaining);
      if (selectedDocument?.id === document.id || route.documentId === document.id) {
        resetReviewState();
        const next = remaining[0] ?? null;
        if (next) {
          navigateToReview(next);
        } else {
          setSelectedDocument(null);
          navigateToIntake();
        }
      }
    } catch (deleteError) {
      setError(safeErrorMessage(deleteError, 'document'));
    } finally {
      setLoading('');
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading('Signing in and loading sources…');
    try {
      const login = await requestJson('/api/auth/login', { method: 'POST', body: { email, password } });
      setAuth(login);
      setPassword('');
      await loadDocuments(login.accessToken);
      if (parseRouteFromHash().view !== 'review') navigate({ view: 'intake', documentId: null });
    } catch (loginError) {
      setAuth(null);
      setError(safeErrorMessage(loginError, 'auth'));
    } finally {
      setLoading('');
    }
  }

  async function handleStartSample() {
    if (loading) return;
    setError('');
    setPdfError('');
    setLoading('Preparing source…');
    try {
      const currentDocuments = documents.length > 0 ? documents : await loadDocuments(token);
      const existingSample = currentDocuments.find((document) => sourceTitle(document).toLowerCase() === SAFE_SAMPLE_TITLE.toLowerCase());
      if (existingSample) {
        await handleOpenDocument(existingSample);
        return;
      }
      const { document } = await requestJson('/api/documents', { method: 'POST', token, body: { title: SAFE_SAMPLE_TITLE, content: SAFE_SAMPLE_CONTENT } });
      setDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id && sourceTitle(entry).toLowerCase() !== SAFE_SAMPLE_TITLE.toLowerCase())]);
      resetReviewState();
      navigateToReview(document);
    } catch (sampleError) {
      setError(safeErrorMessage(sampleError, 'sample'));
    } finally {
      setLoading('');
    }
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setError('');
    setPdfError('');
    setLoading('Creating source…');
    try {
      const { document } = await requestJson('/api/documents', { method: 'POST', token, body: { title: documentTitle, content: documentContent } });
      setDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id)]);
      resetReviewState();
      navigateToReview(document);
    } catch (submitError) {
      setError(safeErrorMessage(submitError, 'document'));
    } finally {
      setLoading('');
    }
  }

  async function handlePdfSubmit(event) {
    event.preventDefault();
    if (loading) return;
    if (!selectedPdf) {
      setPdfError('Choose a PDF or paste text instead.');
      return;
    }
    if (selectedPdf.size > PDF_LIMITS.maxBytes) {
      setPdfError(`This PDF is outside the supported limits (${PDF_LIMITS.maxSizeLabel}). Choose a smaller PDF or paste text instead.`);
      return;
    }
    setError('');
    setPdfError('');
    const pendingTitle = pdfTitle.trim() || safeFilename(selectedPdf.name);
    setPendingSource({ id: `pending-${Date.now()}`, title: pendingTitle, sourceType: 'pdf', status: 'reading_pdf', pending: true, metadata: { safeOriginalBasename: safeFilename(selectedPdf.name), sizeBytes: selectedPdf.size, sourceMethod: 'pdf_upload', uploadedAt: new Date().toISOString() } });
    setPdfStatus('Uploading PDF and reading text…');
    setLoading('Uploading PDF and reading text…');
    try {
      const { document } = await uploadPdfDocument({ token, file: selectedPdf, title: pdfTitle });
      setPdfStatus('Preparing source…');
      setDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id)]);
      resetReviewState();
      setSelectedPdf(null);
      setPdfTitle('');
      setPendingSource(null);
      navigateToReview(document);
    } catch (uploadError) {
      setPdfError(safeErrorMessage(uploadError, 'pdf'));
      setPendingSource(null);
    } finally {
      setLoading('');
      setPdfStatus('');
    }
  }

  async function handleAnalyze() {
    const document = routeDocument;
    if (!document || loading) return;
    setError('');
    setLoading('Building briefing and extracting requirements…');
    try {
      const { analysis: nextAnalysis } = await requestJson(`/api/documents/${encodeURIComponent(document.id)}/analysis`, { method: 'POST', token });
      setAnalysis(nextAnalysis);
      setActiveEvidence(null);
    } catch (analysisError) {
      setError(safeErrorMessage(analysisError, 'analysis'));
    } finally {
      setLoading('');
    }
  }

  async function submitQuestion(currentQuestion) {
    const document = routeDocument;
    if (!document || !currentQuestion || loading) return;
    setError('');
    setLoading('Searching selected source and checking evidence…');
    try {
      const result = await requestJson(`/api/documents/${encodeURIComponent(document.id)}/chat`, { method: 'POST', token, body: { question: currentQuestion } });
      const nextAnswer = result.answer ?? null;
      const nextRetrievedItems = asArray(result.retrievedChunks);
      setAnswerHistory((current) => [...current, { id: `${Date.now()}-${current.length}`, sourceTitle: sourceTitle(document), question: currentQuestion, answer: nextAnswer, retrievedChunks: nextRetrievedItems }]);
      const firstEvidence = evidenceFromAnswer(nextAnswer, nextRetrievedItems).at(0);
      if (firstEvidence) setActiveEvidence(firstEvidence);
      setQuestion('');
    } catch (chatError) {
      setError(safeErrorMessage(chatError, 'chat'));
    } finally {
      setLoading('');
    }
  }

  async function handleChatSubmit(event) {
    event.preventDefault();
    const currentQuestion = question.trim();
    await submitQuestion(currentQuestion);
  }

  async function handleRetryQuestion() {
    const currentQuestion = question.trim();
    await submitQuestion(currentQuestion);
  }

  if (!auth) {
    return <LoginView email={email} password={password} loading={loading} error={error} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={handleLogin} />;
  }

  if (route.view === 'review') {
    return (
      <ReviewWorkspace
        auth={auth}
        route={route}
        documents={documents}
        document={routeDocument}
        analysis={analysis}
        latestAnswer={latestAnswer}
        answerHistory={answerHistory}
        question={question}
        loading={loading}
        error={error}
        activeEvidence={activeEvidence}
        onLogout={handleLogout}
        onNavigateIntake={navigateToIntake}
        onAnalyze={handleAnalyze}
        onQuestionChange={setQuestion}
        onQuestionSubmit={handleChatSubmit}
        onRetryQuestion={handleRetryQuestion}
        onSelectQuestion={setQuestion}
        onSelectEvidence={setActiveEvidence}
        onOpenDocument={handleOpenDocument}
        onRenameDocument={handleRenameDocument}
        onDeleteDocument={handleDeleteDocument}
      />
    );
  }

  return (
    <IntakeView
      auth={auth}
      route={route}
      loading={loading}
      error={error}
      empty={hasNoSources ? 'Create a source with a PDF, pasted text, or the sample.' : ''}
      documents={documents}
      selectedDocument={selectedDocument}
      pendingSource={pendingSource}
      sourceMethod={sourceMethod}
      documentTitle={documentTitle}
      documentContent={documentContent}
      selectedPdf={selectedPdf}
      pdfTitle={pdfTitle}
      pdfStatus={pdfStatus}
      pdfError={pdfError}
      onNavigateIntake={navigateToIntake}
      onNavigateWorkspace={() => selectedDocument ? navigateToReview(selectedDocument) : undefined}
      onLogout={handleLogout}
      onSourceMethodChange={setSourceMethod}
      onStartSample={handleStartSample}
      onPasteSubmit={handleDocumentSubmit}
      onDocumentTitleChange={setDocumentTitle}
      onDocumentContentChange={setDocumentContent}
      onPdfFileChange={(file) => { setSelectedPdf(file); setPdfError(''); }}
      onPdfTitleChange={setPdfTitle}
      onPdfSubmit={handlePdfSubmit}
      onOpenDocument={handleOpenDocument}
      onRenameDocument={handleRenameDocument}
      onDeleteDocument={handleDeleteDocument}
      onPasteTextFallback={() => {
        setPdfError('');
        setSourceMethod('paste');
        setTimeout(() => document.querySelector(`[data-testid="${TEST_IDS.documentContent}"]`)?.focus(), 0);
      }}
    />
  );
}
