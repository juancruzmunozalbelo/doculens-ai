## Why

The current DocuLens AI reviewer flow looks like a raw engineering harness instead of a polished AI product demo: the primary page exposes unformatted prompts, raw model reasoning, raw metadata JSON, weak empty states, no clear value narrative, and only accepts pasted text even though the assessment allows users to submit text or documents. This change is needed now because the assessment explicitly evaluates AI-aware UX, end-to-end coherence, document handling, usability, trade-off communication, and reviewer confidence, not just backend functionality.

## What Changes

- Reframe the app around a guided reviewer journey: sign in, start from a credible sample, pasted text, or uploaded PDF, run analysis, inspect structured findings, ask/refine questions, and understand uncertainty.
- Replace the single rough form-first layout with a polished product shell, clear value proposition, step progress, primary/secondary actions, reviewer-friendly sample content, and first-class document upload affordances.
- Add bounded text-based PDF upload ingestion to the intake flow so the demo supports actual document submission, converts PDFs into normalized Markdown/text, shows conversion status/errors before analysis, and clearly states that scanned/image-only OCR is out of scope.
- Present analysis as scannable product output: summary, obligations, risks, entities, uncertainties, and recommended next questions with clear empty/loading/error states.
- Present chat answers as safe grounded answer cards with citations, uncertainty, and retrieved evidence instead of raw model text dumps.
- Move AI transparency from the primary path into a concise diagnostics panel that highlights provider, prompt version, retrieval mode, fallback reason, token usage, and cost/rate-limit signals without dumping raw JSON by default.
- Add refine/re-ask affordances so the reviewer can continue the AI interaction without manually discovering the right prompt.
- Prevent exposed chain-of-thought or unsafe model internals from appearing in the UI; keep raw diagnostics available only as intentionally expanded technical details when useful for the assessment.
- Keep PDF support honest and demo-bounded: small text-based PDFs only, explicit file/page/time limits, packaged converter runtime, safe fallback to pasted text, and no fixture-only conversion masquerading as general upload support.
- Preserve existing API contracts and canonical test IDs where possible; add or update E2E coverage for the improved reviewer journey.

## Capabilities

### New Capabilities
- `guided-reviewer-demo`: Covers the polished reviewer-facing product journey, including onboarding/value proposition, document input/sample start, step progress, two-page or clearly staged input/results flow, loading/error/empty states, and refine/re-ask actions.
- `ai-evidence-presentation`: Covers how AI outputs are displayed safely and persuasively, including structured analysis cards, grounded chat answer cards, citations, uncertainty, retrieved evidence summaries, fallback/unsupported states, and collapsible AI diagnostics.
- `pdf-document-ingestion`: Covers authenticated PDF upload from the reviewer intake flow, safe conversion to normalized text/Markdown, file validation, conversion status/error handling, persistence through the existing document/chunk pipeline, and analysis/chat readiness after conversion.

### Modified Capabilities
- None. No existing OpenSpec specs are present in `openspec/specs/`; this change introduces new capability contracts.

## Impact

- Frontend: `apps/web/src/App.jsx` and related styling/components will change from inline rough panels to a guided, branded reviewer experience with paste, sample, and PDF upload intake paths while retaining assessment-oriented testability.
- Tests: `tests/e2e/doculens-ui.spec.mjs` and ingestion/API coverage will be updated to validate the polished flow, PDF upload/conversion states, AI status states, citations/uncertainty, safe answer rendering, fallback/unsupported behavior, and no credential or chain-of-thought leakage.
- Backend/API: add a non-breaking authenticated PDF upload/conversion path that feeds the existing normalization/chunking/persistence pipeline; package a real MarkItDown-compatible converter runtime for demo environments; keep fixture fallback smoke-only; add mandatory backend response normalization so unsafe reasoning text is not returned or persisted.
- Documentation/README: demo instructions and assessment trade-offs may be updated after the working flow is verified.
