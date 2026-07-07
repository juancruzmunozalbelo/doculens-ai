import { useMemo, useState } from 'react';

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

const panelStyle = {
  border: '1px solid #d8dee9',
  borderRadius: '12px',
  padding: '1rem',
  marginBlock: '1rem',
  background: '#ffffff',
};

const fieldStyle = {
  display: 'grid',
  gap: '0.35rem',
  marginBlockEnd: '0.85rem',
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
    throw new Error(message);
  }
  return payload;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function displayValue(value) {
  if (value === null || value === undefined) {
    return 'Not provided';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return Object.entries(value)
    .map(([key, nestedValue]) => `${key}: ${displayValue(nestedValue)}`)
    .join('; ');
}

function JsonList({ items, emptyLabel }) {
  const normalizedItems = asArray(items);
  if (normalizedItems.length === 0) {
    return <p>{emptyLabel}</p>;
  }
  return (
    <ul>
      {normalizedItems.map((item, index) => (
        <li key={`${displayValue(item)}-${index}`}>{displayValue(item)}</li>
      ))}
    </ul>
  );
}

function MetadataPanel({ metadata }) {
  if (!metadata) {
    return (
      <section data-testid={TEST_IDS.aiMetadata} style={panelStyle} aria-label="AI transparency metadata">
        <h2>AI transparency</h2>
        <p>No AI metadata yet.</p>
      </section>
    );
  }

  return (
    <section data-testid={TEST_IDS.aiMetadata} style={panelStyle} aria-label="AI transparency metadata">
      <h2>AI transparency</h2>
      <dl>
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{displayValue(value)}</dd>
          </div>
        ))}
      </dl>
      <pre aria-label="raw AI metadata">{JSON.stringify(metadata, null, 2)}</pre>
    </section>
  );
}

function StateMessage({ loading, error, empty }) {
  return (
    <>
      {loading ? <p data-testid={TEST_IDS.loading}>Loading, please wait.</p> : null}
      {error ? (
        <p data-testid={TEST_IDS.error} role="alert">
          {error}
        </p>
      ) : null}
      {empty ? <p data-testid={TEST_IDS.empty}>{empty}</p> : null}
    </>
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
  const [answer, setAnswer] = useState(null);
  const [retrievedChunks, setRetrievedChunks] = useState([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const token = auth?.accessToken;
  const latestMetadata = answer?.metadata ?? analysis?.metadata ?? null;
  const hasNoDocuments = Boolean(auth) && !loading && documents.length === 0 && !selectedDocument;

  async function loadDocuments(nextToken) {
    const { documents: loadedDocuments = [] } = await requestJson('/api/documents', { token: nextToken });
    setDocuments(loadedDocuments);
    setSelectedDocument((current) => current ?? loadedDocuments[0] ?? null);
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setLoading('Signing in, please wait.');
    try {
      const login = await requestJson('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setAuth(login);
      setPassword('');
      await loadDocuments(login.accessToken);
    } catch (loginError) {
      setAuth(null);
      setError(loginError.message);
    } finally {
      setLoading('');
    }
  }

  async function handleDocumentSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading('Submitting document, please wait.');
    try {
      const { document } = await requestJson('/api/documents', {
        method: 'POST',
        token,
        body: { title: documentTitle, content: documentContent },
      });
      setDocuments((current) => [document, ...current.filter((entry) => entry.id !== document.id)]);
      setSelectedDocument(document);
      setAnalysis(null);
      setAnswer(null);
      setRetrievedChunks([]);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading('');
    }
  }

  async function handleAnalyze() {
    if (!selectedDocument) {
      return;
    }
    setError('');
    setLoading('Analyzing document, please wait.');
    try {
      const { analysis: nextAnalysis } = await requestJson(`/api/documents/${encodeURIComponent(selectedDocument.id)}/analysis`, {
        method: 'POST',
        token,
      });
      setAnalysis(nextAnalysis);
      setAnswer(null);
      setRetrievedChunks([]);
    } catch (analysisError) {
      setError(analysisError.message);
    } finally {
      setLoading('');
    }
  }

  async function handleChatSubmit(event) {
    event.preventDefault();
    if (!selectedDocument || !question.trim()) {
      return;
    }
    setError('');
    setLoading('Asking DocuLens AI, please wait.');
    try {
      const result = await requestJson(`/api/documents/${encodeURIComponent(selectedDocument.id)}/chat`, {
        method: 'POST',
        token,
        body: { question },
      });
      setAnswer(result.answer ?? null);
      setRetrievedChunks(asArray(result.retrievedChunks));
    } catch (chatError) {
      setError(chatError.message);
    } finally {
      setLoading('');
    }
  }

  const selectedDocumentTitle = selectedDocument?.title ?? 'Selected document';
  const answerCitations = useMemo(() => asArray(answer?.citations), [answer]);

  if (!auth) {
    return (
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1>DocuLens AI</h1>
        <p>Sign in to review documents with grounded analysis, citations, and AI transparency metadata.</p>
        <StateMessage loading={loading} error={error} />
        <form onSubmit={handleLogin} style={panelStyle}>
          <label style={fieldStyle}>
            Email
            <input
              data-testid={TEST_IDS.email}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label style={fieldStyle}>
            Password
            <input
              data-testid={TEST_IDS.password}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button data-testid={TEST_IDS.loginSubmit} type="submit" disabled={Boolean(loading)}>
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header>
        <h1>DocuLens AI</h1>
        <p>Signed in as {auth.user?.displayName ?? auth.user?.email ?? 'reviewer'}.</p>
      </header>

      <StateMessage
        loading={loading}
        error={error}
        empty={hasNoDocuments ? 'No documents yet. Add a document to begin the review flow.' : ''}
      />

      <section style={panelStyle} aria-labelledby="document-input-heading">
        <h2 id="document-input-heading">Document input</h2>
        <form onSubmit={handleDocumentSubmit}>
          <label style={fieldStyle}>
            Title
            <input
              data-testid={TEST_IDS.documentTitle}
              value={documentTitle}
              onChange={(event) => setDocumentTitle(event.target.value)}
              required
            />
          </label>
          <label style={fieldStyle}>
            Markdown or text content
            <textarea
              data-testid={TEST_IDS.documentContent}
              value={documentContent}
              onChange={(event) => setDocumentContent(event.target.value)}
              rows={8}
              required
            />
          </label>
          <button data-testid={TEST_IDS.documentSubmit} type="submit" disabled={Boolean(loading)}>
            Submit document
          </button>
        </form>
      </section>

      {selectedDocument ? (
        <section data-testid={TEST_IDS.analysisPanel} style={panelStyle} aria-labelledby="analysis-heading">
          <h2 id="analysis-heading">Analysis and chat for {selectedDocumentTitle}</h2>
          <button data-testid={TEST_IDS.documentAnalyze} type="button" onClick={handleAnalyze} disabled={Boolean(loading)}>
            Analyze document
          </button>

          {analysis ? (
            <article>
              <h3>Summary</h3>
              <p data-testid={TEST_IDS.analysisSummary}>{analysis.summary}</p>

              <h3>Entities</h3>
              <JsonList items={analysis.entities} emptyLabel="No entities returned." />

              <h3>Obligations</h3>
              <JsonList items={analysis.obligations} emptyLabel="No obligations returned." />

              <h3>Risks</h3>
              <JsonList items={analysis.risks} emptyLabel="No risks returned." />

              <h3>Uncertainties</h3>
              <JsonList items={analysis.uncertainties} emptyLabel="No uncertainties returned." />
            </article>
          ) : (
            <p>Run analysis to see summary, entities, obligations, risks, and uncertainties.</p>
          )}

          <form onSubmit={handleChatSubmit} style={{ ...panelStyle, background: '#f8fafc' }}>
            <h3>Ask a document question</h3>
            <label style={fieldStyle}>
              Question
              <input
                data-testid={TEST_IDS.chatInput}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="What does this document require?"
                required
              />
            </label>
            <button data-testid={TEST_IDS.chatSubmit} type="submit" disabled={Boolean(loading)}>
              Ask
            </button>
          </form>

          {answer ? (
            <section aria-label="Chat answer">
              {answer.unsupported ? (
                <p data-testid={TEST_IDS.unsupported}>{answer.text}</p>
              ) : (
                <p data-testid={TEST_IDS.chatAnswer}>
                  {answer.text}
                  {answer.uncertainty ? ` Uncertainty: ${answer.uncertainty}.` : ''}
                </p>
              )}

              <section data-testid={TEST_IDS.chatCitations} aria-label="Citations">
                <h3>Citations</h3>
                <JsonList items={answerCitations} emptyLabel="No citations returned for this answer." />
              </section>

              <section data-testid={TEST_IDS.chatRetrievedChunks} aria-label="Retrieved chunks">
                <h3>Retrieved chunks</h3>
                <JsonList items={retrievedChunks} emptyLabel="No retrieved chunks returned." />
              </section>
            </section>
          ) : null}
        </section>
      ) : null}

      <MetadataPanel metadata={latestMetadata} />
    </main>
  );
}
