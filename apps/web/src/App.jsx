import { useEffect, useMemo, useState } from 'react';

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
    return 'The answer could not be generated. Your source and question were preserved so you can retry.';
  }
  if (raw.includes('network') || status >= 500) {
    return 'The request could not be completed. Your work was preserved; please retry.';
  }
  return sanitizeDisplayText(error?.message, 'The action could not be completed. Your work was preserved; please retry.');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'Unknown size';
  }
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function safeFilename(name) {
  const cleaned = sanitizeDisplayText(name, 'Selected PDF');
  return cleaned.replace(/[\\/]/g, '').slice(0, 90) || 'Selected PDF';
}

function sourceTypeLabel(document) {
  const value = String(document?.sourceType ?? document?.type ?? '').toLowerCase();
  if (value.includes('pdf')) return 'PDF';
  if (value.includes('sample')) return 'Sample';
  if (value.includes('paste')) return 'Pasted text';
  return 'Document';
}

function documentStatusLabel(document) {
  const status = sanitizeDisplayText(document?.status, 'ready').toLowerCase();
  if (status === 'ready') return 'Ready';
  if (status === 'processing' || status === 'preparing') return 'Preparing document';
  if (status === 'reading_pdf' || status === 'reading pdf') return 'Reading PDF';
  if (status === 'failed') return 'Needs recovery';
  return sanitizeDisplayText(status, 'Status unavailable');
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
    const detail = item.text ?? item.description ?? item.summary ?? item.value ?? item.obligation ?? item.risk;
    if (primary) parts.push(sanitizeDisplayText(primary));
    if (detail && detail !== primary) parts.push(sanitizeDisplayText(detail));
    if (parts.length > 0) return parts.join(' — ');
    return Object.entries(item)
      .filter(([key]) => !/id|score|metadata|raw/i.test(key))
      .map(([key, value]) => `${sanitizeDisplayText(key)}: ${sanitizeDisplayText(value)}`)
      .join('; ') || 'Item available';
  }
  return sanitizeDisplayText(item);
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
  const displayState = answer?.displayState ?? metadata.displayState ?? null;
  const citations = asArray(answer?.citations);
  const contextStrategy = metadata.contextStrategy ?? metadata.strategy;
  const hasGrounding = citations.length > 0 && contextStrategy !== 'fallback' && displayState?.kind !== 'insufficient_evidence';

  if (answer?.unsupported || contextStrategy === 'unsupported' || displayState?.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      badge: 'Outside this document',
      title: 'Outside this document',
      lead: 'Ask about obligations, risks, parties, dates, or sections in the selected source.',
      answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'This question is outside this document.'),
      tone: '#fef3c7',
      color: '#92400e',
      testId: TEST_IDS.unsupported,
      trust: 'Outside this document',
    };
  }

  if (!hasGrounding || displayState?.kind === 'insufficient_evidence') {
    const suggestions = asArray(answer?.suggestedRefinements).length > 0
      ? asArray(answer.suggestedRefinements).map((item) => sanitizeDisplayText(item)).join(' ')
      : 'Try a more specific question about obligations, risks, parties, dates, or sections in this source.';
    return {
      kind: 'insufficient',
      badge: 'Not enough evidence',
      title: 'Not enough evidence',
      lead: suggestions,
      answerText: 'I did not find enough cited evidence in this document to answer that confidently.',
      tone: '#fff7ed',
      color: '#9a3412',
      testId: TEST_IDS.chatAnswer,
      trust: 'Not enough evidence',
    };
  }

  return {
    kind: 'grounded',
    badge: 'Based on this document',
    title: `Based on this document · ${citations.length} citation${citations.length === 1 ? '' : 's'}`,
    lead: 'Review the citation next to the claim and the evidence panel for context.',
    answerText: sanitizeDisplayText(answer?.displayText ?? answer?.text, 'Answer unavailable.'),
    tone: '#ecfdf5',
    color: '#047857',
    testId: TEST_IDS.chatAnswer,
    trust: `Based on this document · ${citations.length} citation${citations.length === 1 ? '' : 's'}`,
  };
}

function starterQuestionsFor(document, analysis) {
  const recommended = asArray(analysis?.recommendedQuestions).filter(Boolean).map((item) => sanitizeDisplayText(item));
  if (recommended.length > 0) return recommended.slice(0, 4);
  const type = sourceTypeLabel(document);
  return [
    'What is this document about?',
    'What obligations does it describe?',
    'Which risks should a reviewer escalate?',
    type === 'PDF' ? 'Which sections in this PDF matter most?' : 'Which sections support the key duties?',
  ];
}

function AppStyles() {
  return (
    <style>{`
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

function AppShell({ auth, route, selectedDocument, onNavigateIntake, onNavigateWorkspace, children }) {
  return (
    <main className="screen-shell" style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #eef6ff 0%, #f8fafc 42%, #ffffff 100%)', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <AppStyles />
      <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '1.25rem' }}>
        <header className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBlockEnd: '1.25rem' }}>
          <div>
            <p style={{ margin: 0, color: '#2563eb', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>DocuLens AI</p>
            <h1 style={{ margin: '0.15rem 0', fontSize: 'clamp(1.9rem, 5vw, 3.2rem)', lineHeight: 1 }}>Source-first document review</h1>
          </div>
          {auth ? (
            <nav aria-label="Reviewer flow navigation" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button data-testid={TEST_IDS.navIntake} type="button" onClick={onNavigateIntake} style={route.view === 'intake' ? buttonStyle : mutedButtonStyle}>Sources</button>
              <button data-testid={TEST_IDS.navWorkspace} type="button" onClick={onNavigateWorkspace} disabled={!selectedDocument} aria-current={route.view === 'review' ? 'page' : undefined} style={route.view === 'review' ? buttonStyle : mutedButtonStyle}>Review notebook</button>
              <span style={{ ...chipStyle, background: '#f8fafc', color: '#475569' }}>{sanitizeDisplayText(auth.user?.displayName ?? auth.user?.email, 'Signed-in reviewer')}</span>
            </nav>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}

function StateBanner({ loading, error, empty, kind = 'info', testId }) {
  if (!loading && !error && !empty) return null;
  const background = error ? '#fef2f2' : kind === 'success' ? '#ecfdf5' : '#eff6ff';
  const border = error ? '#fecaca' : kind === 'success' ? '#bbf7d0' : '#bfdbfe';
  const color = error ? '#991b1b' : kind === 'success' ? '#065f46' : '#1e3a8a';
  return (
    <section data-testid={testId} style={{ border: `1px solid ${border}`, background, color, borderRadius: '14px', padding: '0.85rem 1rem', marginBlock: '1rem' }} aria-live="polite">
      {loading ? <p data-testid={TEST_IDS.loading} style={{ margin: 0, fontWeight: 800 }}>{sanitizeDisplayText(loading)}</p> : null}
      {error ? <p data-testid={TEST_IDS.error} role="alert" style={{ margin: 0, fontWeight: 800 }}>{sanitizeDisplayText(error)}</p> : null}
      {empty ? <p data-testid={TEST_IDS.empty} style={{ margin: 0 }}>{sanitizeDisplayText(empty)}</p> : null}
    </section>
  );
}

function LoginView({ email, password, loading, error, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    <AppShell auth={null} route={{ view: 'intake' }} selectedDocument={null} onNavigateIntake={() => {}} onNavigateWorkspace={() => {}}>
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ ...panelStyle, background: '#0f172a', color: '#ffffff' }}>
          <p style={{ ...chipStyle, background: '#1e293b', color: '#bfdbfe' }}>Review notebook</p>
          <h2 style={{ fontSize: '2.1rem', marginBlockEnd: '0.5rem' }}>Start with a source, then ask grounded questions.</h2>
          <p style={{ color: '#dbeafe', fontSize: '1.05rem' }}>Sign in to review a sample, pasted text, or a text-based PDF with citations and evidence available beside each answer.</p>
        </div>
        <form onSubmit={onSubmit} style={panelStyle}>
          <h2>Sign in</h2>
          <p style={{ color: '#475569' }}>Use the seeded demo account to enter the reviewer flow.</p>
          <StateBanner loading={loading} error={error} />
          <label style={fieldStyle}>Email<input data-testid={TEST_IDS.email} type="email" autoComplete="username" value={email} onChange={(event) => onEmailChange(event.target.value)} required style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} /></label>
          <label style={fieldStyle}>Password<input data-testid={TEST_IDS.password} type="password" autoComplete="current-password" value={password} onChange={(event) => onPasswordChange(event.target.value)} required style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} /></label>
          <button data-testid={TEST_IDS.loginSubmit} type="submit" disabled={Boolean(loading)} style={buttonStyle}>Sign in to review</button>
        </form>
      </section>
    </AppShell>
  );
}

function SourceCreate({ loading, onStartSample }) {
  return (
    <section data-testid={TEST_IDS.sourceCreate} style={{ ...panelStyle, background: 'linear-gradient(135deg, #ffffff, #eff6ff)' }} aria-labelledby="create-source-heading">
      <p style={{ ...chipStyle, background: '#dbeafe', color: '#1d4ed8' }}>Create a source</p>
      <h2 id="create-source-heading" style={{ fontSize: '2rem', marginBlock: '0.3rem' }}>Start a review with one active source.</h2>
      <p style={{ color: '#334155' }}>Choose the sample, upload a PDF, or paste text. The review notebook stays scoped to the active source.</p>
      <button data-testid={TEST_IDS.intakeSampleCta} type="button" onClick={onStartSample} disabled={Boolean(loading)} style={buttonStyle}>Try sample NDA</button>
    </section>
  );
}

function PasteIntake({ documentTitle, documentContent, loading, onTitleChange, onContentChange, onSubmit }) {
  return (
    <section data-testid={TEST_IDS.intakePastePanel} style={panelStyle} aria-labelledby="paste-document-heading">
      <p style={{ ...chipStyle, background: '#f0fdf4', color: '#15803d' }}>Paste text</p>
      <h2 id="paste-document-heading">Paste document text</h2>
      <p style={{ color: '#475569' }}>Save text or Markdown as a ready review source.</p>
      <form onSubmit={onSubmit}>
        <label style={fieldStyle}>Title<input data-testid={TEST_IDS.documentTitle} value={documentTitle} onChange={(event) => onTitleChange(event.target.value)} required style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} /></label>
        <label style={fieldStyle}>Text content<textarea data-testid={TEST_IDS.documentContent} value={documentContent} onChange={(event) => onContentChange(event.target.value)} rows={9} required style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1', resize: 'vertical' }} /></label>
        <button data-testid={TEST_IDS.documentSubmit} type="submit" disabled={Boolean(loading)} style={secondaryButtonStyle}>Create source</button>
      </form>
    </section>
  );
}

function PdfRecovery({ fileName, error, onPasteText }) {
  if (!error) return null;
  return (
    <section data-testid={TEST_IDS.pdfRecovery} style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '14px', padding: '0.85rem', marginBlock: '0.75rem' }}>
      <p style={{ fontWeight: 900, marginTop: 0 }}>{fileName ? `${fileName}: ` : ''}{sanitizeDisplayText(error, 'This PDF could not be read.')}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        <label style={{ ...mutedButtonStyle, display: 'inline-flex' }}>Choose another PDF<input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} /></label>
        <button data-testid={TEST_IDS.pasteTextFallback} type="button" onClick={onPasteText} style={secondaryButtonStyle}>Paste text instead</button>
      </div>
    </section>
  );
}

function PdfIntake({ selectedPdf, pdfTitle, pdfStatus, pdfError, loading, onFileChange, onTitleChange, onSubmit, onPasteText }) {
  const overLimit = selectedPdf ? selectedPdf.size > PDF_LIMITS.maxBytes : false;
  return (
    <section data-testid={TEST_IDS.intakePdfPanel} style={panelStyle} aria-labelledby="pdf-document-heading">
      <p style={{ ...chipStyle, background: '#fff7ed', color: '#c2410c' }}>PDF source</p>
      <h2 id="pdf-document-heading">Upload PDF</h2>
      <p style={{ color: '#475569' }}>Text-based PDFs work best. Scanned or protected files may need pasted text.</p>
      <form onSubmit={onSubmit}>
        <label style={fieldStyle}>Optional review title<input value={pdfTitle} onChange={(event) => onTitleChange(event.target.value)} placeholder="e.g. Mutual NDA PDF" style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} /></label>
        <label style={fieldStyle}>PDF file<input data-testid={TEST_IDS.pdfInput} type="file" accept="application/pdf,.pdf" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} style={{ padding: '0.7rem', borderRadius: '10px', border: '1px dashed #94a3b8', background: '#f8fafc' }} /></label>
        {selectedPdf ? (
          <div data-testid={TEST_IDS.pdfSelected} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.75rem', marginBlock: '0.75rem', background: overLimit ? '#fff7ed' : '#f8fafc' }}>
            <strong>{safeFilename(selectedPdf.name)}</strong>
            <p style={{ margin: '0.25rem 0' }}>PDF · {formatBytes(selectedPdf.size)}</p>
            <p style={{ margin: 0 }}>{overLimit ? `This file appears larger than ${PDF_LIMITS.maxSizeLabel}. Choose a smaller PDF or paste text.` : 'Selected. Ready to read as a source.'}</p>
          </div>
        ) : null}
        {pdfStatus ? <StateBanner testId={TEST_IDS.pdfStatus} loading={pdfStatus} /> : null}
        <PdfRecovery fileName={selectedPdf ? safeFilename(selectedPdf.name) : ''} error={pdfError} onPasteText={onPasteText} />
        <button data-testid={TEST_IDS.pdfSubmit} type="submit" disabled={Boolean(loading) || !selectedPdf} style={secondaryButtonStyle}>Read PDF</button>
      </form>
    </section>
  );
}

function SourceRail({ documents, activeDocument, pendingSource, onOpenDocument }) {
  const cards = pendingSource ? [pendingSource, ...documents] : documents;
  if (cards.length === 0) return null;
  return (
    <section data-testid={TEST_IDS.sourceManagement} className="no-print" style={panelStyle} aria-labelledby="sources-heading">
      <h2 id="sources-heading">Sources</h2>
      <div data-testid={TEST_IDS.sourceRail} style={{ display: 'grid', gap: '0.65rem' }}>
        {cards.map((document) => {
          const active = document.id && activeDocument?.id === document.id;
          return (
            <button key={document.id ?? document.title} data-testid={TEST_IDS.sourceCard} type="button" disabled={!document.id || document.pending} onClick={() => document.id ? onOpenDocument(document) : undefined} style={{ ...mutedButtonStyle, textAlign: 'left', borderRadius: '14px', borderColor: active ? '#2563eb' : '#cbd5e1', background: active ? '#eff6ff' : '#f8fafc' }}>
              <strong>{sanitizeDisplayText(document.title, 'Untitled source')}</strong>
              <br />
              <span>{sourceTypeLabel(document)} · {documentStatusLabel(document)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ActiveSourceCard({ document }) {
  return (
    <section data-testid={TEST_IDS.activeSource} style={{ ...panelStyle, background: '#0f172a', color: '#ffffff' }}>
      <p style={{ ...chipStyle, background: '#1e293b', color: '#bfdbfe' }}>Active source</p>
      <h2 style={{ marginBlock: '0.3rem', fontSize: '2rem' }}>{sanitizeDisplayText(document?.title, 'Selected source')}</h2>
      <p><span data-testid={TEST_IDS.sourceStatus} style={{ ...chipStyle, background: '#dcfce7', color: '#166534' }}>{documentStatusLabel(document)}</span><span style={{ ...chipStyle, background: '#e0f2fe', color: '#075985' }}>{sourceTypeLabel(document)}</span></p>
      <p style={{ color: '#cbd5e1' }}>Briefing, questions, answers, citations, and evidence are scoped to this source.</p>
    </section>
  );
}

function EvidencePanel({ document, activeEvidence }) {
  const rawContent = document?.content ?? document?.text ?? '';
  const excerpt = sanitizeDisplayText(rawContent, 'Choose a source to see the first excerpt.');
  const section = activeEvidence?.section ?? 'Source overview';
  const text = activeEvidence?.excerpt ?? excerpt.slice(0, 900);
  return (
    <section data-testid={TEST_IDS.evidencePanel} style={panelStyle} aria-labelledby="evidence-panel-heading">
      <h2 id="evidence-panel-heading">Evidence</h2>
      <p data-testid={TEST_IDS.evidenceSource}><strong>Source:</strong> {sanitizeDisplayText(document?.title, 'Selected source')}</p>
      <p data-testid={TEST_IDS.evidenceSection}><strong>Section:</strong> {sanitizeDisplayText(section, 'Source overview')}</p>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.8rem', background: '#f8fafc' }}>
        <p data-testid={TEST_IDS.evidenceExcerpt} style={{ whiteSpace: 'pre-wrap' }}>{sanitizeDisplayText(text, 'Evidence excerpt unavailable.')}</p>
      </div>
    </section>
  );
}

function AnalysisCard({ title, items, emptyLabel }) {
  const normalizedItems = asArray(items);
  return (
    <article style={{ border: '1px solid #e2e8f0', borderRadius: '14px', padding: '0.85rem', background: '#f8fafc' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {normalizedItems.length === 0 ? <p>{emptyLabel}</p> : <ul style={{ marginBlockEnd: 0 }}>{normalizedItems.map((item, index) => <li key={`${title}-${index}`}>{formatAnalysisItem(item)}</li>)}</ul>}
    </article>
  );
}

function ReviewBriefing({ analysis, loading, onAnalyze }) {
  return (
    <section data-testid={TEST_IDS.reviewBriefing} style={panelStyle} aria-labelledby="briefing-heading">
      <h2 id="briefing-heading">Review briefing</h2>
      {analysis ? (
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          <article style={{ borderLeft: '4px solid #2563eb', paddingLeft: '0.85rem' }}>
            <h3>Summary</h3>
            <p data-testid={TEST_IDS.analysisSummary}>{sanitizeDisplayText(analysis.summary, 'No summary returned for this document.')}</p>
          </article>
          <AnalysisCard title="Entities" items={analysis.entities} emptyLabel="No parties, dates, or named entities were identified." />
          <AnalysisCard title="Obligations" items={analysis.obligations} emptyLabel="No explicit obligations were identified." />
          <AnalysisCard title="Risks" items={analysis.risks} emptyLabel="No risk findings were returned." />
          <AnalysisCard title="Uncertainties" items={analysis.uncertainties} emptyLabel="No material uncertainties were returned." />
          <AnalysisCard title="Recommended questions" items={analysis.recommendedQuestions} emptyLabel="Use the starter questions below to continue." />
        </div>
      ) : (
        <div>
          <p>Generate a concise summary of the active source when you are ready.</p>
          <button data-testid={TEST_IDS.documentAnalyze} type="button" onClick={onAnalyze} disabled={Boolean(loading)} style={secondaryButtonStyle}>Generate review briefing</button>
        </div>
      )}
    </section>
  );
}

function StarterQuestions({ document, analysis, onSelectQuestion }) {
  const questions = starterQuestionsFor(document, analysis);
  return (
    <section data-testid={TEST_IDS.starterQuestions} style={panelStyle} aria-labelledby="starter-heading">
      <h2 id="starter-heading">Starter questions</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        {questions.map((question) => (
          <button key={question} data-testid={TEST_IDS.starterQuestion} type="button" onClick={() => onSelectQuestion(question)} style={mutedButtonStyle}>{question}</button>
        ))}
      </div>
    </section>
  );
}

function ChatSection({ document, analysis, question, loading, answerHistory, onQuestionChange, onSubmit, onSelectQuestion, onSelectEvidence }) {
  return (
    <section style={panelStyle} aria-labelledby="chat-heading">
      <h2 id="chat-heading">Ask about this document</h2>
      <StarterQuestions document={document} analysis={analysis} onSelectQuestion={onSelectQuestion} />
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: '0.65rem', marginBlockStart: '0.85rem' }}>
        <label style={fieldStyle}>Question<input data-testid={TEST_IDS.chatInput} value={question} onChange={(event) => onQuestionChange(event.target.value)} placeholder="What does this document require?" required style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid #cbd5e1' }} /></label>
        <button data-testid={TEST_IDS.chatSubmit} type="submit" disabled={Boolean(loading)} style={secondaryButtonStyle}>Ask about this document</button>
      </form>
      {loading ? <StateBanner loading={loading} /> : null}
      {answerHistory.length === 0 ? <StateBanner empty="Ask a source-specific question to see an answer with citations and evidence." /> : (
        <div style={{ display: 'grid', gap: '0.85rem', marginBlockStart: '1rem' }}>
          {answerHistory.map((entry, index) => <AnswerCard key={entry.id} entry={entry} ordinal={index + 1} onSelectEvidence={onSelectEvidence} />)}
        </div>
      )}
    </section>
  );
}

function AnswerCard({ entry, ordinal, onSelectEvidence }) {
  const presentation = answerPresentation(entry.answer, entry.retrievedChunks);
  const evidence = evidenceFromAnswer(entry.answer, entry.retrievedChunks);
  return (
    <article data-testid={TEST_IDS.answerCard} style={{ border: `1px solid ${presentation.color}`, background: presentation.tone, borderRadius: '16px', padding: '1rem' }}>
      <p style={{ ...chipStyle, background: '#ffffff', color: presentation.color }}>{presentation.badge}</p>
      <h3 style={{ marginBlock: '0.35rem' }}>Q{ordinal}: {sanitizeDisplayText(entry.question, 'Reviewer question')}</h3>
      <p style={{ color: presentation.color, fontWeight: 800 }}>{presentation.title}</p>
      <p>{presentation.lead}</p>
      <p data-testid={presentation.testId} style={{ fontSize: '1.03rem' }}>{presentation.answerText}{presentation.kind === 'grounded' && evidence.length > 0 ? ' ' : ''}{presentation.kind === 'grounded' ? evidence.map((item) => <button key={item.key} data-testid={TEST_IDS.inlineCitation} type="button" onClick={() => onSelectEvidence(item)} style={{ ...mutedButtonStyle, padding: '0.2rem 0.45rem', marginInlineStart: '0.25rem' }} aria-label={`Show evidence ${item.marker}`}>[{item.marker}]</button>) : null}</p>
      <section data-testid={TEST_IDS.chatCitations} aria-label="Citations" style={{ marginBlockStart: '0.75rem' }}>
        <h4>Citations</h4>
        {evidence.length > 0 && presentation.kind === 'grounded' ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>{evidence.map((item) => <button key={`${item.key}-chip`} data-testid={TEST_IDS.evidenceChip} type="button" onClick={() => onSelectEvidence(item)} style={mutedButtonStyle}>{item.marker}. {item.label}</button>)}</div>
        ) : <p>{presentation.kind === 'unsupported' ? 'Ask a question about this source to see citations.' : 'Ask a more specific question to get citation-backed evidence.'}</p>}
      </section>
      <section data-testid={TEST_IDS.chatRetrievedChunks} aria-label="Evidence used" style={{ marginBlockStart: '0.75rem' }}>
        <h4>Evidence used</h4>
        {evidence.length > 0 ? <ul>{evidence.map((item) => <li key={`${item.key}-excerpt`}><strong>{item.label}:</strong> {item.excerpt}</li>)}</ul> : <p>No evidence selected for this answer.</p>}
      </section>
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
        <TrustMetric label="Status" value={summary} />
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
            <dt>Citation diagnostics</dt><dd>{citations.length} citation{citations.length === 1 ? '' : 's'} available; raw identifiers are hidden.</dd>
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
      <h2>{sanitizeDisplayText(document?.title, 'Selected source')}</h2>
      <p>{sanitizeDisplayText(analysis?.summary ?? (document?.content ?? document?.text ?? ''), 'Source summary not generated yet.').slice(0, 900)}</p>
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

function ReviewWorkspace({ auth, route, documents, document, analysis, latestAnswer, answerHistory, question, loading, error, activeEvidence, onNavigateIntake, onAnalyze, onQuestionChange, onQuestionSubmit, onSelectQuestion, onSelectEvidence, onOpenDocument }) {
  if (!document) {
    return (
      <AppShell auth={auth} route={route} selectedDocument={null} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={onNavigateIntake}>
        <StateBanner error="Choose a source to open the review notebook." />
        <button type="button" onClick={onNavigateIntake} style={buttonStyle}>Go to sources</button>
      </AppShell>
    );
  }

  const latestMetadata = latestAnswer?.metadata ?? analysis?.metadata ?? null;
  const chatLoading = loading === 'Searching this document' || loading === 'Looking for evidence' ? loading : '';
  const pageLoading = chatLoading ? '' : loading;
  return (
    <AppShell auth={auth} route={route} selectedDocument={document} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={() => {}}>
      <section data-testid={TEST_IDS.workspaceRoot} className="review-workspace" style={{ display: 'grid', gap: '1rem' }}>
        <PrintReviewOutput document={document} analysis={analysis} answerHistory={answerHistory} activeEvidence={activeEvidence} latestAnswer={latestAnswer} />
        <ActiveSourceCard document={document} />
        <StateBanner loading={pageLoading} error={error} />
        <section data-testid={TEST_IDS.analysisPanel} style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 0.75fr) minmax(320px, 1.25fr)', gap: '1rem', alignItems: 'start' }} aria-label={`Review notebook for ${sanitizeDisplayText(document.title, 'selected source')}`}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <SourceRail documents={documents} activeDocument={document} onOpenDocument={onOpenDocument} />
            <EvidencePanel document={document} activeEvidence={activeEvidence} />
            <TrustLayer metadata={latestMetadata} answer={latestAnswer} />
          </div>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <ReviewBriefing analysis={analysis} loading={loading} onAnalyze={onAnalyze} />
            <ChatSection document={document} analysis={analysis} question={question} loading={chatLoading} answerHistory={answerHistory} onQuestionChange={onQuestionChange} onSubmit={onQuestionSubmit} onSelectQuestion={onSelectQuestion} onSelectEvidence={onSelectEvidence} />
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function IntakeView({ auth, route, loading, error, empty, documents, selectedDocument, pendingSource, documentTitle, documentContent, selectedPdf, pdfTitle, pdfStatus, pdfError, onNavigateIntake, onNavigateWorkspace, onStartSample, onPasteSubmit, onDocumentTitleChange, onDocumentContentChange, onPdfFileChange, onPdfTitleChange, onPdfSubmit, onOpenDocument, onPasteTextFallback }) {
  return (
    <AppShell auth={auth} route={route} selectedDocument={selectedDocument} onNavigateIntake={onNavigateIntake} onNavigateWorkspace={onNavigateWorkspace}>
      <StateBanner loading={loading} error={error} empty={empty} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(290px, 0.85fr) minmax(320px, 1.15fr)', gap: '1rem', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <SourceCreate loading={loading} onStartSample={onStartSample} />
          <SourceRail documents={documents} activeDocument={selectedDocument} pendingSource={pendingSource} onOpenDocument={onOpenDocument} />
        </div>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <PdfIntake selectedPdf={selectedPdf} pdfTitle={pdfTitle} pdfStatus={pdfStatus} pdfError={pdfError} loading={loading} onFileChange={onPdfFileChange} onTitleChange={onPdfTitleChange} onSubmit={onPdfSubmit} onPasteText={onPasteTextFallback} />
          <PasteIntake documentTitle={documentTitle} documentContent={documentContent} loading={loading} onTitleChange={onDocumentTitleChange} onContentChange={onDocumentContentChange} onSubmit={onPasteSubmit} />
        </div>
      </div>
    </AppShell>
  );
}

export function App() {
  const [auth, setAuth] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        const { document } = await requestJson(`/api/documents/${encodeURIComponent(route.documentId)}`, { token });
        if (cancelled) return;
        setDocuments((existing) => [document, ...existing.filter((entry) => entry.id !== document.id)]);
        setSelectedDocument(document);
      } catch (detailError) {
        if (!cancelled) setError(safeErrorMessage(detailError, 'document'));
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

  async function loadDocuments(nextToken) {
    const { documents: loadedDocuments = [] } = await requestJson('/api/documents', { token: nextToken });
    setDocuments(loadedDocuments);
    return loadedDocuments;
  }

  async function ensureDocumentDetail(document) {
    if (!document?.id) return document;
    if (hasFullSourceContent(document)) return document;
    setLoading('Preparing document');
    const { document: detailed } = await requestJson(`/api/documents/${encodeURIComponent(document.id)}`, { token });
    setDocuments((current) => [detailed, ...current.filter((entry) => entry.id !== detailed.id)]);
    return detailed;
  }

  async function handleOpenDocument(document) {
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

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading('Signing in and preparing sources.');
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
    setError('');
    setPdfError('');
    setLoading('Preparing document');
    try {
      const currentDocuments = documents.length > 0 ? documents : await loadDocuments(token);
      const existingSample = currentDocuments.find((document) => sanitizeDisplayText(document.title).toLowerCase() === SAFE_SAMPLE_TITLE.toLowerCase());
      if (existingSample) {
        await handleOpenDocument(existingSample);
        return;
      }
      const { document } = await requestJson('/api/documents', { method: 'POST', token, body: { title: SAFE_SAMPLE_TITLE, content: SAFE_SAMPLE_CONTENT } });
      setDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id && sanitizeDisplayText(entry.title).toLowerCase() !== SAFE_SAMPLE_TITLE.toLowerCase())]);
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
    setError('');
    setPdfError('');
    setLoading('Preparing document');
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
    if (!selectedPdf) {
      setPdfError('Choose a PDF or paste text instead.');
      return;
    }
    setError('');
    setPdfError('');
    const pendingTitle = pdfTitle.trim() || safeFilename(selectedPdf.name);
    setPendingSource({ id: `pending-${Date.now()}`, title: pendingTitle, sourceType: 'pdf', status: 'reading_pdf', pending: true });
    setPdfStatus('Reading PDF');
    setLoading('Reading PDF');
    try {
      const { document } = await uploadPdfDocument({ token, file: selectedPdf, title: pdfTitle });
      setPdfStatus('');
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
    if (!document) return;
    setError('');
    setLoading('Generating summary');
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

  async function handleChatSubmit(event) {
    event.preventDefault();
    const document = routeDocument;
    const currentQuestion = question.trim();
    if (!document || !currentQuestion) return;
    setError('');
    setLoading('Searching this document');
    try {
      const result = await requestJson(`/api/documents/${encodeURIComponent(document.id)}/chat`, { method: 'POST', token, body: { question: currentQuestion } });
      const nextAnswer = result.answer ?? null;
      const nextRetrievedItems = asArray(result.retrievedChunks);
      setAnswerHistory((current) => [...current, { id: `${Date.now()}-${current.length}`, question: currentQuestion, answer: nextAnswer, retrievedChunks: nextRetrievedItems }]);
      const firstEvidence = evidenceFromAnswer(nextAnswer, nextRetrievedItems).at(0);
      if (firstEvidence) setActiveEvidence(firstEvidence);
      setQuestion('');
    } catch (chatError) {
      setError(safeErrorMessage(chatError, 'chat'));
    } finally {
      setLoading('');
    }
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
        onNavigateIntake={navigateToIntake}
        onAnalyze={handleAnalyze}
        onQuestionChange={setQuestion}
        onQuestionSubmit={handleChatSubmit}
        onSelectQuestion={setQuestion}
        onSelectEvidence={setActiveEvidence}
        onOpenDocument={handleOpenDocument}
      />
    );
  }

  return (
    <IntakeView
      auth={auth}
      route={route}
      loading={loading}
      error={error}
      empty={hasNoSources ? 'Create a source with the sample, a PDF, or pasted text.' : ''}
      documents={documents}
      selectedDocument={selectedDocument}
      pendingSource={pendingSource}
      documentTitle={documentTitle}
      documentContent={documentContent}
      selectedPdf={selectedPdf}
      pdfTitle={pdfTitle}
      pdfStatus={pdfStatus}
      pdfError={pdfError}
      onNavigateIntake={navigateToIntake}
      onNavigateWorkspace={() => selectedDocument ? navigateToReview(selectedDocument) : undefined}
      onStartSample={handleStartSample}
      onPasteSubmit={handleDocumentSubmit}
      onDocumentTitleChange={setDocumentTitle}
      onDocumentContentChange={setDocumentContent}
      onPdfFileChange={(file) => { setSelectedPdf(file); setPdfError(''); }}
      onPdfTitleChange={setPdfTitle}
      onPdfSubmit={handlePdfSubmit}
      onOpenDocument={handleOpenDocument}
      onPasteTextFallback={() => {
        setPdfError('');
        setTimeout(() => document.querySelector(`[data-testid="${TEST_IDS.documentContent}"]`)?.focus(), 0);
      }}
    />
  );
}
