## Context

DocuLens AI is a challenge-focused full-stack AI document assistant. The assessment values an end-to-end runnable application, clear AI boundaries, provider abstraction, prompt safety, persistence, authentication, reliability checks, and AWS infrastructure. The implementation must avoid architecture theater: local demo behavior, live MiniMax proof, and eval/test evidence are the primary evidence, while AWS Terraform proves deployment judgment with a small bounded demo stack.

The product path is: authenticated user logs in, submits Markdown/text content, the backend stores data in PostgreSQL, normalizes and chunks the document, MiniMax M3 generates structured document analysis, user questions are answered through RAG using retrieved chunks, fallback is used only through a deterministic policy, and the UI exposes citations plus AI metadata. PDF support is demonstrated through a MarkItDown conversion script unless upload hardening is fully implemented.

## Goals / Non-Goals

**Goals:**
- Deliver a runnable local demo with seeded user, seeded NDA document, PostgreSQL persistence, structured analysis, RAG chat, citations, retrieved chunk visibility, and eval checks.
- Keep user-facing chat RAG-first: answers must be grounded in retrieved chunks and cite valid chunk identifiers.
- Define deterministic retrieval coverage and fallback routing so full-document MiniMax reasoning cannot silently replace RAG.
- Use MiniMax M3 deliberately for full-document analysis and explicit fallback/global reasoning, not as a replacement for retrieval.
- Use the provided MiniMax M3 API key for real analysis/chat smoke verification instead of treating mock mode as the proof path.
- Persist enough data for auditability: documents, chunks, analyses, messages, citations, prompt versions, model/provider metadata, context strategy, fallback reason, retrieval score summary, and token estimates.
- Enforce owner-scoped access for every document, analysis, chunk, message, citation, and delete/cascade path.
- Include a tiny Terraform stack that validates and can be applied in an AWS demo account with bounded cost defaults.
- Document setup, architecture, RAG trade-offs, MiniMax configuration, security/data policy, eval strategy, AWS demo stack, cost/destroy guidance, and production gaps.
- Add live MiniMax budget/rate gates, external AI transfer disclosure, log/secret redaction tests, and PostgreSQL integrity tests so security claims are executable rather than README-only.
- Add a test pyramid with focused unit tests for deterministic utilities, integration tests for API/database/authz behavior, Playwright E2E tests that use a canonical `data-testid` matrix, MarkItDown smoke validation, and prompt-injection eval coverage.

**Non-Goals:**
- Billing, admin panels, organization hierarchy, or multi-tenant role systems beyond owner-scoped documents.
- Streaming responses unless every required path already works.
- Advanced OCR or robust PDF upload; MarkItDown script is the safe default.
- Full production Terraform hardening such as private subnets with NAT, WAF, ACM/domain automation, autoscaling policies, remote state, and secret rotation workflows.
- A large evaluation platform; targeted smoke/eval checks are required.
- A polished visual design at the expense of proof and reliability.

## Decisions

### 1. Use PostgreSQL as the canonical persistence target

Local development, integration tests, evals, and AWS deployment will all use PostgreSQL-compatible persistence. Local setup should use Docker Compose or a local PostgreSQL service. AWS uses RDS PostgreSQL. This prevents SQLite-vs-RDS drift in migrations, SQL semantics, environment variables, and deployment configuration.

Alternatives considered:
- SQLite local path: fastest setup, but diverges from RDS PostgreSQL and weakens AWS credibility.
- Database adapter supporting SQLite and PostgreSQL: flexible, but unnecessary scope for the assessment.

### 2. Use RAG-first chat with deterministic fallback policy

Normal chat requests retrieve top-k chunks through a `RetrievalProvider`, build a grounded prompt from those chunks, and require citations that map to retrieved chunk IDs. Initial document analysis uses the full normalized document because the task is synthesis over the complete text.

Fallback full-document reasoning is allowed only when a deterministic gate marks retrieval coverage as low or the question is explicitly global/synthetic. The response must persist `contextStrategy`, `fallbackReason`, `retrievalScoreSummary`, retrieved chunk IDs, uncertainty, and citation policy.

Default fallback gate:
- Use RAG when at least one retrieved chunk passes the configured relevance threshold and the question is answerable from local evidence.
- Use fallback only when no retrieved chunk passes the threshold, retrieval returns no meaningful evidence, or the question asks for whole-document synthesis/comparison.
- Refuse instead of fallback when the question is outside the document or asks for unsupported external facts.

Alternatives considered:
- Long-context-only chat: simpler, but weakens citation discipline and regression checks.
- Unspecified fallback: flexible, but allows overuse of full-document MiniMax and undermines RAG-first discipline.
- Pure vector RAG only: strong production target, but can increase setup risk for the assessment.

### 3. Hide retrieval behind a provider interface

The system will expose a `RetrievalProvider` interface with `retrieve(documentId, query, limit)`. The preferred assessment target is pgvector or hybrid retrieval backed by PostgreSQL so the RAG path demonstrates vector-store competence. Lexical retrieval is allowed only as a clearly labeled fallback when the embedding provider blocks implementation or credentials, and the README/eval output must disclose that fallback. The UI and evals must prove top-k retrieval, visible retrieved chunks, valid citations, unsupported-answer behavior, fallback routing, and which retrieval backend was used.

Alternatives considered:
- Hard-code lexical retrieval into the chat endpoint: faster initially, but weaker for this challenge and not acceptable unless embedding provider blocks.
- Require vector-only retrieval with no fallback: stronger signal, but brittle if embeddings/provider setup fails late.

### 4. Make MiniMaxProvider the required live AI integration

An `AIProvider` interface will separate prompt construction, model invocation, and response post-processing, but the assessment proof path will use `AI_PROVIDER=minimax` with the provided MiniMax M3 API key. Live MiniMax calls must be used for final AI smoke verification, with secrets redacted from logs and README output. All responses will include provider/model metadata, prompt ID/version, thinking mode, context strategy, retrieved chunk IDs, fallback reason when applicable, and token estimates when available.

Alternatives considered:
- MockProvider as primary proof: reviewer-safe, but weaker now that a MiniMax M3 API key is available.
- Call MiniMax directly from endpoints: faster but violates the assessment’s provider-boundary and separation requirements.

### 5. Gate live MiniMax calls and disclose third-party document transfer

Live MiniMax usage must be explicit and budgeted. Commands that call MiniMax must enforce configurable limits for max live calls per command, max input/output tokens, max full-document context size, request timeout, retry/backoff count, concurrency, and per-run estimated cost. When a budget would be exceeded, the system must fail closed before calling MiniMax and return a clear budget/rate-limit error.

Because MiniMax receives document text, retrieved chunks, and full-document context for analysis/fallback, the README and UI must disclose that live AI mode sends document content to a third-party provider. Demo instructions must state that sample inputs should be non-sensitive. Logs, eval output, and screenshots must expose only IDs and metadata, not raw document text or full prompts.

Alternatives considered:
- Let every eval/E2E path call MiniMax freely: simpler, but creates quota, cost, and throttling risk.
- Hide third-party transfer in docs only: insufficient for a document assistant handling potentially sensitive content.

### 6. Keep secrets and logs redacted across local, eval, and AWS paths

The app must centralize redaction for `MINIMAX_API_KEY`, `JWT_SECRET`, `DATABASE_URL`, `PGPASSWORD`, authorization headers, database connection strings, provider prompts/responses, and sentinel document text. `.env.example` must contain placeholders only. The app must reject weak/default `JWT_SECRET` values outside explicit test mode. Terraform must not manage plaintext secret values in state; it should create secret containers/ARNs or consume externally populated secret ARNs, and state/plan files must be ignored and reviewed for secret material.

Alternatives considered:
- Rely on `sensitive = true`: insufficient because Terraform state can still contain secret values.
- Redact only API keys/JWTs: insufficient because document text, full prompts, `DATABASE_URL`, and provider responses can also expose sensitive data.

### 7. Test PostgreSQL integrity and retention invariants

PostgreSQL schema tests must cover foreign keys, ownership columns, unique chunk IDs per document, citation-to-message/chunk relationships constrained to the same document, migration/reset idempotency, transaction rollback on partial ingestion failure, and delete/soft-delete behavior. The retention decision for documents must be explicit: local assessment can use hard delete or soft delete, but tests must prove child resources are not readable after deletion.

Alternatives considered:
- API-only tests: good for behavior, but can miss orphan rows and cross-document references.
- Deferring retention behavior to README: too ambiguous for child-resource exposure risk.


### 8. Use owner-scoped JWT authorization on documents and child resources

Authentication will use JWTs with expiry and hashed passwords. All document-related queries must authorize through current user ownership of the parent document. This includes document CRUD, analysis creation/read, chat/messages, retrieved chunks, citations, and delete/cascade paths. Cross-user access must return 404/403 and must not expose document text, chunks, AI metadata, citations, or message content.

Alternatives considered:
- Scope only direct document queries: insufficient because child resources can leak document content.
- Complex roles/orgs: unnecessary scope.

### 9. Make prompt-injection resistance executable

Document content is untrusted evidence. Prompts must delimit document/chunk text and explicitly forbid following instructions inside documents. Eval and tests must include an adversarial document section or question that attempts to override instructions, reveal hidden prompts/secrets, or forge citations.

Alternatives considered:
- README-only prompt injection discussion: too weak for an AI assessment.
- Broad safety framework: unnecessary; the required proof is grounded answer + validated citation behavior.

### 10. Keep UI focused and define canonical test IDs

React will expose login, document input, and analysis/chat routes/views. The analysis/chat view will show summary, risks/entities/obligations, chat input, answer citations, retrieved chunks, loading/error/empty states, unsupported-answer state, and an AI transparency panel.

Canonical `data-testid` matrix:
- `auth.email-input`
- `auth.password-input`
- `auth.login-submit`
- `document.title-input`
- `document.content-input`
- `document.submit`
- `document.analyze`
- `analysis.panel`
- `analysis.summary`
- `chat.input`
- `chat.submit`
- `chat.answer`
- `chat.citations`
- `chat.retrieved-chunks`
- `ai.metadata`
- `state.loading`
- `state.error`
- `state.empty`
- `answer.unsupported`

Alternatives considered:
- One page with panels: simpler, but may under-satisfy the “at least 2 pages” assessment requirement.
- Ad hoc `data-testid` names: technically works, but weakens reviewability and E2E stability.
- Accessibility/text locators only: useful for user semantics, but `data-testid` gives stable assessment-proof selectors for critical flows.

### 11. Demonstrate PDF ingestion with MarkItDown script first

The app path will accept Markdown/text directly. A script such as `scripts/convert_pdf.py` will convert a sample PDF to Markdown with MarkItDown. Final verification must run this conversion and prove the resulting Markdown can be normalized/chunked. AWS Lambda can be documented as a production extension for asynchronous PDF conversion, preferably packaged as a Lambda container image or layer because MarkItDown and PDF dependencies can be heavy. Web PDF upload or Lambda conversion is optional and must include file type allowlist, size limits, safe object/temp paths, conversion timeout, poor-extraction fallback, and log redaction if implemented.

Alternatives considered:
- Full upload pipeline: higher demo risk and more security work.
- Lambda MarkItDown conversion in the assessment build: credible AWS architecture, but adds packaging, timeout, payload/storage, and IAM complexity; keep as documented extension unless the script path is already complete.
- No PDF story: misses an easy AI-document credibility signal.

### 12. Use tiny Terraform for AWS demo account with bounded defaults

Terraform under `infra/aws` will define a short-lived demo stack: ECR app repository or explicit image URI contract, ECS Fargate service running one app container, public HTTP ALB, health endpoint, RDS PostgreSQL, Secrets Manager secrets, CloudWatch log group, IAM roles, and security groups. The demo stack must avoid NAT gateways and production-only networking. It will be documented as demo-grade, not production-ready.

Bounded defaults:
- ECS desired count: 1
- Smallest acceptable Fargate CPU/memory
- Single RDS instance, single-AZ, minimal storage
- `deletion_protection = false`
- `skip_final_snapshot = true`
- No NAT gateway in the demo stack
- README cost warning and destroy guidance next to apply instructions

Alternatives considered:
- README-only AWS sketch: insufficient because infrastructure definition is required.
- Full production VPC/ECS/RDS stack: too much scope for the challenge.
- Lambda/DynamoDB rewrite: smaller infra but forces app architecture away from the planned Node/Postgres path.

### 13. Use a small test pyramid with stable E2E locators

Implementation must run as a TDD loop, not as implementation-then-tests cleanup. For each vertical slice, write the failing unit/integration/eval/Playwright test that captures the requirement, run it to confirm red, implement the smallest code to pass, then refactor without weakening the assertion. Unit tests will cover pure logic such as chunking, lexical retrieval scoring, fallback decision, citation validation, prompt metadata helpers, schema parsing, and unsupported-answer decisions. Integration tests will exercise API routes with PostgreSQL test persistence for auth, owner scoping, child-resource authorization, document ingestion, analysis, chat, prompt-injection behavior, and eval-critical behavior. Playwright E2E tests will cover the happy path from login/document input through analysis/chat evidence display using canonical `data-testid` locators.

Alternatives considered:
- Only eval runner: proves AI demo contracts, but misses lower-level regressions and UI behavior.
- Snapshot-heavy E2E tests: brittle and low signal for this challenge.

### 14. Deliver by vertical PRs, not one PR per checkbox

Implementation will be split by reviewable capability slices. A PR must contain the behavior, the corresponding unit/integration/eval/Playwright/smoke proof, and any contract metadata/docs needed to review that behavior. Do not create PRs for schema-only, interface-only, type-only, UI skeleton-only, Terraform-variable-only, or README-claim-only changes unless they are attached to a working behavior.

Recommended PR sequence:

| PR | Branch | Scope | Primary tasks |
| --- | --- | --- | --- |
| 0 | `main` | TDD guardrails, pre-commit hook, CI guardrail, branch protection | Repository guardrails |
| 1 | `feat/doculens-foundation` | App scaffold, PostgreSQL contract, env/secrets contract, schema, migrations, seed, test scripts | 1.1-1.8 |
| 2 | `feat/doculens-auth` | Registration/login, JWT middleware, owner-scoped documents, child-resource authz, seeded users/documents | 2.1-2.6 |
| 3 | `feat/doculens-ingestion` | Markdown normalization, section-aware chunking, chunk persistence, PostgreSQL integrity | 3.1-3.3 plus relevant 7.11/7.12/7.16 tests |
| 4 | `feat/doculens-retrieval` | `RetrievalProvider`, pgvector/hybrid preferred target, labeled lexical fallback only if blocked, deterministic coverage/fallback metadata | 3.4-3.9 |
| 5 | `feat/doculens-minimax` | `AIProvider`, `MiniMaxProvider`, prompt IDs/versions, prompt safety, redaction, live-call budget gates, live smoke shape validation | 4.1-4.10 |
| 6 | `feat/doculens-chat-api` | Full-document analysis, RAG chat, citation validation, unsupported-answer behavior, fallback path, prompt-injection resistance | 5.1-5.8 |
| 7 | `feat/doculens-ui` | Login, document input, analysis/chat views, citations, retrieved chunks, AI metadata, canonical `data-testid` E2E path | 6.1-6.7 and 7.13 |
| 8 | `feat/doculens-eval` | Eval runner, seeded checks, retrieval/fallback/citation/unsupported/prompt-injection/authz/redaction/data-integrity proof | 7.1-7.16 gaps not already covered |
| 9 | `feat/doculens-markitdown` | MarkItDown sample conversion script, sample workflow, smoke check into ingestion/chunking | 8.1-8.3 |
| 10 | `feat/doculens-aws-demo` | Docker/container path, ALB health, Terraform ECS/RDS/Secrets/CloudWatch, bounded defaults, validation/apply/destroy docs | 9.1-9.11 |
| 11 | `docs/doculens-final-readme` | Final README, verification evidence, production gaps, data/cost/rate/AWS/MiniMax disclosures | 8.4-8.9 and 10.1-10.9 |

Commit cadence inside each PR must preserve TDD evidence without fighting the guardrail: write the failing check locally, observe red, implement the smallest passing behavior, observe green, then commit the test and implementation together as one coherent green behavior. Test-only commits are acceptable; implementation-only commits are not.

PRs may run in parallel only after their upstream contracts are stable. Auth, ownership, retrieval/fallback, MiniMax safety, analysis/chat citations, and eval proof should not be compressed away because they are the assessment scoring spine.

## Risks / Trade-offs

- [Risk] Lexical retrieval may look like fake RAG. → Mitigation: keep it behind `RetrievalProvider`, expose retrieved chunks, validate citations, test fallback/refusal paths, and document pgvector/hybrid search as production backing.
- [Risk] MiniMax live calls add credential, cost, rate-limit, nondeterminism, and third-party document-transfer risk. → Mitigation: enforce max live calls/tokens/timeouts/retries/concurrency/cost per command, require explicit live opt-in/disclosure, redact secrets/document text, validate structure/citations instead of exact prose, and document the observed live-smoke result.
- [Risk] Child resources can leak document content. → Mitigation: authorize every analysis/message/chunk/citation/delete path through parent document ownership and test cross-user denial.
- [Risk] Prompt injection can bypass documentation-only guardrails. → Mitigation: add adversarial seeded content and executable eval/integration checks.
- [Risk] Terraform can consume the implementation window or create cost risk. → Mitigation: keep AWS to one app service, one RDS instance, no NAT gateway, Secrets Manager, CloudWatch, validation commands, cost warning, and destroy-safe defaults.
- [Risk] PDF upload can become a security sink. → Mitigation: prefer MarkItDown script and smoke-check it; implement upload only with all controls.
- [Risk] AI answers can fabricate citations. → Mitigation: post-process and reject/mark invalid any answer whose citations do not map to retrieved chunks.
- [Risk] Sensitive document text may leak into logs. → Mitigation: structured logs must record IDs/metadata only, not raw document bodies, full prompts, API keys, or JWTs.
- [Risk] Terraform state can contain secret values even when variables are marked sensitive. → Mitigation: create or reference secret containers/ARNs without managing secret string values in Terraform, ignore state/plan artifacts, and add a secret-state review checklist.
- [Risk] PostgreSQL can accept orphaned or cross-document child records if constraints are weak. → Mitigation: add foreign keys, same-document constraints, unique chunk IDs per document, transactional ingestion, and delete/soft-delete integrity tests.
- [Risk] App may pass happy path but miss assessment requirements. → Mitigation: README, unit tests, integration tests, Playwright E2E tests, MarkItDown smoke, Terraform validation, and eval runner must explicitly cover auth, provider abstraction, prompt versioning, security, data policy, reliability, UI evidence display, and AWS infra validation.

## Migration Plan

1. Scaffold the app, PostgreSQL schema, migrations, environment configuration, provider boundaries, and retrieval/fallback boundaries.
2. Implement auth, owner-scoped documents and child resources, seeded demo data, chunking, retrieval, MiniMax provider, analysis, chat, citation validation, prompt-injection guardrails, and UI flows.
3. Add eval runner with live MiniMax M3 smoke verification, prompt-injection eval, fallback/refusal checks, and child-resource authz checks.
4. Run each implementation slice through TDD: create the failing unit/integration/eval/Playwright test first, implement the smallest passing code, then refactor while preserving the test.
5. Add MarkItDown conversion script, smoke validation, and README documentation.
6. Add Docker/container packaging and health endpoint for Terraform deployment.
7. Add tiny Terraform stack with bounded defaults and validate with `terraform fmt -check`, `terraform validate`, and documented plan/apply/destroy commands.
8. Optionally apply in the AWS demo account, capture ALB URL/output, verify health, then destroy after review.

Rollback for local implementation is normal code rollback. Rollback for AWS demo is `terraform destroy`; the demo RDS instance must disable deletion protection and skip final snapshot only because this is disposable assessment infrastructure.

## Open Questions

- Will the AWS demo account allow ECS, ALB, RDS, ECR, Secrets Manager, IAM role creation, and CloudWatch logs within expected cost limits?
- What exact AWS service quotas and account cost ceiling apply to the demo account?
