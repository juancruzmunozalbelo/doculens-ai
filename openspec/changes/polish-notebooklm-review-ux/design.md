## Context

DocuLens is currently close to a source-first notebook, but the user-reported demo path breaks down in the moments that matter most: PDF sources are hard to distinguish, analysis can show raw JSON, empty cards dominate the briefing, broad starter questions can produce `Not enough evidence`, and long-running AI/PDF operations lack clear progress. The target UX is a NotebookLM-inspired review workspace: selected sources drive answers, citations are inline and inspectable, and the user can tell which source is active and what the AI is doing.

Relevant external reference points from Google NotebookLM Help:
- NotebookLM frames uploaded files as notebook sources and answers questions from selected sources.
- NotebookLM chat uses direct quotes/text/images from sources as citations; users can inspect citation text and navigate to source context.
- NotebookLM lets users include/exclude sources from chat and offers source summaries/guides.
- NotebookLM explains that vague questions may need rephrasing, but source-grounded overview questions should still feel guided rather than broken.

Current implementation constraints:
- The app is a small React single-file frontend in `apps/web/src/App.jsx` with inline styles and no heavy UI library.
- The API already supports documents, PDF upload, analysis, chat, chunks, and delete.
- The current API does not expose rename, archive, or persisted failed-source retry endpoints.
- There are no mainline `openspec/specs` yet, so this change creates new capability specs.
- Keep the implementation boring: no new large design-system dependency unless unavoidable. CSS transitions/keyframes and lightweight component extraction are enough.

## Goals / Non-Goals

**Goals:**
- Make the assessment PDF golden path reviewer-ready from source creation through analysis and chat.
- Reframe the app as a compact single-active-source notebook: source rail + source preview + review/chat panel.
- Normalize provider output before UI render so raw JSON/fences/provider diagnostics never appear as reviewer content.
- Add operation-specific loading, animations, button pending labels, aria status, retry/recovery actions, and source-switch feedback.
- Add favicon/app icon and browser metadata.
- Make source cards useful with safe filename, title, uploaded time, status, type, open/rename/delete actions, and active-source recovery.
- Ensure broad document questions route to useful full-document overview answers instead of insufficient-evidence failures.
- Preserve citation discipline: grounded answers require validated citations; full-document overview answers get a clear fallback caveat.

**Non-Goals:**
- Do not clone NotebookLM branding, proprietary UI, or advanced paid/agentic features.
- Do not add multi-source synthesis, source checkboxes, web discovery, audio overviews, mind maps, or NotebookLM feature parity.
- Do not implement persisted failed-source retry from server-side failed document records in this change; recoverable upload/conversion failures keep client-side context and provide retry/paste-text actions.
- Do not implement OCR for scanned PDFs.
- Do not introduce streaming token output or backend job polling unless explicitly chosen later; staged progress copy is sufficient.
- Do not expose raw provider payloads or chain-of-thought in developer or reviewer surfaces.

## Decisions

### 1. Use a NotebookLM-inspired three-region workspace, not a landing-page layout

Design the authenticated app around:
- left source rail: source list, add source control, source metadata/actions;
- source preview region: selected source summary/excerpts and citation target;
- main panel: review briefing, starter questions, chat, answer history.

Rationale: the user is not buying a product on this screen; they are trying to review a source. Reducing the hero and keeping source identity visible matches the NotebookLM mental model without promising full NotebookLM parity.

Alternatives considered:
- Keep current two-column intake/review split: simpler, but preserves the oversized and fragmented experience.
- Add a full router/design system: unnecessary for this scope.

### 2. Unify source creation behind one compact `Add source` flow

Use a single card/modal/inline panel with tabs or segmented control:
- Upload PDF
- Paste text
- Try sample

PDF path should show filename, size, limits, upload/conversion stages, and fallback to paste text. Pasted text should share title/source metadata behavior.

Rationale: PDF and text are both source creation methods; splitting them into separate large panels makes the app feel larger and less clear.

### 3. Persist and display safe source metadata

PDF upload metadata should include:
```js
{
  originalBasename,
  safeOriginalBasename,
  mimeType,
  sizeBytes,
  sourceMethod: 'pdf_upload',
  uploadedAt // or createdAt mapped as upload time
}
```

Sanitization rules:
- strip path separators, control characters, and hidden path segments;
- normalize Unicode for display;
- preserve safe `.pdf` extension when present;
- cap length with middle truncation;
- redact secret-shaped filenames;
- never render raw document IDs as display fallback.

Source cards should render a primary title plus secondary details.

Example:
```text
Full_Stack_AI_Engineer_Assessment.pdf
PDF · Ready · uploaded 14:32 · 84 KB
```

If a user title exists:
```text
test
Full_Stack_AI_Engineer_Assessment.pdf · PDF · uploaded 14:32
```

Lifecycle scope for this change:
- Required: open, rename title, delete, active-source recovery.
- Required recovery: retry the current failed upload/analysis/chat operation while preserving safe client-side context.
- Out of scope: archive semantics and server-side retry of hidden failed document records.

### 4. Introduce explicit answer states and transitions

Use separate states instead of overloading `insufficient_evidence`:
- `grounded`: validated chunk citations available;
- `full_document_overview`: useful source-wide answer for explicit broad/global questions without precise chunk citations;
- `insufficient_evidence`: source text exists but a specific claim/question is not supported by citation-quality retrieval;
- `unsupported`: outside source scope;
- `error`: provider/API/network failure.

State transition rules:
- `global_question` or equivalent broad overview intent MAY become `full_document_overview`.
- `low_retrieval_coverage` for a specific question MUST remain `insufficient_evidence` unless the UI offers an explicit overview rewrite/action.
- outside-source questions MUST remain `unsupported`.
- provider/network failures MUST become `error`, not `insufficient_evidence`.

Rationale: broad questions such as `What is this document about?` are valid and should not fail solely because no chunk citation was selected, but fallback must not become a hallucination escape hatch.

### 5. Normalize AI/provider output at the backend boundary

`minimax-provider` and chat service normalization should accept:
- top-level JSON;
- Markdown-fenced JSON;
- nested `answer` objects;
- string answers;
- malformed provider prose.

Canonical analysis API/display contract:
```js
{
  summary: string,
  sections: [{ title: string, summary?: string, sourceQuote?: string }],
  entities: [{ name: string, type?: string, description?: string }],
  requirements: [{ category?: string, text: string, sourceQuote?: string }],
  obligations: [{ party?: string, text: string, sourceQuote?: string }], // legacy/legal alias; may mirror requirements only when appropriate
  deliverables: [{ text: string, sourceQuote?: string }],
  risks: [{ severity?: string, text: string, sourceQuote?: string, derivedReviewerRisk?: boolean }],
  uncertainties: [string],
  recommendedQuestions: [string],
  metadata: sanitizedMetadata
}
```

Persistence/API behavior:
- API responses and saved/reloaded analysis records must preserve the canonical fields top-level.
- Implementation may use new JSON persistence or a backward-compatible metadata JSON fallback, but load/save mapping must return the same canonical API shape.
- Existing `obligations` remains supported for legal/sample documents; assessment documents should prefer `requirements` and `deliverables` labels.

Rationale: UI cannot fix raw provider shape reliably after persistence; the API must own display-safe contracts.

### 6. Hide empty cards unless they teach or recover

Analysis cards with no useful content should be hidden, collapsed, or grouped under a small `Not detected` region. Provider diagnostics such as `Provider returned prose instead of structured JSON` must become safe recovery copy.

Rationale: five large empty cards communicate failure and waste space.

### 7. Operation feedback uses staged copy and lightweight animation

Use consistent pending states:
- upload: `Uploading PDF…`;
- conversion: `Reading PDF text…`;
- normalization: `Preparing source…`;
- analysis: `Building briefing…`;
- retrieval: `Searching selected source…`;
- model: `Drafting answer…`;
- citation validation: `Checking evidence…`.

Because current backend operations are blocking request/response, these stages are frontend operation labels unless a safe backend stage/request ID is available. Labels must not claim a stage completed before completion; they may describe the current operation category while the request is pending.

Frontend implementation can use CSS keyframes for shimmer/skeletons, button label swaps, `aria-busy`, `role=status`/`aria-live` status regions, disabled states, and subtle card enter transitions. Respect `prefers-reduced-motion` by disabling non-essential animations.

### 8. Source preview and answer evidence are separate

The side region is `Source preview` and can always show selected source excerpts. Answer cards have `Evidence used` and only show citations/excerpts used for that answer. Citation clicks should highlight/navigate to the source excerpt when available.

Rationale: current evidence presentation can feel stale or contradictory when an answer says no evidence.

### 9. Favicon and product shell polish are first-class tasks

Add a simple DocuLens favicon/app icon, document title, meta description, and theme color. Keep it lightweight: SVG favicon plus fallback only if needed.

Rationale: the assessment demo should feel complete in browser tabs and screenshots.

### 10. Implementation order

1. Freeze contracts and fixtures: canonical analysis schema, answer-state schema, source lifecycle scope, source metadata schema, assessment PDF fixture, extracted-text fixture, expected assertions.
2. Add failing targeted tests for provider parsing, chat states, source metadata, and assessment golden path.
3. Implement backend normalization/persistence and retrieval/answer-state changes.
4. Implement source metadata/lifecycle APIs and frontend source cards.
5. Implement workspace/briefing/chat UI, loading/animation/recovery states, accessibility, and favicon polish.
6. Run targeted verification and manual smoke.

## Risks / Trade-offs

- **Risk: full-document overview weakens citation strictness.** Mitigation: allow it only for broad/global questions, label it distinctly, and do not call it grounded.
- **Risk: NotebookLM inspiration becomes scope creep.** Mitigation: implement only source rail, selected source grounding, citations, source preview, source selection, and loading patterns. Exclude audio overview, mind maps, deep research, source checkboxes, and multi-source synthesis.
- **Risk: provider normalization hides useful debug detail.** Mitigation: keep sanitized metadata in technical details and tests; never show raw payloads by default.
- **Risk: inline styles become hard to maintain.** Mitigation: extract local style helpers/components inside `App.jsx` first; only split files if implementation becomes hard to reason about.
- **Risk: animations harm accessibility.** Mitigation: use `aria-busy`, `role=status`, visible focus, keyboard controls, text status, disabled states, and `prefers-reduced-motion` handling.
- **Risk: filename metadata touches API/data contracts.** Mitigation: store safe basename in existing `metadata` JSON unless a migration is needed for canonical analysis fields.
