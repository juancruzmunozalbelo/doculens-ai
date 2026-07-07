## Context

DocuLens AI already has the technical spine the assessment asks for: JWT auth, owner-scoped document APIs, PostgreSQL persistence, section-aware chunking, retrieval metadata, MiniMax provider abstraction, prompt registry/versioning, citation validation, unsupported-answer behavior, evals, Docker, and AWS deployment notes. The current reviewer-facing flow does not sell those strengths. The exported UI shows one rough page with browser-default controls, accidental operational sample text, a raw `<think>` model trace, missing citations, raw retrieved chunks, and a multi-page AI metadata dump. The intake also only accepts pasted text; the repo has a MarkItDown PDF smoke path, but the reviewer cannot upload a PDF through the product.

The assessment frontend requirements are explicit: React, at least two pages, a form, user-friendly AI responses, loading/error/empty states, model status, refine/re-ask, and graceful uncertainty handling. The current `App.jsx` renders login, document input, analysis, chat, citations, retrieved chunks, and metadata in one authenticated `main`, and `MetadataPanel` renders every metadata key plus raw JSON in the primary path.

Stakeholders:
- Assessment reviewer: needs to understand value and engineering judgment in the first minute.
- Demo user: needs a safe, guided path from document input to grounded analysis and follow-up.
- Maintainer: needs a small, testable React implementation that does not overbuild routing or add unnecessary dependencies.

## Goals / Non-Goals

**Goals:**
- Make the demo feel like a polished AI document-review product, not an internal debug harness.
- Satisfy the assessment's two-page/input-results UX requirement with a clear Start/Intake and Review Workspace flow.
- Provide a safe golden path using the existing seeded NDA/prompt-injection document instead of accidental operational text.
- Support real document submission through PDF upload, conversion, validation, and persistence into the existing ingestion/chunking pipeline.
- Render analysis, chat answers, citations, uncertainty, fallback/unsupported states, and AI status in user-facing language.
- Hide raw chain-of-thought, raw provider payloads, provider response IDs, raw metadata JSON, and low-level chunk internals from the default reviewer path.
- Preserve engineering transparency through a compact trust bar and expandable details panel.
- Preserve existing API contracts and canonical Playwright test IDs where practical.

**Non-Goals:**
- No new LLM provider, vector database, streaming transport, or backend architecture rewrite.
- No broad object-storage architecture, background processing queue, or scanned-document OCR pipeline for this change.
- No complex design system or third-party UI framework.
- No guarantee of high-fidelity PDF layout extraction beyond text/Markdown conversion suitable for analysis and citations.
- No full conversation persistence migration unless the current API already supports it; UI may maintain session-local Q&A history for the demo.
- No claim that fallback/full-document answers are RAG-grounded when citations are unavailable.
- No real secrets, AWS credentials, or operational cleanup notes in demo sample content.

## Decisions

### Decision 1: Use lightweight route-equivalent views before adding a router dependency

Implement at least two distinct views: `Start`/`Intake` and `Review Workspace`. Prefer simple React state plus URL hash/history helpers if that satisfies deep-link and test requirements without adding `react-router`. Add a router only if implementation needs durable `/documents/new` and `/documents/:id/review` paths.

Rationale: the repo currently has no routing dependency. A lightweight view state minimizes scope and avoids dependency churn while still meeting the assessment requirement for an input/results journey.

Alternative considered: add `react-router` immediately. Rejected unless deep-linking cannot be achieved simply; it adds dependency surface for a small demo flow.

### Decision 2: Make the seeded NDA the default golden path

Surface a primary `Try sample NDA` CTA that selects the existing safe seeded document (`Seed NDA Contract`) by stable seeded ID/title when present, de-dupes by title/content hash in UI state when it must create a sample, and routes to the Review Workspace. Keep `Paste your own document` and `Upload PDF` as secondary paths.

Rationale: the current exported sample includes AWS cleanup language and a credential request, which creates poor security optics. The seeded NDA already contains obligations plus an adversarial prompt-injection section, so it demonstrates both happy-path review and safety behavior.

Alternative considered: keep arbitrary pasted text as the first path. Rejected because it makes reviewer outcomes depend on ad hoc input and can accidentally showcase internal operational notes.

### Decision 3: Add bounded text-based PDF upload as a non-breaking ingestion path

Add an authenticated `POST /api/documents/uploads/pdf` route using `multipart/form-data` with fields `file` (required, one PDF) and `title` (optional). Authenticate before parsing/conversion work. Enforce defaults of max 5 MiB upload, max 20 pages when page count is detectable, max 15 seconds conversion wall clock, and max 120,000 extracted characters before normalization. Parse multipart with an explicit streaming parser/dependency, reject over-limit bodies during read, write temporary files under the OS temp directory outside the repo, and delete temp files in `finally`.

Use a real MarkItDown-compatible converter runtime packaged for local/Docker/demo execution. The existing deterministic fixture fallback is smoke-only and MUST NOT be used for arbitrary user uploads. If the converter is missing, times out, returns no usable text, or rejects the file, return a safe conversion failure and offer paste-text fallback. Keep the existing JSON `POST /api/documents` text endpoint unchanged.

Success response: `201 { document }` using the same document shape as the existing document create flow. Safe failures: `400` missing file/title validation, `401` unauthenticated, `413` over size/page/text limits, `415` unsupported or mismatched file type, `422` encrypted/scanned/no-text/malformed PDF, `503` converter unavailable. Responses MUST NOT include raw converter stdout/stderr, local paths, stack traces, raw document excerpts, or dependency internals.

Rationale: the assessment allows submitting text or documents, and a document assistant that cannot upload PDFs looks incomplete. This bounded contract supports text-based PDFs honestly without pretending to solve scanned-document OCR or production-scale async conversion.

Alternative considered: keep PDF conversion as a README/script-only smoke. Rejected because the reviewer experience remains text-only and undersells the document assistant use case.

Alternative considered: add S3/Lambda asynchronous PDF processing now. Rejected for this demo scope; local request-bounded conversion is enough with hard limits, timeout, cleanup, and safe errors.

### Decision 4: Treat AI output as structured product data, not raw text

Return and render answers through a normalization boundary before display or persistence. The backend response contract for analysis/chat must expose only safe final answer text, state kind (`grounded`, `fallback`, `unsupported`, or `error`), citations, uncertainty, evidence excerpts, and diagnostics summary. Raw provider payloads, chain-of-thought markers, hidden policy/system/developer references, and raw JSON fences MUST NOT be returned or persisted by default. The UI sanitization remains defense in depth.

Rationale: the current UI renders `answer.text` verbatim, which exposed `<think>` content. This is the highest-risk reviewer failure.

Alternative considered: hide only `<think>` in the UI. Rejected as too narrow; the safer contract is that displayed answers are structured and sanitized before rendering.

### Decision 5: Gate normal grounded answers on citation quality

Use a single grounding gate for every answer presentation: a normal grounded answer requires non-empty citations and at least one passing retrieved chunk above the configured relevance threshold. Metadata indicating low retrieval coverage, zero passing chunks, empty citations, fallback full-document mode, or unsupported scope must render fallback/insufficient-evidence/unsupported state with no confident answer styling.

Rationale: the demo currently claims grounded answers while showing no citations and zero-score fallback metadata. A refusal or downgrade is a stronger AI engineering signal than a plausible but unsupported answer.

Alternative considered: always show the provider answer with a small warning. Rejected because it still markets weak grounding as success.

### Decision 6: Move transparency into a trust layer plus progressive disclosure

Replace the primary raw metadata dump with:
- a compact trust bar: model/provider, prompt ID/version, retrieval mode, citation count/coverage, uncertainty, fallback/unsupported status, and token usage when available;
- an expandable `AI details` panel for reviewer-facing technical depth;
- an optional developer-only raw JSON disclosure if needed locally.

Rationale: the assessment values transparency, but raw metadata currently overwhelms the product and leaks low-level identifiers.

Alternative considered: remove metadata entirely. Rejected because prompt versioning, provider abstraction, retrieval status, and token usage are assessment signals.

### Decision 7: Use staged AI status copy instead of fake streaming

Show operation-specific status messages such as `Saving and chunking document`, `Retrieving evidence`, `Calling MiniMax M3`, and `Validating citations`. Do not imply token streaming unless backend streaming is implemented.

Rationale: current handlers set specific loading messages but `StateMessage` collapses them to `Loading, please wait.` Staged status satisfies AI-aware UX without a streaming backend.

Alternative considered: implement token streaming now. Rejected as optional bonus scope and not required to fix the user flow.

### Decision 8: Keep UI refactor local but make backend AI display normalization mandatory

Start by refactoring `apps/web/src/App.jsx` into small local components/helpers: shell, start/intake view, review workspace, analysis cards, answer cards, trust bar, details panel, state banners, and answer normalization. Also add backend post-processing in `apps/api/src/server/chat/` for returned/persisted analysis and chat display fields so unsafe provider output never reaches storage-backed history, API clients, or the reviewer UI.

Rationale: the visible problem is frontend presentation, but chain-of-thought leakage may require source-level post-processing for defense in depth.

Alternative considered: rewrite backend chat contracts first. Rejected unless necessary; preserve current API contract to reduce risk.

## Minimum Demo-Ready Cut

- Reviewer can complete the golden path with safe sample NDA, paste-text intake, and bounded text-based PDF upload.
- PDF upload clearly states: text-based PDFs only, no scanned-document OCR, max 5 MiB, max 20 pages, 15 second conversion timeout, paste-text fallback on failure.
- Backend returns/persists sanitized answer fields only; UI also hides unsafe provider artifacts.
- Answers are citation-gated, and weak retrieval shows `Insufficient document evidence`, `Using full-document fallback`, or `No citation-quality chunks matched` with refine/retry/inspect actions.
- Trust bar replaces raw metadata by default, with expandable reviewer-readable details.
- Focused API/E2E tests cover the sample path, PDF success/failure, no chain-of-thought leakage, and fallback/citation behavior.

## Risks / Trade-offs

- Raw metadata hidden by default could look like reduced transparency → keep a concise trust bar and expandable technical details that show the assessment-relevant facts without raw debug dumps.
- Citation-gating can make fallback answers look less capable → use a strong seeded happy path with citations and explicitly frame fallback/unsupported as safety behavior.
- Sensitive-content detection can false-positive → warn/redact high-risk strings in demo UI; avoid hard-blocking benign document review unless high-confidence secrets are detected.
- PDF conversion can be slow, unavailable, malicious, or lossy → enforce max 5 MiB, max 20 pages, max 15 second conversion timeout, max extracted text length, converter process kill/cleanup, safe 413/415/422/503 failures, and paste-text fallback.
- Adding route-equivalent views without a router may only partially satisfy the reviewer expectation for `2 pages` → make the view boundary visible in navigation/tests, and add a lightweight router only if hash/history views are not credible.
- Sanitizing answer text only in the UI can leave unsafe text in persisted chat history → backend normalization is mandatory for returned/persisted analysis and chat display fields; UI sanitization is defense in depth.
- Polished UI can accidentally overclaim backend quality → trust labels must truthfully distinguish RAG, fallback full-document, lexical fallback, unsupported, and low-coverage states.

## Migration Plan

1. Add focused tests first for the golden reviewer path, PDF upload success/failure, multipart limits, converter-unavailable behavior, no chain-of-thought leakage at the API and UI layers, no raw metadata in the default path, low-citation fallback handling, two-view navigation, staged AI status, and refine/re-ask history.
2. Add the non-breaking authenticated `POST /api/documents/uploads/pdf` route with streaming multipart parsing, auth-before-work, hard limits, temp-file cleanup, MarkItDown runtime invocation, safe conversion errors, and routing of converted text through existing normalization, chunking, persistence, and document ownership checks.
3. Refactor the current single authenticated view into Start/Intake and Review Workspace components while preserving API calls and stable test IDs.
4. Add sample NDA CTA using deterministic seeded document lookup/de-dupe behavior without introducing real secrets.
5. Replace raw answer, citation, retrieved chunk, and metadata rendering with sanitized cards, citation chips, uncertainty badges, fallback/unsupported callouts, and an expandable trust/details panel.
6. Add mandatory backend post-processing for returned/persisted analysis and chat display fields so unsafe reasoning or provider internals are not observable through API responses, storage-backed history, or future clients.
7. Update README/demo instructions after tests pass, documenting PDF upload limits, text-based-only/no-OCR behavior, converter runtime requirements, the reviewer script, and the AI safety/trust trade-offs.
8. Rollback is straightforward: keep the existing text JSON document endpoint, disable/hide the upload control, and revert the upload route/conversion code; no schema migration or API-breaking change is planned.

## Open Questions

- Should the implementation use hash/history route-equivalent views or add `react-router` for explicit `/documents/new` and `/documents/:id/review` URLs?
- Should raw developer metadata be available in production demo behind a disclosure, or only in local development mode?
- Is sensitive-content handling limited to UI warnings/redaction for demo text, or should the backend classify/redact credential-like content before analysis storage?
- Does deterministic sample selection need a small helper endpoint, or is seeded ID/title lookup plus UI de-dupe enough for the reviewer flow?
