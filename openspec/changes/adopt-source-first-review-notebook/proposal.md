## Why

DocuLens currently explains too much of its implementation to the user: PDF flows expose technical notes, fallback/retrieval language, raw JSON-shaped answers, trust metadata, and long helper copy that make the app feel like an engineering harness instead of a document-review product. The next UX change should adopt a NotebookLM-like mental model—sources first, guided questions, concise synthesis, and citation-linked evidence—while keeping DocuLens-specific trust and safety details available only through progressive disclosure.

## What Changes

- Reframe the authenticated product from an intake/results pipeline into a source-first review notebook.
- Make uploaded PDFs, pasted text, and the sample NDA appear as source cards with simple readiness states and clear recovery actions.
- Replace explanatory notes and implementation vocabulary in the primary path with short user-facing action/result copy.
- Keep technical trust details such as provider/model, prompt version, retrieval mode, fallback reason, citation coverage, and token usage behind an explicit disclosure.
- Render answers as product-grade response cards with concise prose, inline citations, selected evidence excerpts, and clear unsupported/insufficient-evidence states.
- Prevent raw JSON, provider payloads, chunk IDs, retrieval scores, prompt internals, and contradictory fallback/citation states from appearing in the normal reviewer flow.
- Move starter questions earlier so a ready source immediately enables guided exploration, even before structured analysis has been generated.
- Treat PDF ingestion as a source-readiness flow: upload/readiness/retry/paste fallback, not a technical conversion explanation.
- Improve browser/print/PDF export behavior or explicitly provide a review-summary export path so the current app layout is not printed as a broken multi-page artifact.
- Preserve the existing backend contracts where possible; add API reads or display normalization only where needed to support the source-first UX honestly.

## Capabilities

### New Capabilities
- `source-first-review-notebook`: Covers the notebook-style workspace with visible sources, active source state, source readiness, starter questions, briefing, chat, and review history.
- `quiet-review-copy`: Covers user-facing copy rules, progressive disclosure, removal of confusing implementation notes, and simplified loading/error/recovery states.
- `citation-linked-evidence`: Covers inline citations, evidence selection, excerpt display, fallback/unsupported consistency, and suppression of raw JSON/provider internals.
- `pdf-source-readiness`: Covers PDF upload as a source card/readiness flow, simple PDF statuses, conversion caveats, recovery actions, and review-summary export expectations.

### Modified Capabilities
- None. No mainline OpenSpec specs currently exist under `openspec/specs/`; this change introduces new capability contracts for the notebook UX direction.

## Impact

- Frontend: `apps/web/src/App.jsx` will be reorganized from intake/workspace panels into a quieter source-first notebook layout, likely with smaller local components or extracted UI primitives.
- Frontend copy: visible labels, helper text, loading messages, fallback messages, PDF messages, and trust labels will be rewritten around user actions and outcomes instead of implementation steps.
- API usage: the frontend may need to fetch full source content on resume/open so the source rail/evidence panel never shows placeholder copy when a document is selected from recent documents.
- AI answer presentation: chat and analysis display must normalize provider responses into safe final text, inline citations, evidence excerpts, and consistent grounded/fallback/unsupported states.
- PDF flow: successful uploads must become ready source cards; failed uploads must preserve user context and offer retry or paste-text fallback without exposing converter internals.
- Tests: focused Playwright and API/UI contract tests must cover the source-first flow, quiet copy, no raw JSON, no confusing technical notes in the primary path, citation-to-evidence interaction, PDF readiness/recovery, and export/print behavior.
- Documentation: README/demo instructions may need a brief update after implementation to describe the new reviewer script and trust-details disclosure model.
