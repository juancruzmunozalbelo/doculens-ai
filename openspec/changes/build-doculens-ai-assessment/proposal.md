## Why

The assessment requires a credible full-stack AI application that demonstrates practical engineering judgment, live AI provider integration, data handling, security, reliability, and AWS infrastructure. DocuLens AI will turn the existing plan into a runnable document assistant where user-facing answers are grounded by RAG, MiniMax M3 is used deliberately for document-level reasoning, and a tiny Terraform stack proves AWS deployment thinking without overbuilding.

## What Changes

- Build a React + Node.js document assistant with JWT authentication, PostgreSQL persistence, owner-scoped documents and child resources, seeded demo data, structured document analysis, and RAG-backed chat.
- Add document ingestion for Markdown/text with section-aware chunking, stable chunk identifiers, retrieved chunk visibility, pgvector/hybrid retrieval as the preferred target, lexical retrieval only as a labeled fallback if the embedding provider blocks, deterministic retrieval coverage policy, fallback reason metadata, and citation validation.
- Add AI provider abstraction with `MiniMaxProvider` as the required live integration using the provided MiniMax M3 API key.
- Add executable reliability and security coverage: focused unit tests for pure AI/RAG utilities, integration tests for API/database/authz/data-integrity flows, Playwright end-to-end tests using a canonical `data-testid` locator matrix, prompt-injection eval, log/secret redaction tests, MiniMax budget gates, MarkItDown smoke check, and live MiniMax eval checks.
- Add a focused React UX with separate login, document input, and analysis/chat views, including loading/error/empty states, citations, retrieved chunks, unsupported-answer display, and model/context metadata.
- Add a MarkItDown PDF conversion script as the safe default for PDF ingestion proof; document AWS Lambda/container-image conversion as an optional production extension, while web PDF upload remains optional unless all upload controls are implemented.
- Add a tiny AWS demo Terraform stack for the challenge account: buildable app container, ECS Fargate service, public ALB, health endpoint, RDS PostgreSQL, Secrets Manager, CloudWatch logs, bounded cost defaults, and least-necessary security groups.
- Add README coverage for setup, architecture, RAG design, MiniMax M3 usage, evaluation, security/data policy, AWS demo deployment, cost/destroy guidance, trade-offs, and known limitations.

## Capabilities

### New Capabilities
- `document-ai-assistant`: End-to-end authenticated document assistant behavior, including PostgreSQL persistence, document ingestion, RAG retrieval/fallback, MiniMax M3 analysis/chat, citations, child-resource authorization, provider metadata, and UI flows.
- `ai-reliability-evals`: Executable reliability checks covering unit tests, integration tests, Playwright E2E tests with canonical `data-testid` locators, live MiniMax eval, prompt-injection resistance, MarkItDown smoke validation, retrieval/fallback routing, structured analysis, citation validity, unsupported-answer behavior, prompt metadata, and owner-scoped access.
- `aws-demo-infrastructure`: Minimal Terraform-defined AWS demo infrastructure for deploying the app container with managed secrets, logging, PostgreSQL database access, bounded demo cost defaults, health checks, and validation commands.

### Modified Capabilities
- None.

## Impact

- Backend: REST auth, document, analysis, chat, AI provider, retrieval, fallback routing, chunking, PostgreSQL persistence, and eval code paths.
- Frontend: React login/document input/analysis-chat routes with AI-aware transparency, stable `data-testid` locators, and error/loading/empty/unsupported states.
- Database: PostgreSQL schema for users, documents, chunks, analyses, messages, citations, prompt/model metadata, token estimates, and ownership relationships.
- AI/provider integration: MiniMax M3 configuration, live API-key based invocation, prompt construction, model invocation, response parsing, citation validation, prompt-injection guardrails, explicit external-AI disclosure, live-call budget gates, redacted logs, and live smoke verification.
- Tooling: demo seed command, eval command, unit/integration test commands, Playwright E2E command, canonical test-id matrix, MarkItDown smoke command, Docker/container build path, and Terraform validation/apply/destroy commands.
- Infrastructure: Terraform under `infra/aws` for ECR, ECS Fargate, ALB, RDS PostgreSQL, Secrets Manager, CloudWatch, IAM, cost-capped defaults, health checks, and security groups.
- Documentation: README with local demo contract, AWS demo contract, security/data policy, cost/rate-limit strategy, Lambda MarkItDown extension, and production trade-offs.
