## 1. Project Setup

- [x] 1.1 Scaffold React + Node.js app structure with shared configuration and documented local commands
- [x] 1.2 Add PostgreSQL local development configuration and shared `DATABASE_URL` contract for local, tests, and AWS
- [x] 1.3 Add environment configuration for MiniMax provider without committing secrets
- [x] 1.4 Define PostgreSQL schema for users, documents, chunks, analyses, messages, citations, prompt metadata, token estimates, fallback metadata, and ownership relationships
- [x] 1.5 Add migration, reset, and seed commands for the PostgreSQL demo workflow
- [x] 1.6 Add exact test scripts for unit, integration, Playwright E2E, MarkItDown smoke, eval, and combined verification commands
- [x] 1.7 Add placeholder-only `.env.example`, centralized secret redaction utility, and runtime rejection of weak/default `JWT_SECRET` outside explicit test mode
- [x] 1.8 Configure the implementation loop to follow TDD for every slice: write or update the failing unit/integration/eval/Playwright/smoke check first, observe red, implement, then refactor while keeping the check green

## 2. Authentication and Ownership

- [x] 2.1 Implement user registration and login with hashed passwords and expiring JWTs
- [x] 2.2 Add authenticated middleware and current-user context for backend routes
- [x] 2.3 Implement owner-scoped document create, list, read, and delete endpoints
- [x] 2.4 Ensure document CRUD queries include both resource ID and current user ID
- [x] 2.5 Ensure analysis, chat/message, retrieved chunk, citation, and delete/cascade queries authorize through parent document ownership
- [x] 2.6 Add seeded demo user, second authz-test user, seeded NDA document, and adversarial prompt-injection document section

## 3. Ingestion, Chunking, Retrieval, and Fallback

- [x] 3.1 Implement Markdown/text normalization for submitted document content
- [x] 3.2 Implement section-aware chunking with stable chunk IDs, heading paths, chunk indexes, and token estimates
- [x] 3.3 Persist chunks linked to owner-scoped documents in PostgreSQL
- [x] 3.4 Define `RetrievalProvider` and retrieved chunk response shape with retrieval backend metadata
- [ ] 3.5 Implement pgvector or hybrid retrieval as the preferred target, including embedding generation/storage path when provider credentials are available
- [x] 3.6 Implement lexical retrieval only as a labeled `lexical_fallback` if the embedding provider blocks implementation or credentials
- [x] 3.7 Define deterministic retrieval coverage policy with relevance threshold, low-coverage reason, global-question trigger, and retrieval backend label
- [x] 3.8 Implement fallback decision function returning `rag`, `fallback`, or `unsupported` with fallback reason and retrieval score summary
- [ ] 3.9 Expose retrieved chunks, retrieval backend, context strategy, fallback reason, and retrieval score summary through chat response and UI metadata

## 4. AI Provider and Prompting

- [x] 4.1 Define `AIProvider` interface separating prompt construction, model invocation, and response post-processing
- [x] 4.2 Implement prompt IDs and prompt versions for analysis, chat, fallback, unsupported-answer checks, and prompt-injection guardrails
- [x] 4.3 Implement `MiniMaxProvider` using configured base URL, API key, and `MiniMax-M3` model
- [x] 4.4 Add live MiniMax smoke command or test that invokes MiniMax M3 with redacted logs and validates response shape, provider metadata, model metadata, and error handling
- [x] 4.5 Add prompt-injection guardrails treating document content as untrusted evidence only
- [x] 4.6 Ensure prompt construction delimits untrusted document/chunk text and never includes API keys, JWTs, or plaintext secrets
- [x] 4.7 Record provider, model, prompt version, context strategy, thinking mode, retrieved chunk IDs, fallback reason, retrieval score summary, and token estimates in AI responses
- [x] 4.8 Add MiniMax live-call budget gate for max calls per command, max input/output tokens, max context tokens, timeout, retry/backoff cap, concurrency limit, and per-run estimated cost
- [x] 4.9 Add explicit live MiniMax opt-in/disclosure for analysis, chat, fallback, eval, and E2E paths, including maximum document/context size rules
- [x] 4.10 Add centralized redaction for MiniMax API keys, JWT secrets, database URLs/passwords, authorization headers, raw document text, full prompts, provider responses, and stack traces

## 5. Analysis and Chat Behavior

- [x] 5.1 Implement document analysis endpoint using full-document MiniMax context and structured JSON output
- [x] 5.2 Validate and persist structured analysis with summary, entities, obligations, risks, uncertainties, and provider/model metadata
- [x] 5.3 Implement chat endpoint that retrieves chunks before model invocation for normal questions
- [x] 5.4 Build grounded chat prompt from retrieved chunks and require chunk-based citations for RAG answers
- [x] 5.5 Validate citations against retrieved chunk IDs and reject or mark invalid fabricated citations
- [x] 5.6 Implement unsupported-answer behavior for questions without document support
- [x] 5.7 Implement explicit fallback path for low retrieval coverage or global reasoning questions with fallback metadata and uncertainty
- [x] 5.8 Ensure prompt-injection attempts in document content cannot override system instructions, reveal secrets, or forge citations

## 6. Frontend Experience

- [x] 6.1 Implement login route or view for seeded and registered users
- [x] 6.2 Implement document input route or view with authenticated submit flow and loading, error, and empty states
- [x] 6.3 Implement analysis/chat route or view for a selected document
- [x] 6.4 Display structured analysis fields including summary, entities, obligations, risks, and uncertainties
- [x] 6.5 Add chat input, answer rendering, citation display, unsupported-answer display, and fallback/uncertainty display
- [x] 6.6 Display retrieved chunks and AI transparency metadata including model, provider, context strategy, prompt version, thinking mode, retrieved chunk IDs, fallback reason, retrieval score summary, and token estimates
- [x] 6.7 Add canonical `data-testid` attributes: `auth.email-input`, `auth.password-input`, `auth.login-submit`, `document.title-input`, `document.content-input`, `document.submit`, `document.analyze`, `analysis.panel`, `analysis.summary`, `chat.input`, `chat.submit`, `chat.answer`, `chat.citations`, `chat.retrieved-chunks`, `ai.metadata`, `state.loading`, `state.error`, `state.empty`, and `answer.unsupported`

## 7. Evaluation and Security Proof

- [ ] 7.1 Implement `npm run eval` runner using PostgreSQL and MiniMax provider mode with configured `MINIMAX_API_KEY`
- [ ] 7.2 Eval seeded user, second user, seeded document, adversarial section, and chunk creation
- [ ] 7.3 Eval retrieval returns top-k chunks for a supported seeded question and records context strategy `rag`
- [ ] 7.4 Eval fallback question records context strategy `fallback`, fallback reason, retrieval score summary, uncertainty, and citation policy
- [ ] 7.5 Eval structured analysis schema validity and MiniMax provider/model metadata
- [ ] 7.6 Eval chat citations map only to retrieved chunk IDs
- [ ] 7.7 Eval unsupported seeded question returns refusal or unsupported response without fabricated citations
- [ ] 7.8 Eval prompt-injection attempt is ignored, citations remain valid, and no hidden prompt, API key, JWT, or secret is exposed
- [ ] 7.9 Eval second user cannot access seeded user's document, analysis, messages, chunks, citations, chat endpoint, or delete path
- [ ] 7.10 Ensure eval output prints concise pass/fail lines and exits non-zero on failure
- [ ] 7.11 Add focused unit tests for chunking, retrieval scoring, fallback decision logic, citation validation, prompt metadata, prompt construction guardrails, schema parsing, and unsupported-answer decisions
- [ ] 7.12 Add integration tests for auth, owner-scoped documents, child-resource denial, ingestion, analysis, chat, fallback/refusal routing, prompt-injection guardrail behavior, and cross-user denial using PostgreSQL
- [ ] 7.13 Add Playwright E2E test for login/document input/analysis/chat/citations/retrieved chunks/unsupported-answer/AI metadata using only canonical `data-testid` locators
- [ ] 7.14 Add MiniMax budget/rate-limit tests proving over-budget requests skip provider invocation and eval prints call/token totals
- [ ] 7.15 Add secret/document redaction canary tests covering stdout, stderr, app logs, eval output, error responses, and provider error logs
- [ ] 7.16 Add PostgreSQL integrity tests for foreign keys, unique chunk IDs per document, same-document citation/message/chunk relationships, orphan rejection, delete/soft-delete visibility, transaction rollback, and migration/reset idempotency

## 8. MarkItDown and Documentation

- [ ] 8.1 Add MarkItDown PDF conversion script for sample PDF to Markdown conversion
- [ ] 8.2 Add sample PDF or documented sample path and generated Markdown workflow
- [ ] 8.3 Add MarkItDown smoke command that converts the sample PDF and verifies converted Markdown creates chunks
- [ ] 8.4 Document local quick start, PostgreSQL setup, demo seed, eval, and MiniMax configuration
- [ ] 8.5 Document architecture, RAG design, fallback policy, MiniMax M3 design, prompt-injection rules, citation validation, and unsupported-answer behavior
- [ ] 8.6 Document canonical Playwright `data-testid` matrix
- [ ] 8.7 Document data retention, PII/logging policy, audit metadata, cost/rate-limit strategy, and known limitations
- [ ] 8.8 Document optional AWS Lambda/container-image MarkItDown conversion path, including S3 object flow, timeout, size limit, IAM, packaging, and log-redaction considerations
- [ ] 8.9 Document third-party MiniMax data transfer disclosure, non-sensitive demo input guidance, live AI opt-in, provider retention/training assumptions or unknowns, and maximum document/context size limits

## 9. AWS Demo Infrastructure

- [ ] 9.1 Add Dockerfile/container build path for one app container serving the React build and Node API
- [ ] 9.2 Add app health endpoint for ALB target checks
- [ ] 9.3 Add Terraform provider, variables, outputs, and README under `infra/aws`
- [ ] 9.4 Add Terraform resources for ECR or explicit `image_uri` contract, ECS cluster, Fargate task/service, public ALB, target group, listener, and health check
- [ ] 9.5 Add Terraform resources for RDS PostgreSQL with security group access restricted to the app service
- [ ] 9.6 Add Terraform resources for Secrets Manager, IAM task execution role, and CloudWatch log group
- [ ] 9.7 Ensure Terraform uses sensitive variables or secret bindings and does not require committed plaintext secrets
- [ ] 9.8 Ensure Terraform creates/references secret containers or external secret ARNs without managing `secret_string` values or plaintext secrets in Terraform state
- [ ] 9.9 Set bounded demo defaults: ECS desired count 1, small Fargate CPU/memory, minimal single-AZ RDS/storage, no NAT gateway, deletion protection false, and skip final snapshot true
- [ ] 9.10 Add Terraform validation, plan review, optional apply, ALB health smoke, destroy, cleanup verification, and estimated cost instructions for the AWS demo account
- [ ] 9.11 Run or document `terraform fmt -check`, `terraform validate`, and expected plan shape results

## 10. Final Verification

- [ ] 10.1 Run local setup from README commands on a clean environment path with PostgreSQL
- [ ] 10.2 Run migrations/reset and `npm run demo:seed`; verify seeded users, seeded document, adversarial section, and chunks exist
- [ ] 10.3 Run `AI_PROVIDER=minimax npm run eval` with the configured MiniMax M3 API key and verify all required checks pass
- [ ] 10.4 Run unit, integration, and Playwright E2E test commands and verify they pass
- [ ] 10.5 Run MarkItDown smoke command and verify converted Markdown creates chunks
- [ ] 10.6 Smoke test React login, document input, analysis/chat, citations, retrieved chunks, unsupported-answer, and AI metadata manually
- [ ] 10.7 Smoke test MiniMax provider with the real API key, redacted logs, response-shape validation, and model/provider metadata verification
- [ ] 10.8 Run or document Terraform validation and plan shape; optionally apply in AWS demo account, verify ALB health URL, then destroy
- [ ] 10.9 Verify README accurately distinguishes implemented behavior, demo-grade AWS infrastructure, optional Lambda MarkItDown extension, costs, destroy guidance, and production gaps

## 11. PR Delivery Guardrails

- [ ] 11.1 Keep PR 0 as the committed TDD guardrail baseline: local pre-commit hook, GitHub Actions guardrail, and protected `main` requiring the `guardrails` status check
- [ ] 11.2 Deliver PR 1 on `feat/doculens-foundation` for project setup tasks 1.1-1.8 with PostgreSQL, env/secrets, schema, migrations, seed, and test command proof
- [ ] 11.3 Deliver PR 2 on `feat/doculens-auth` for authentication and ownership tasks 2.1-2.6 with cross-user denial and child-resource authorization tests
- [x] 11.4 Deliver PR 3 on `feat/doculens-ingestion` for ingestion/chunking tasks 3.1-3.3 with chunking, rollback, ownership, and PostgreSQL integrity tests
- [ ] 11.5 Deliver PR 4 on `feat/doculens-retrieval` for retrieval/fallback tasks 3.4-3.9 with pgvector/hybrid preferred, labeled `lexical_fallback` only if blocked, backend metadata, and fallback policy tests
- [x] 11.6 Deliver PR 5 on `feat/doculens-minimax` for AI provider and prompt safety tasks 4.1-4.10 with MiniMax live-smoke shape validation, budget gates, prompt-injection guardrails, and redaction canaries
- [x] 11.7 Deliver PR 6 on `feat/doculens-chat-api` for analysis/chat tasks 5.1-5.8 with structured analysis, RAG citations, unsupported-answer behavior, fallback metadata, and prompt-injection eval proof
- [x] 11.8 Deliver PR 7 on `feat/doculens-ui` for frontend tasks 6.1-6.7 with Playwright E2E using only canonical `data-testid` locators
- [ ] 11.9 Deliver PR 8 on `feat/doculens-eval` for eval/security proof tasks 7.1-7.16 gaps, including retrieval, fallback, citations, unsupported answers, prompt injection, authz, redaction, budget, and PostgreSQL integrity checks
- [ ] 11.10 Deliver PR 9 on `feat/doculens-markitdown` for MarkItDown tasks 8.1-8.3 with sample PDF-to-Markdown smoke proof into the ingestion/chunking pipeline
- [ ] 11.11 Deliver PR 10 on `feat/doculens-aws-demo` for AWS tasks 9.1-9.11 with Terraform validation, bounded cost defaults, secret-state safety, ALB health contract, and destroy guidance
- [ ] 11.12 Deliver PR 11 on `docs/doculens-final-readme` for documentation and final verification tasks 8.4-8.9 and 10.1-10.9, ensuring README claims match observed behavior
- [ ] 11.13 For every implementation PR, write or update the failing unit/integration/eval/Playwright/smoke check first, observe red locally, implement the smallest passing behavior, observe green, and commit test plus implementation together as a coherent green behavior
- [ ] 11.14 Do not open schema-only, interface-only, type-only, UI skeleton-only, Terraform-variable-only, or README-claim-only PRs unless the PR also includes the behavior and verification that make the change reviewable
