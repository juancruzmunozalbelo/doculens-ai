## 1. Endpoint Reproduction and Fixtures

- [ ] 1.1 Capture sanitized live MiniMax analysis response shapes that caused fallback-only briefing
- [ ] 1.2 Capture sanitized live MiniMax chat response shapes that leaked Markdown-fenced JSON
- [ ] 1.3 Add deterministic fixtures for real assessment PDF endpoint regression
- [ ] 1.4 Add failing endpoint regression covering PDF upload, chunks, analysis, and chat
- [ ] 1.5 Add failing assertions for requirements and deliverables questions not returning insufficient evidence

## 2. Provider and Chat Normalization

- [ ] 2.1 Add recursive JSON/fence/string unwrapping utility for provider responses
- [ ] 2.2 Normalize analysis JSON embedded inside text/content/output/message/answer fields
- [ ] 2.3 Normalize chat answer text after provider parsing and before persistence
- [ ] 2.4 Preserve safe citations, uncertainty, display state, and metadata during normalization
- [ ] 2.5 Redact provider payloads, hidden reasoning, response IDs, raw prompts, and secret-shaped values
- [ ] 2.6 Convert unrecoverable malformed provider output to safe limitation copy only

## 3. Retrieval and Answer-State Policy

- [ ] 3.1 Classify requirements, deliverables, risks, and purpose questions as source-summary intents
- [ ] 3.2 Route source-summary intents to useful overview or section-summary answers
- [ ] 3.3 Keep unsupported current-fact and outside-source questions refused without fabrication
- [ ] 3.4 Keep precise low-evidence claims in concise insufficient-evidence state
- [ ] 3.5 Ensure grounded answers cite only retrieved excerpts that support the answer
- [ ] 3.6 Ensure full-document overview answers do not fabricate precise citations

## 4. PDF Section Structure

- [ ] 4.1 Inspect MarkItDown text output for the real assessment PDF section patterns
- [ ] 4.2 Add conservative section heading inference for converted PDF plain text
- [ ] 4.3 Preserve known assessment markers in extracted content assertions
- [ ] 4.4 Replace all-Untitled assessment chunks with useful heading paths where labels exist
- [ ] 4.5 Verify heading inference does not over-split unrelated plain text documents

## 5. Workspace UI Recovery and Layout

- [x] 5.1 Remove duplicated briefing labels such as Summary Summary
- [x] 5.2 Render fallback-only briefing as a recovery state, not normal structured briefing
- [x] 5.3 Compact insufficient-evidence cards and remove empty citation-control sections
- [x] 5.4 Truncate or wrap long active source titles and source card filenames safely
- [x] 5.5 Fix source preview overlap and scrolling on narrow/mobile viewports
- [x] 5.6 Preserve open, rename, delete, and review controls when source preview is visible

## 6. Regression Tests and Verification

- [ ] 6.1 Run provider normalization tests for captured real MiniMax analysis and chat shapes
- [ ] 6.2 Run chat API tests for overview, requirements, backend, frontend, deliverables, and unsupported questions
- [ ] 6.3 Run PDF upload and chunking tests for real assessment section metadata
- [x] 6.4 Run E2E UI tests for briefing recovery, answer cards, citations, and narrow source preview layout
- [ ] 6.5 Run build, unit, integration, E2E, AWS static validation, and OpenSpec validation
- [ ] 6.6 Deploy or smoke deployed endpoint path and verify semantic output, not only health
