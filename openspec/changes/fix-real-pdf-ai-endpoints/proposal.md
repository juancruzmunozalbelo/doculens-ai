## Why

The deployed DocuLens demo accepts the real Full Stack AI Engineer Assessment PDF, but the core AI endpoints do not produce reviewer-grade output: analysis returns a safe fallback instead of a structured briefing, chat leaks Markdown-fenced JSON, and obvious requirements/deliverables questions are misclassified as insufficient evidence. This breaks the primary reviewer demo path even though upload, conversion, and HTTP status codes appear successful.

## What Changes

- Make real MiniMax analysis responses normalize into the canonical briefing contract instead of falling back when the provider returns Markdown fences, nested objects, provider-shaped wrappers, or JSON embedded in text.
- Ensure chat answers never expose raw JSON fences or provider/object wrappers in `answer.text`, including full-document overview and grounded answers.
- Update question classification and retrieval policy so broad source requirements/deliverables questions produce useful source-level answers when the selected source contains those sections.
- Improve assessment PDF chunk structure so converted text yields section-aware chunks rather than generic `Untitled` chunks where section labels are present in the source text.
- Add endpoint-level regression coverage using the real uploaded PDF path/fixture shape: upload PDF, list chunks, generate analysis, ask overview/requirements/backend/frontend/deliverables questions, and assert safe display output.
- Tighten UI-facing copy/layout requirements for degraded answer states so any remaining insufficient-evidence state is concise and not visually hostile.

## Capabilities

### New Capabilities
- `real-pdf-ai-endpoint-regression`: API-level regression behavior for uploading a real assessment PDF and validating analysis/chat endpoints end to end.
- `structured-ai-output-normalization`: Normalization rules for real MiniMax analysis/chat response shapes and reviewer-facing output safety.
- `document-grounded-chat-ux`: Source-level requirements, deliverables, overview, and grounded answer behavior for reviewer chat.
- `assessment-pdf-golden-path`: Golden-path behavior for the assessment PDF across upload, conversion, chunking, analysis, and chat.
- `notebooklm-inspired-review-workspace`: Reviewer workspace behavior for source preview, answer cards, degraded states, and responsive layout.

### Modified Capabilities
- None. `openspec/specs/` is currently empty, so this change defines the required capabilities as new repo-local specs.

## Impact

- Backend AI/provider normalization: `apps/api/src/server/ai/minimax-provider.mjs`, `apps/api/src/server/chat/service.mjs`, prompt builders/registry if real MiniMax output needs stricter response instructions.
- Retrieval/chunking policy: `apps/api/src/server/retrieval/policy.mjs`, ingestion/chunking modules, and document service/repository surfaces for chunk metadata.
- PDF upload path: `apps/api/src/server/documents/pdf-upload.mjs`, `/api/documents/uploads/pdf`, and conversion assumptions around MarkItDown output.
- Frontend rendering/copy: `apps/web/src/App.jsx` answer cards, briefing cards, source preview, source cards, mobile/narrow layout.
- Tests: provider parsing contracts, chat API contracts, retrieval policy tests, PDF upload/integration checks, and E2E/workflow coverage for the real assessment PDF endpoint path.
- Deployment validation: AWS/deployed smoke should assert semantic endpoint output, not only HTTP health and shell availability.
