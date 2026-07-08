## Context

Live endpoint validation against the deployed AWS demo with `/Users/juancruz/Downloads/Full_Stack_AI_Engineer_Assessment (1).pdf` showed the HTTP path is alive but semantically broken:

- Auth works: register `201`, login `200` with `accessToken`.
- PDF upload works: `/api/documents/uploads/pdf` returns `201`, `sourceType: pdf`, `status: ready`, `contentLength: 3805`, `sizeBytes: 99607`.
- MarkItDown conversion works enough to extract the assessment content.
- Chunking returns four chunks, but the first chunk has `headingPath: ["Untitled"]`, so section structure is weak.
- Analysis returns `201` but falls back to `DocuLens could not convert the AI response into a structured briefing`, with zero sections, requirements, deliverables, and risks.
- Chat returns `201`, but some `answer.text` values contain Markdown-fenced JSON such as ```json { "answer": ... } ```.
- Broad but valid source questions such as `What are the main requirements in this source?` and `What deliverables does this source request?` return `insufficient_evidence` despite retrieved chunks.
- The UI then displays degraded cards with hostile copy and mobile/narrow source preview overflow.

The prior change hardened many deterministic test paths, but the live MiniMax response shape and the actual assessment PDF conversion shape still expose gaps. The fix should make the real PDF endpoint path the contract, not only mocked provider paths.

## Goals / Non-Goals

**Goals:**

- Normalize real MiniMax analysis responses into the canonical briefing schema when the response contains parseable structured content in wrappers, Markdown fences, nested fields, or text fields.
- Normalize real MiniMax chat responses so reviewer-facing `answer.text` is plain answer prose, never JSON, Markdown fences, provider envelopes, or raw object strings.
- Return useful source-level answers for broad requirements/deliverables/overview questions when the selected source contains relevant assessment sections.
- Preserve strict insufficient-evidence behavior for genuinely unsupported or overly specific low-evidence questions.
- Improve chunk heading metadata for converted assessment text so retrieval can reason about sections like Backend, Frontend, Data, Deployment, Deliverables, Risks, and Evaluation.
- Add tests that replay the real PDF endpoint path: upload, chunks, analysis, chat, and display-safety assertions.
- Improve UI degraded states and responsive source preview/card layout enough that backend degraded output is understandable rather than embarrassing.

**Non-Goals:**

- Replacing MiniMax or adding a second production provider.
- Building a full vision-based PDF understanding pipeline for this fix; MiniMax vision may be explored later, but this change should first make current PDF-text extraction and text LLM endpoints reliable.
- Adding server-side multi-source synthesis, source checkboxes, or NotebookLM parity features beyond the current single-active-source model.
- Adding OCR for image-only PDFs.
- Rebuilding the application shell or changing authentication.

## Decisions

### Decision 1: Normalize provider output recursively at the boundary and again before persistence/display

Provider output can arrive as top-level JSON, Markdown-fenced JSON, nested `answer` objects, or a string field that itself contains JSON. The provider boundary should recursively unwrap known safe containers and parse JSON-like strings before mapping to canonical fields. Chat service should also sanitize final `answer.text` before persistence/display because retrieval policy and fallback assembly can introduce another output boundary.

Alternatives considered:

- Prompt-only fix: rejected because model compliance is not guaranteed.
- UI-only cleanup: rejected because API consumers and persistence would still store broken output.
- Throw on unexpected provider shape: rejected because the demo should degrade safely when no structured content is recoverable.

### Decision 2: Treat source-level requirements and deliverables questions as section-summary intents

Questions like `What are the main requirements in this source?` and `What deliverables does this source request?` are broad source-summary questions, not precise citation questions. They should route through overview/section-summary behavior when the selected source has relevant sections or chunks. The answer should include citations when section evidence supports it, but absence of exact answer-specific citations should not force hostile insufficient-evidence copy if the source-level answer is clearly supported by the document.

Alternatives considered:

- Always use full-document fallback for broad questions: too loose; could answer without section grounding.
- Keep current strict citation gating: preserves safety but fails the core assessment use case.
- Hard-code assessment PDF questions only: too brittle; intent detection should generalize to requirements/deliverables/risk/section summary wording.

### Decision 3: Add lightweight section inference for MarkItDown plain text

The PDF conversion output contains visible section titles but not always Markdown headings. The chunking path should infer headings from assessment-style lines such as numbered section titles, title-cased standalone labels, or known source section labels before assigning `Untitled`. This should improve chunk metadata and retrieval without changing storage schema.

Alternatives considered:

- Require MarkItDown to emit Markdown headings: not guaranteed across PDFs.
- Store the entire assessment as one chunk: hurts retrieval precision.
- Add a new PDF parsing dependency: unnecessary until current extraction is exhausted.

### Decision 4: Endpoint regression tests should assert semantic output, not just status codes

The regression test should fail if `/analysis` returns fallback-only briefing for the assessment, if `/chat` returns fenced JSON in `answer.text`, if requirements/deliverables questions are insufficient, or if chunks remain entirely `Untitled` despite section labels. The deployed smoke can remain lightweight but should include these semantic checks before declaring a release good.

Alternatives considered:

- Manual browser smoke only: too easy to miss API-level raw output.
- Mock-only provider tests: already insufficient for real MiniMax shape.
- Full live MiniMax in every CI run: expensive/flaky; use deterministic fixtures for CI and an opt-in deployed/live smoke for release validation.

### Decision 5: UI should make degraded states compact and actionable

If insufficient evidence is still correct, the card should be concise, neutral, and actionable. It should not show large repeated headings, oversized empty sections, or jargon like citation controls when no citations exist. Source preview and source cards should truncate long filenames and avoid overlap on narrow screens.

Alternatives considered:

- Hide all degraded states: unsafe because users need to know when the answer is unsupported.
- Leave backend state as-is and only improve copy: insufficient because screenshots show layout defects too.

## Risks / Trade-offs

- **Risk: over-normalization could hide malformed provider output.** Mitigation: keep sanitized debug metadata and display warnings; tests assert raw payloads do not leak while preserving safe observability.
- **Risk: broad requirements questions could become too permissive.** Mitigation: route only recognized source-summary intents; keep unsupported current-fact and low-evidence specific claims in unsupported/insufficient states.
- **Risk: section inference could create false headings.** Mitigation: prefer conservative patterns and retain chunk text; tests assert useful headings for the assessment without requiring every PDF line to become a heading.
- **Risk: live MiniMax output is non-deterministic.** Mitigation: capture representative real response shapes as sanitized fixtures for deterministic tests; keep opt-in live/deployed validation separate.
- **Risk: UI fixes mask backend defects.** Mitigation: endpoint tests remain source of truth for analysis/chat output; UI tests only verify presentation of already-normalized states.
