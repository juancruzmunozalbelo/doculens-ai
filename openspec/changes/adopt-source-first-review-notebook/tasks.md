## 1. Test Contracts

- [x] 1.1 Add or update Playwright coverage for the authenticated source-first review notebook: create/select source, active source visible, source card readiness, briefing area, starter questions, chat, evidence panel, and collapsed trust details.
- [x] 1.2 Add UI assertions that primary-path copy avoids implementation vocabulary such as chunk, retrieval score, citation-quality chunk, fallback reason, prompt ID, provider payload, token usage, raw metadata, normalization, and converter internals.
- [x] 1.3 Add UI/API assertions that JSON-shaped provider answers, raw JSON fences, provider payloads, internal IDs, hidden reasoning, and raw metadata never render as visible answer text.
- [x] 1.4 Add answer-state tests for exactly one coherent user-level state: grounded with citations, insufficient evidence with refinement help, or unsupported/outside-document with suggested in-source questions.
- [x] 1.5 Add citation interaction coverage proving inline citations or equivalent affordances select a persistent evidence excerpt with source/section context.
- [x] 1.6 Add PDF flow coverage for selected PDF, reading state, ready source card, no-readable-text failure, oversized/out-of-limits recovery, converter/backend failure recovery, and paste-text fallback.
- [x] 1.7 Add print/export coverage or snapshot checks proving the review output is not a broken browser print with clipped cards, giant whitespace, broken columns, or technical trust panels dominating the page.

## 2. Source-First Notebook Layout

- [x] 2.1 Refactor the authenticated UI into source-first regions: source rail/card area, review briefing area, guided questions/chat area, evidence panel, and technical details disclosure.
- [x] 2.2 Replace equal-weight sample/paste/PDF intake panels with one primary create-source flow that exposes sample, PDF, and pasted text as methods.
- [x] 2.3 Represent sample NDA, pasted text, and uploaded PDFs as source cards with title, type, active/ready/processing/failed state, and recovery actions.
- [x] 2.4 Keep the active source visible while displaying briefing, questions, answers, citations, and evidence for that source.
- [x] 2.5 Ensure reopening a recent document loads enough source content for the source card and evidence panel, using the existing document detail API if the list response is insufficient.
- [x] 2.6 Add stable test IDs for source rail/card, source status, review briefing, starter questions, inline citation, evidence panel, and technical details while preserving existing critical test IDs where practical.

## 3. Quiet Copy and Progressive Disclosure

- [x] 3.1 Rewrite primary headings, helper text, empty states, buttons, and labels around user outcomes and actions: ready source, generate summary, ask a question, view evidence, retry, or paste text.
- [x] 3.2 Replace technical loading messages with short states for reading PDF, preparing document, generating summary, and searching the document.
- [x] 3.3 Replace technical error messages with concise recovery copy that preserves user input and offers retry, choose another file, paste text, or refine question.
- [x] 3.4 Collapse provider/model, prompt version, retrieval mode, fallback reason, citation coverage, token usage, and diagnostics behind an explicit technical-details disclosure.
- [x] 3.5 Keep a small user-level trust summary visible using facts such as evidence found, citation count, not enough evidence, or outside document scope.
- [x] 3.6 Audit the visible UI to remove explanatory notes that do not describe current state, next action, result, risk, or recovery path.

## 4. Answer and Evidence Presentation

- [x] 4.1 Add a frontend display boundary that normalizes JSON-shaped or provider-formatted answer text into safe user-facing answer cards or a safe recovery state.
- [x] 4.2 Ensure visible answer cards never render raw JSON, markdown JSON fences, provider payloads, hidden reasoning, system/developer/policy references, internal IDs, chunk IDs, retrieval scores, stack traces, or raw metadata.
- [x] 4.3 Render grounded answers with inline citations or equivalent citation affordances adjacent to the supported claim.
- [x] 4.4 Connect citation selection to a persistent evidence panel showing source title, section label when available, excerpt, and enough context to verify the claim.
- [x] 4.5 Replace raw retrieved-chunk lists in the primary path with selected evidence context and move safe retrieval diagnostics into technical details only.
- [x] 4.6 Render insufficient-evidence and unsupported answers as user-help states with refinement or in-source question suggestions, not as generic errors or raw fallback labels.
- [x] 4.7 Handle ambiguous broad questions with clarification options or starter-question suggestions before showing a dense answer state.

## 5. PDF Source Readiness

- [x] 5.1 Update PDF selection UI to show selected filename, concise caveats, and a simple create/read source action without dominant conversion-limit explanations.
- [x] 5.2 Update PDF processing UI so successful upload/conversion creates a ready PDF source card and navigates to the source-first review notebook.
- [x] 5.3 Update PDF failure states for too-large, unsupported, no-text/scanned/protected, converter unavailable, timeout, and backend failure cases with concise recovery copy.
- [x] 5.4 Preserve selected file context where safe after PDF failure and offer choose-another-file or paste-text fallback from the same flow.
- [x] 5.5 Ensure PDF-derived source evidence and answers use normal review language and never refer to converter artifacts unless technical details are opened.

## 6. Review Briefing and Guided Questions

- [x] 6.1 Rename and present structured analysis as a review briefing or summary generation action instead of a technical `Run structured analysis` step.
- [x] 6.2 Show starter questions immediately after a source is ready, before any structured analysis exists.
- [x] 6.3 Make selecting a starter question populate or submit the source-scoped question flow without requiring prior analysis.
- [x] 6.4 Render analysis results as notebook briefing sections connected to the active source: summary, obligations, risks, entities, uncertainties, and recommended next questions.
- [x] 6.5 Clear or relabel briefing, questions, answer history, citations, and evidence when the active source changes so content never appears attached to the wrong source.

## 7. Print or Review Summary Output

- [x] 7.1 Add print styles or a dedicated review-summary export view for coherent title, source summary, answers, citations, and evidence.
- [x] 7.2 Ensure printed/exported output omits technical details by default or moves them to a clearly labeled appendix-style section.
- [x] 7.3 Verify browser-generated PDF output avoids clipped cards, giant whitespace, broken columns, raw URL footers as primary content, and technical trust panels dominating the pages.

## 8. Verification and Documentation

- [x] 8.1 Run the focused Playwright suite covering source-first notebook UX, quiet copy, PDF readiness, answer states, citations/evidence, and print/export behavior.
- [x] 8.2 Run focused backend/API or UI contract tests that cover answer normalization, no raw JSON/provider payload display, and safe PDF error mapping.
- [x] 8.3 Build the web app with the project-supported command to catch React/Vite regressions.
- [x] 8.4 Manually inspect the reviewer flow with a real or representative PDF to confirm the app feels quiet, source-first, and self-explanatory without confusing notes.
- [x] 8.5 Update README/demo instructions only after verification, documenting the new reviewer script, source-first flow, PDF caveats, and technical-details disclosure model.
