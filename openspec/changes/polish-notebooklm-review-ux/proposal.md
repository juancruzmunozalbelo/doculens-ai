## Why

The current review experience fails the core demo path: uploaded PDFs can produce raw JSON, empty analysis cards, generic `Not enough evidence` answers, unclear sources, and missing operation feedback. We need a NotebookLM-inspired source-first review UX that makes the assessment PDF feel understandable, grounded, and responsive.

## What Changes

- Replace the oversized/fragmented Sources screen with a compact source-first workspace inspired by NotebookLM: source rail, selected source context, source preview, and primary chat/review panel.
- Unify PDF upload and pasted text creation into one source creation flow with method selection, safe filenames, upload timestamps, source metadata, and clear source lifecycle actions.
- Add operation-specific loading, animations, and progress states for upload, conversion, normalization, analysis, retrieval, model response, citation validation, and source switching.
- Add favicon/app icon assets and browser metadata so the demo looks like a complete product.
- Harden AI analysis normalization so raw JSON, Markdown JSON fences, nested `answer` objects, and provider-shaped payloads become structured reviewer-facing summaries, requirements, risks, and questions.
- Fix broad document questions and RAG/fallback routing so starter questions such as `What is this document about?` produce useful full-document overview answers instead of generic insufficient-evidence failures.
- Redesign answer cards with NotebookLM-style inline citations, source quote previews, selected evidence navigation, full-document fallback states, and recovery actions.
- Hide or collapse empty analysis cards and replace provider diagnostics with reviewer-safe copy and actions.
- Make the Full Stack AI Engineer Assessment PDF a golden demo path with expected briefing, requirements, risks, suggested questions, and chat answers.

## Capabilities

### New Capabilities
- `notebooklm-inspired-review-workspace`: Covers the compact source-first review layout, source rail, selected source preview, source metadata, source lifecycle actions, favicon, visual polish, and responsive behavior.
- `ai-operation-feedback`: Covers operation-specific loading, animations, pending/disabled states, progress copy, retry/recovery actions, and safe request context for source creation, analysis, retrieval, and chat.
- `structured-ai-output-normalization`: Covers provider response parsing and sanitization for raw JSON, Markdown fences, nested objects, malformed output, and reviewer-facing structured analysis.
- `document-grounded-chat-ux`: Covers broad document questions, RAG/fallback strategy, answer states, citations, evidence navigation, NotebookLM-style source quote previews, and starter question guarantees.
- `assessment-pdf-golden-path`: Covers the expected end-to-end behavior for the Full Stack AI Engineer Assessment PDF, including briefing, requirements extraction, suggested questions, and grounded chat.

### Modified Capabilities
- None. There are no mainline `openspec/specs` capabilities yet; this proposal introduces new capability specs for the current repo-local change.

## Impact

- Affected frontend: `apps/web/src/App.jsx`, app shell/layout, source intake, source rail, review briefing, chat answer cards, evidence panel, loading states, favicon/static assets.
- Affected backend: `apps/api/src/server/ai/minimax-provider.mjs`, `apps/api/src/server/chat/service.mjs`, `apps/api/src/server/retrieval/policy.mjs`, PDF upload metadata in `apps/api/src/server/index.mjs`, document service/repository metadata if safe original filenames and upload timestamps need persistence.
- Affected tests: E2E reviewer flow, PDF upload path, MiniMax/provider parsing contracts, retrieval strategy tests, chat API answer-state tests, favicon/static asset checks.
- External UX reference: Google NotebookLM documents a source-grounded notebook model where uploaded sources drive chat answers, citations are inline and inspectable, and source selection controls which sources answer a question. This proposal adapts those patterns without copying NotebookLM-specific features outside the demo scope.
