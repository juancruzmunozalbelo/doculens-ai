## Context

DocuLens now has the core demo capabilities: authentication, source/document persistence, text/PDF ingestion, analysis, chat, citations, fallback/unsupported states, and a compact trust layer. The remaining UX problem is information architecture and copy. The current flow still asks users to understand implementation concepts such as review workspaces, structured analysis, retrieval/fallback, citation-quality chunks, provider/model metadata, prompt versions, token usage, and PDF conversion details.

The PDF flow screenshot that triggered this change showed the failure mode clearly: the user uploaded a PDF, asked an ambiguous question, and received a dense page with `Using full-document fallback`, `low_retrieval_coverage`, a JSON-shaped answer body, `0 citations shown`, retrieved excerpts, and a large AI trust block. The product technically contains useful signals, but the primary path makes those signals feel confusing and contradictory.

Stakeholders:
- Demo reviewer: needs to understand the document and the product value in seconds without reading engineering notes.
- End user: needs a simple path from source upload to summary, questions, answers, and evidence.
- Maintainer: needs a bounded refactor that preserves backend contracts and existing safety guarantees.
- Assessment evaluator: still needs proof of grounding, fallback behavior, provider abstraction, prompt versioning, and safe PDF handling, but these details do not need to dominate the first screen.

## Goals / Non-Goals

**Goals:**
- Reframe the product around sources: uploaded PDF, pasted text, and sample NDA are first-class source cards with readiness state.
- Make the main workspace feel like a review notebook: sources, briefing, guided questions, answers, citations, evidence, and compact trust.
- Replace explanatory notes with quiet copy that names the user outcome or next action.
- Hide implementation vocabulary from the primary path: chunks, retrieval scores, prompt internals, provider payloads, raw JSON, token counts, and fallback reasons.
- Keep trust and assessment signals available through progressive disclosure.
- Make citation/evidence interaction direct: inline citation markers should connect to a persistent source excerpt panel.
- Make PDF success/failure understandable without exposing converter internals.
- Preserve honest unsupported/insufficient-evidence behavior, but render it as user help rather than debug output.
- Add focused tests proving the quiet source-first UX and preventing regressions to raw JSON or confusing notes.

**Non-Goals:**
- No full NotebookLM clone, multi-source synthesis engine, notes database, audio/video overviews, flashcards, or slide generation.
- No new LLM provider, vector database, streaming transport, or backend architecture rewrite.
- No fake streaming or fake source support.
- No advanced OCR for scanned PDFs.
- No broad design-system dependency or UI framework migration.
- No hiding of safety/trust facts entirely; technical details remain available behind explicit disclosure.
- No production-grade export system beyond a bounded review-summary/print-safe output if needed to avoid broken browser print artifacts.

## Decisions

### Decision 1: Use a source-first notebook workspace

Replace the mental model of `Intake → Review Workspace → Run structured analysis` with `Create review → Source ready → Notebook review`. The selected document/PDF/sample becomes a source card in a visible sources region. The central workspace shows a briefing area, guided questions, chat/history, and answers. Evidence/trust sits adjacent or below, not as the leading explanation.

Rationale: NotebookLM feels easier because users start with sources and then ask/synthesize. DocuLens should copy that cognitive path while preserving its contract-review identity.

Alternative considered: keep the current two-panel workspace and only shorten copy. Rejected because the current layout still teaches the implementation model rather than the user model.

### Decision 2: Use quiet copy in the primary path

Primary copy must name a user-visible state, result, action, or recovery path. Examples:
- `PDF listo para revisar`
- `Generar resumen`
- `Preguntar sobre este documento`
- `Buscando respuesta en el documento...`
- `No encontré evidencia suficiente`
- `Probá con una pregunta más específica`

Implementation terms such as `chunk`, `retrieval`, `fallback`, `prompt`, `provider`, `token`, `conversion timeout`, `citation-quality`, and `metadata` must not appear in normal user-facing labels, descriptions, loading messages, or answer cards. They may appear inside an explicitly opened technical details disclosure.

Rationale: Notes that explain implementation confuse users and make the product look broken. The UI should explain itself through hierarchy and actions.

Alternative considered: keep explanatory notes because the assessment values transparency. Rejected for the primary path; transparency belongs in progressive disclosure.

### Decision 3: Keep technical trust as progressive disclosure

Collapse technical details by default. The always-visible trust summary should be compressed to user-level facts, for example `3 citas`, `Respuesta basada en el documento`, or `Evidencia insuficiente`. Expanded details may show provider/model, prompt version, retrieval/backend mode, fallback reason, citation coverage, token usage, and diagnostics summary with safe labels.

Rationale: The assessment still rewards AI transparency, but the user does not need provider and token metadata to understand a PDF review.

Alternative considered: remove AI trust entirely. Rejected because DocuLens must still demonstrate safe AI engineering and honest limitations.

### Decision 4: Normalize answer display before rendering

The UI must never render raw provider text, raw JSON fences, provider payloads, internal IDs, hidden reasoning, or metadata as the answer body. If backend normalization fails or provider output is JSON-shaped, the frontend display boundary must still extract or reject it into a safe response card.

Response cards should have:
- concise answer text;
- inline citation markers when grounded;
- evidence excerpt linkage;
- clear insufficient-evidence/unsupported state when not grounded;
- suggested next actions for ambiguous or unsupported questions.

Rationale: The PDF screenshot showed JSON-shaped output in the primary answer region. That is a product failure even if the underlying model returned useful content.

Alternative considered: rely only on backend normalization. Rejected because UI defense-in-depth is needed for demo safety.

### Decision 5: Resolve fallback/citation contradictions in presentation

A response cannot simultaneously look grounded and show `0 citations` or low retrieval coverage in user-facing copy. Presentation should use one of three user-level states:
- grounded: answer with inline citations and evidence;
- needs clarification/insufficient evidence: no confident answer, suggest refinements;
- unsupported: outside selected source scope, suggest in-source questions.

Technical fallback reasons belong only in details.

Rationale: Contradictory trust states are more confusing than a refusal. The user needs one coherent interpretation.

Alternative considered: show all raw state labels for transparency. Rejected because raw state labels create ambiguity and overexpose internal implementation.

### Decision 6: Make starter questions available as soon as a source is ready

A ready source should immediately show starter questions such as:
- `Qué es este documento?`
- `Qué pide construir?`
- `Cuáles son los entregables?`
- `Qué riesgos o puntos importantes hay?`
- `Qué partes requieren AWS?`

Structured analysis/briefing remains useful, but it should not be a prerequisite for guided exploration.

Rationale: The current flow makes the user discover the right next step. Notebook-style products reduce blank-page anxiety with starter prompts.

Alternative considered: keep suggestions only after analysis. Rejected because that delays guidance until after the user already navigated the system correctly.

### Decision 7: Treat PDF upload as source readiness, not conversion education

PDF intake should show one simple state at a time:
- choosing file;
- reading PDF;
- PDF ready;
- could not read PDF;
- retry or paste text.

Limits/caveats such as max size, page count, text-based only, no OCR, and timeout should exist as secondary help text or details, not dominant product copy. Errors must preserve context and avoid converter stdout/stderr, local paths, stack traces, dependency names, or implementation terminology.

Rationale: The user cares whether the PDF is ready to review, not how conversion/chunking works.

Alternative considered: keep all limits visible up front. Rejected because it overwhelms the happy path; limits should appear before selection only where needed to set expectations and after failure as recovery guidance.

### Decision 8: Add a print-safe review summary or suppress broken browser-print output

If users export/print the review, the output must not be a raw browser print of the app layout with clipped cards, huge whitespace, URL footers, and split trust panels. Either provide a review-summary export view or add print styles that produce a coherent document summary with answer, citations, and evidence.

Rationale: The supplied PDF showed a broken printed artifact. That harms perceived quality even if the live app works.

Alternative considered: ignore print/export because it is not a core requirement. Rejected because the user has already encountered it as part of the PDF-review flow.

### Decision 9: Preserve current APIs unless missing source content blocks the UX

Start with frontend restructuring and display normalization. Add or use existing `GET /api/documents/:id` behavior only if the current document list lacks enough content for a source card/evidence panel after resume. Do not introduce a new notebook data model unless source cards cannot be represented by existing documents.

Rationale: This change should fix UX and presentation, not rewrite persistence.

Alternative considered: introduce notebooks/sources tables now. Rejected as unnecessary unless true multi-source synthesis becomes a future requirement.

## Risks / Trade-offs

- [Risk] Hiding technical details could look like reduced AI transparency. → Mitigation: keep a compact trust summary and expanded technical details with safe labels.
- [Risk] Source-first UI may imply multi-source synthesis. → Mitigation: label one active source for this MVP and avoid cross-source claims until backend contracts exist.
- [Risk] Quiet copy may hide important PDF caveats. → Mitigation: surface caveats contextually: before risky upload action, in help text, and after failures.
- [Risk] Inline citations require answer/citation shape consistency. → Mitigation: normalize answer display and add tests for JSON-shaped provider output, citation count, and evidence selection.
- [Risk] Print/export scope can grow. → Mitigation: implement only minimal print-safe review summary or print CSS for current review output; defer full document export.
- [Risk] Existing E2E locators may break. → Mitigation: preserve critical test IDs where possible and add new stable IDs for source rail, source card, briefing, inline citation, and evidence panel.
- [Risk] UI-only sanitation may leave persisted bad display text. → Mitigation: preserve backend answer normalization requirements and add UI defense-in-depth tests.

## Migration Plan

1. Add focused failing tests for quiet copy, source-first layout, starter prompts before analysis, no raw JSON in answer cards, coherent fallback/citation presentation, evidence selection, PDF ready/failure states, and print/export behavior.
2. Refactor the authenticated UI around source-first sections: source rail/card, review briefing, guided questions/chat, evidence panel, and collapsed trust details.
3. Rewrite user-facing copy and loading/error messages to remove implementation vocabulary from the primary path.
4. Normalize answer presentation at the display boundary and ensure JSON-shaped provider output renders as safe answer text or insufficient-evidence state.
5. Add inline citation markers and evidence-panel selection behavior while preserving existing citation/evidence chips as needed for test stability.
6. Update PDF intake states to source-readiness language and recovery actions.
7. Ensure full source content is available when reopening recent documents; use existing document detail API if needed.
8. Add print-safe CSS or a review-summary export view so browser print/PDF output is coherent.
9. Update README/demo instructions only after the flow is verified.

Rollback is normal code rollback. No data migration is planned. If the source-first UI is too risky, keep existing API behavior and revert to the current intake/workspace view while retaining backend normalization fixes.

## Open Questions

- Should the product use English, Spanish, or browser/document-language-aware copy for starter questions and recovery actions?
- Is the MVP source rail allowed to show only one active source, or should it visually support multiple source cards while disabling cross-source synthesis?
- Should print/export be a dedicated `Review summary` action or only print CSS for the existing page?
- Which technical trust facts must remain visible without expansion for the assessment reviewer: citation count only, or provider/model too?
- Should ambiguous questions trigger a clarification card before any model answer, or should the model answer plus suggested refinements be allowed when evidence is strong?
