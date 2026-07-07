## 0. Contracts and Fixtures

- [x] 0.1 Define the canonical analysis API/display schema with field names, required/optional status, item shapes, aliases, sanitization rules, and top-level response shape
- [x] 0.2 Decide and document analysis persistence strategy for canonical fields, including save/load mapping and any DB migration or JSON metadata fallback
- [x] 0.3 Define the chat answer-state API/display schema for grounded, full-document overview, insufficient evidence, unsupported, and error states
- [x] 0.4 Freeze source metadata schema for PDF sources: safe basename fields, MIME type, size, source method, created/uploaded time, and hostile-filename sanitization
- [x] 0.5 Freeze source lifecycle scope for this change: open, rename, delete, active-source recovery, and operation-level retry; exclude archive and server-side retry of hidden failed document records
- [x] 0.6 Create a sanitized generated assessment PDF fixture for upload/E2E coverage, with expected SHA-256, title markers, page/text snippets, source metadata expectations, and minimum chunk count
- [x] 0.7 Create an extracted assessment text fixture for deterministic provider, parsing, retrieval, and chat unit tests
- [x] 0.8 Define golden expected assertions for assessment overview, backend, frontend, data/privacy, reliability/evaluation, deployment, and deliverables questions

## 1. Golden Path Tests First

- [x] 1.1 Add provider parsing tests for top-level JSON, Markdown-fenced JSON, nested `answer` objects, malformed analysis, prose-only analysis, and chat answer fenced/nested output
- [x] 1.2 Add save/reload tests proving canonical analysis fields survive API and persistence boundaries without raw JSON/object strings
- [x] 1.3 Add chat/retrieval policy tests for overview, backend requirements, frontend requirements, data/privacy requirements, reliability/evaluation requirements, deployment requirements, deliverables, specific low-coverage claims, and unsupported outside-source questions
- [x] 1.4 Add E2E coverage using the sanitized assessment PDF fixture for upload/open, briefing generation, golden questions, and no visible raw JSON fences
- [x] 1.5 Add UI regression assertions for source metadata, loading states, answer states, citation/evidence behavior, keyboard source/citation behavior, reduced motion, and favicon presence
- [x] 1.6 Add negative leakage tests covering API responses, persisted reloads, briefing, answer cards, source preview, evidence, technical details, print output, aria labels, and error/retry UI

## 2. Backend Output Normalization

- [x] 2.1 Update MiniMax/provider parsing to strip Markdown JSON fences before parsing
- [x] 2.2 Normalize nested `answer` objects into the same analysis/chat contract as top-level structured JSON
- [x] 2.3 Update analysis normalization, repository save/load, and API response mapping for the canonical analysis fields
- [x] 2.4 Extend analysis contract to support assessment-friendly sections, requirements, deliverables, risks, uncertainties, and recommended questions
- [x] 2.5 Convert malformed provider output into safe reviewer-facing limitation copy without raw provider diagnostics
- [x] 2.6 Normalize chat provider output from fenced JSON, nested answer objects, string answers, and malformed/prose responses before persistence/display
- [x] 2.7 Ensure sanitized display fields, persisted analysis/messages, API responses, technical details, and print output never include raw JSON fences, provider payloads, hidden reasoning, stack traces, raw IDs, or internal diagnostics

## 3. Retrieval and Answer State Model

- [x] 3.1 Extend global-question detection to include broad source overview questions such as `What is this document about?`
- [x] 3.2 Add explicit backend and frontend answer states for grounded, full-document overview, insufficient evidence, unsupported, and error
- [x] 3.3 Stop overwriting useful full-document overview answers with generic insufficient-evidence copy
- [x] 3.4 Keep low-retrieval specific questions in insufficient-evidence state unless the user chooses an overview/refine action
- [x] 3.5 Preserve citation gating for grounded answers and use clear caveats for full-document overview answers without precise chunk citations
- [x] 3.6 Restrict fallback citations to answers actually supported by the retrieved excerpt; otherwise downgrade to evidence-validation or insufficient-evidence copy
- [x] 3.7 Add source-specific refinement suggestions when retrieval coverage is weak

## 4. Source Metadata and Lifecycle

- [x] 4.1 Persist safe PDF original basename, MIME type, size, source method, and created/uploaded time in document metadata
- [x] 4.2 Add rename/update-title backend support and tests, preserving ownership and source metadata
- [x] 4.3 Confirm delete semantics and add active-source recovery behavior for deleted sources
- [x] 4.4 Display source title, safe filename, type, readiness, relative/uploaded time, and size in source cards
- [x] 4.5 Disambiguate duplicate or generic source names using filename, timestamp, or type metadata
- [x] 4.6 Add source lifecycle controls for open, rename, and delete only; keep failed upload retry in operation UI rather than source rail
- [x] 4.7 Ensure active-source routing recovers safely when a source is deleted or renamed

## 5. NotebookLM-Inspired Workspace UX

- [x] 5.1 Reduce the oversized hero and restructure the authenticated UI into source rail, source preview, and review/chat regions
- [x] 5.2 Replace separate PDF and pasted-text panels with one unified Add source flow using accessible method selection
- [x] 5.3 Separate always-visible source preview from answer-specific evidence used by each answer, including distinct labels and tests against stale evidence confusion
- [x] 5.4 Make citation clicks reveal, focus, or highlight matching source excerpts without exposing raw chunk IDs in visible or accessible labels
- [x] 5.5 Make the workspace responsive by collapsing or stacking source navigation on narrow viewports while preserving active source identity
- [x] 5.6 Add keyboard and screen-reader semantics for source rail, add-source method selection, lifecycle actions, citation inspection, focus restoration, and visible focus states

## 6. Review Briefing UX

- [x] 6.1 Hide, collapse, or group empty analysis sections instead of rendering large negative cards
- [x] 6.2 Replace provider diagnostics with reviewer-safe recovery copy and retry actions
- [x] 6.3 Render canonical fields with assessment-specific labels for parts, requirements, deliverables, risks, uncertainties, and recommended questions
- [x] 6.4 Prefer `requirements` and `deliverables` over generic legal-contract `obligations` copy for non-contract documents
- [x] 6.5 Prefer analysis-generated recommended questions over generic starter questions
- [x] 6.6 Ensure briefing output remains scannable and does not display raw object strings or unformatted JSON

## 7. Loading, Animation, and Recovery States

- [x] 7.1 Add a frontend operation-state taxonomy mapping every async action to truthful labels, disabled controls, preserved context, optional request ID, and retry behavior
- [x] 7.2 Add staged status copy for PDF upload, conversion, normalization, source preparation, analysis, retrieval, model answer, and citation validation without implying unavailable backend telemetry
- [x] 7.3 Add pending button labels and duplicate-submit guards for every async action
- [x] 7.4 Add lightweight skeletons, shimmer/progress dots, card enter transitions, `aria-busy`, and visible `role=status`/`aria-live` regions
- [x] 7.5 Respect `prefers-reduced-motion` by disabling non-essential animation while preserving textual status
- [x] 7.6 Preserve user input and selected source context across recoverable API, provider, retrieval, and network failures
- [x] 7.7 Surface safe retry/refine/paste-text/choose-another-source actions for limitation and error states

## 8. Product Shell Polish

- [x] 8.1 Add SVG favicon/app icon links, browser title, meta description, and theme color; keep existing title only if product copy remains correct
- [x] 8.2 Remove generic placeholder browser assets if present
- [x] 8.3 Align spacing, active states, typography, and card hierarchy for screenshot-ready review surfaces
- [x] 8.4 Ensure default reviewer-facing copy avoids internal terms such as provider prose, raw JSON, chunk IDs, and backend diagnostics
- [x] 8.5 Add regression checks that favicon links resolve to non-generic assets and desktop/mobile shells keep active source visible without an oversized hero

## 9. Verification

- [x] 9.1 Run targeted provider parsing tests and chat/retrieval policy tests
- [x] 9.2 Run targeted PDF upload and assessment golden-path E2E tests using the committed PDF fixture
- [x] 9.3 Run accessibility checks for loading states, focus behavior, citations, keyboard source actions, reduced motion, and input preservation across failures
- [x] 9.4 Run leakage negative tests across API responses, persistence reloads, visible UI, technical details, print output, aria labels, and errors
- [x] 9.5 Run the existing unit/integration/E2E commands affected by this change
- [x] 9.6 Manually smoke the assessment PDF flow: add source, generate briefing, ask overview/backend/frontend/data/reliability/deployment/deliverables/unsupported questions, inspect citations, switch source, rename source, delete source
