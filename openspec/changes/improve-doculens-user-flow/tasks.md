## 1. Test Contracts

- [x] 1.1 Update `tests/e2e/doculens-ui.spec.mjs` fixtures to cover the new reviewer golden path: authenticated start, sample document CTA, PDF upload path, review workspace, run analysis, ask follow-up, inspect citations, and open AI details.
- [x] 1.2 Add E2E assertions that the flow exposes at least two distinct intake/results views or pages and preserves document context when moving between them.
- [x] 1.3 Add E2E or API assertions for PDF upload validation, conversion status, conversion failure, and successful transition into the review workspace.
- [x] 1.4 Add E2E assertions that provider chain-of-thought markers, raw JSON answer fences, provider response IDs, raw metadata JSON, raw chunk UUIDs, and retrieval score internals are absent from the default reviewer view.
- [x] 1.5 Add E2E assertions for low-retrieval or empty-citation chat responses: the UI must show fallback/insufficient-evidence copy, not a confident grounded answer with `No citations returned` as the only signal.
- [x] 1.6 Add E2E assertions for staged AI status, contextual safe errors, unsupported out-of-document answers, and Q&A/refine history persistence.
- [x] 1.7 Add API-level assertions that returned and persisted analysis/chat display fields do not contain `<think>`, raw provider payloads, raw JSON fences, provider response IDs, policy text, or chain-of-thought.

## 2. Reviewer Flow Shell

- [x] 2.1 Refactor `apps/web/src/App.jsx` into small local components/helpers for app shell, authenticated start/intake view, review workspace, state banner, sample CTA, paste/PDF intake controls, analysis cards, answer cards, citation/evidence display, and AI trust details.
- [x] 2.2 Implement route-equivalent navigation between Start/Intake and Review Workspace using lightweight state/hash/history, or add a minimal router only if needed for credible page separation.
- [x] 2.3 Add a reviewer-facing hero with value proposition, assessment proof chips, primary `Try sample NDA` action, secondary paste-document path, and secondary upload-PDF path before any AI metadata appears.
- [x] 2.4 Implement the safe sample-document path by selecting the existing `Seed NDA Contract` when present or creating an equivalent safe sample through the current document API.
- [x] 2.5 Replace generic empty/loading copy with contextual start, intake, PDF upload/conversion, workspace, analysis, chat, unsupported, fallback, and provider-unavailable states that preserve user input.

## 3. PDF Document Ingestion

- [x] 3.1 Add non-breaking authenticated `POST /api/documents/uploads/pdf` route using `multipart/form-data` fields `file` and optional `title`, with auth-before-parsing/conversion and existing JSON `POST /api/documents` unchanged.
- [x] 3.2 Add an explicit streaming multipart parser/dependency, enforce request limits while reading, reject multiple/missing files, and clean up temp files for malformed or over-limit bodies.
- [x] 3.3 Enforce default PDF limits: max 5 MiB upload, max 20 detectable pages, max 15 second conversion timeout with process kill, and max 120,000 extracted characters before normalization.
- [x] 3.4 Package and invoke a real MarkItDown-compatible converter runtime for local/Docker/demo execution; ensure deterministic fixture fallback remains smoke-only and is never used for arbitrary user uploads.
- [x] 3.5 Validate unsupported, mismatched, malformed, encrypted/password-protected, scanned/no-text, and converter-unavailable PDFs with safe 413/415/422/503-style failures before ready document/chunk creation.
- [x] 3.6 Route successful converted PDF text through existing normalization, chunking, document persistence, ownership, and analysis/chat readiness behavior with `201 { document }` response shape.
- [x] 3.7 Redact converter stdout/stderr, local paths, command output, stack traces, raw document excerpts, and dependency internals from responses and logs.
- [x] 3.8 Add focused backend or integration coverage for successful PDF ingestion, unsupported file rejection, malformed/oversized PDFs, scanned/no-text conversion failure, converter unavailable, temp-file cleanup, and PDF-derived chunk persistence.

## 4. Structured Review Workspace

- [x] 4.1 Build a review workspace layout that keeps document title/status visible and separates source evidence, structured analysis, chat/refine controls, and AI trust information.
- [x] 4.2 Render analysis results as scannable summary, entities, obligations, risks, and uncertainties sections with category-specific empty states instead of raw object strings.
- [x] 4.3 Add document-specific suggested questions and refinement actions after analysis succeeds.
- [x] 4.4 Preserve multiple visible Q&A entries or equivalent session-local review history so follow-up questions do not erase prior answers and evidence.
- [x] 4.5 Ensure the primary sample and any visible demo content exclude AWS cleanup notes, real credential values, local harness paths, and accidental internal operational text.

## 5. Safe AI Evidence Presentation

- [x] 5.1 Implement answer normalization so visible chat answers never render `<think>` blocks, hidden reasoning, internal policy/system/developer references, raw provider payloads, or raw JSON fences as the user-facing answer.
- [x] 5.2 Add mandatory backend chat/analysis post-processing so unsafe chain-of-thought or provider internals are not returned, persisted, or later exposed through storage-backed history/API clients.
- [x] 5.3 Render normal grounded answers as answer cards with cleaned prose, citation/source chips, uncertainty badge/callout, and clear next actions.
- [x] 5.4 Downgrade empty-citation, low-coverage, zero-score fallback, unsupported, and fallback full-document responses into explicit fallback/insufficient-evidence/unsupported states.
- [x] 5.5 Render retrieved evidence with human-readable labels and excerpts, and reveal matching source excerpts when users select citation or evidence chips.
- [x] 5.6 Add sensitive-content handling for credential-like document text so user-facing output warns or redacts instead of presenting secret-shaped strings as credentials to share.

## 6. AI Transparency and Safe Errors

- [x] 6.1 Replace the default raw `MetadataPanel` output with a compact trust bar showing model/provider, prompt ID/version, retrieval mode, citation coverage, uncertainty/fallback status, and token usage when available.
- [x] 6.2 Add expandable AI details with reviewer-readable technical labels for provider/model, prompt version, context strategy, retrieval backend, fallback reason, token usage, and evidence summary.
- [x] 6.3 Gate any raw metadata JSON or developer-only diagnostics behind an intentional details disclosure or development-only condition so it is not visible on initial demo load.
- [x] 6.4 Map backend/provider/conversion errors to safe contextual UI messages that do not echo stack traces, secret-like config names, raw provider failures, conversion command output, or sensitive implementation details.

## 7. Verification and Documentation

- [x] 7.1 Run the focused E2E suite for the changed reviewer flow with `npm run test:e2e -- tests/e2e/doculens-ui.spec.mjs` or the project-supported equivalent.
- [x] 7.2 Run the focused backend/unit or integration tests that cover PDF ingestion, multipart limits, converter failures, temp-file cleanup, and AI display-field post-processing.
- [x] 7.3 Run `npm run smoke:markitdown` plus the updated backend PDF upload conversion test to prove the runtime path, not only the fixture fallback, converts into ingestion-ready text/chunks.
- [x] 7.4 Build the web app with the project-supported command to catch React/Vite regressions.
- [x] 7.5 Update README/demo instructions with the new reviewer script, PDF upload limits, text-based-only/no-OCR caveat, converter runtime requirements, safe sample path, AI trust states, and assessment trade-offs after the working flow is verified.
- [x] 7.6 Capture or manually inspect the rendered reviewer flow to confirm the first screen sells the product, PDF upload is discoverable with honest limits, and raw debug data no longer dominates the demo export.
