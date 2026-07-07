# DocuLens AI

DocuLens AI is a full-stack AI document assistant for the Full Stack AI Engineer assessment. It provides an authenticated document workspace where users submit Markdown/text documents, receive structured document analysis, and ask RAG-grounded questions with citations, retrieved chunk visibility, fallback metadata, and explicit unsupported-answer behavior.

This repository is public. Do not commit real secrets, `.env` files, Terraform state/plans, AWS credentials, MiniMax keys, JWT secrets, database passwords, raw sensitive document samples, or local harness folders.

## Current implementation status

Implemented and merged:

- React + Node app scaffold with Vite.
- JWT authentication, hashed passwords, expiring tokens, and owner-scoped document APIs.
- Child-resource authorization for analysis, messages, chunks, citations, and delete/cascade paths.
- PostgreSQL schema, reset/migration/seed scripts, and integrity checks.
- Markdown/text normalization, section-aware chunking, stable chunk IDs, token estimates, and chunk persistence.
- `RetrievalProvider` with deterministic hybrid-style retrieval metadata and explicit `lexical_fallback` labeling when fallback retrieval is used.
- `AIProvider` abstraction and `MiniMaxProvider` for MiniMax M3-compatible calls.
- Prompt registry, prompt safety wrappers, delimiter escaping, prompt-injection resistance, provider budget gates, and centralized redaction.
- Full-document analysis endpoint and RAG-first chat endpoint.
- Citation validation: normal RAG answers cite only retrieved chunk IDs.
- Unsupported-answer path for out-of-document questions.
- Fallback path for low-coverage/global document synthesis with auditable fallback reason and uncertainty metadata.
- React UI for login, document submit/list, analysis, chat, citations, retrieved chunks, loading/error/empty states, and AI metadata.
- Canonical Playwright `data-testid` coverage.
- Eval runner and regression tests for retrieval, fallback, citations, unsupported answers, authz, prompt injection, redaction, budget, and PostgreSQL integrity.
- MarkItDown sample PDF conversion smoke path into the ingestion/chunking pipeline.
- Local Docker Compose path for frontend, backend, and PostgreSQL.
- One-container AWS app image path plus Terraform demo stack for ECS Fargate, ALB, RDS PostgreSQL, Secrets Manager, CloudWatch, IAM, and security groups.

Not claimed as completed in this environment:

- Live MiniMax network call with a real `MINIMAX_API_KEY`. The code path and live-smoke gate exist, but the key was unavailable locally; live checks fail closed unless explicitly opted in.
- Optional AWS `terraform apply` and ALB health smoke. Terraform validation and plan shape were run against configured AWS credentials; apply requires a pushed DocuLens image and externally populated secret values.

## Architecture

```mermaid
flowchart TD
  U[Reviewer browser] --> UI[React UI]
  UI --> API[Node API]
  API --> AUTH[Auth/JWT middleware]
  AUTH --> DOCS[Document service]
  DOCS --> PG[(PostgreSQL)]
  DOCS --> N[Markdown/text normalization]
  N --> C[Section-aware chunking]
  C --> PG
  API --> R[RetrievalProvider]
  R --> PG
  R --> G{Coverage policy}
  G -->|sufficient local evidence| RAG[RAG prompt with retrieved chunks]
  G -->|low/global synthesis| FB[Controlled fallback prompt]
  G -->|outside document| UNSUP[Unsupported answer]
  RAG --> MM[MiniMaxProvider / MiniMax M3]
  FB --> MM
  API --> ANA[Full-document analysis]
  ANA --> MM
  MM --> OUT[Analysis/chat JSON + metadata]
  OUT --> CIT[Citation validator]
  CIT --> UI
  PDF[Sample PDF] --> MID[MarkItDown script]
  MID --> N
```

### Backend boundaries

- `apps/api/src/server/index.mjs` owns HTTP routing, `/health`, JSON body limits, auth wrapping, static asset serving via `DOCULENS_STATIC_DIR`, and safe error responses.
- `apps/api/src/server/auth/` owns password hashing, registration/login, JWT issue/verification, and current-user resolution.
- `apps/api/src/server/documents/` owns owner-scoped document APIs and child-resource authorization.
- `apps/api/src/server/ingestion/` owns normalization, chunking, and chunk repository contracts.
- `apps/api/src/server/retrieval/` owns top-k retrieval, backend metadata, score summaries, coverage strategy, fallback reasons, and unsupported classification.
- `apps/api/src/server/ai/` owns provider abstraction and MiniMax M3 transport/budget behavior.
- `apps/api/src/server/chat/` owns analysis/chat orchestration, prompt construction, citation validation, and persisted metadata.
- `apps/api/src/server/security/redact.mjs` owns centralized redaction for API keys, JWTs, database URLs/passwords, authorization headers, raw document text, prompts, provider responses, and stack traces.

### Persistence

PostgreSQL is the canonical persistence target. SQLite is not used.

Core persisted entities:

- users
- documents
- document chunks
- document analyses
- chat messages
- message citations
- AI prompt/provider metadata

The PostgreSQL integrity contract covers foreign keys, duplicate stable chunk IDs per document, same-document citation/message/chunk relationships, orphan rejection, soft-delete visibility for documents/chunks/citations, transaction rollback, and migration/reset idempotency.

## Local quick start

### Prerequisites

- Node.js 22+
- npm
- PostgreSQL 16+ or the included Docker Compose database service
- `psql` client for database scripts and live PostgreSQL integrity checks
- Optional: Docker / Docker Compose
- Optional: Terraform 1.6+ for AWS validation/plan/apply
- Optional: Microsoft MarkItDown CLI; the committed sample smoke uses a deterministic fallback for the tiny non-sensitive fixture when the local CLI is absent
- Optional: real MiniMax API key for live provider proof

### Install

```bash
npm ci
```

### Configure private environment

Use shell exports. The runtime scripts read `process.env` and do not automatically load `.env` files. If you keep values in a private `.env`, source it before running commands: `set -a; source .env; set +a`.

```bash
export AI_PROVIDER=minimax
export MINIMAX_API_KEY=<provided-out-of-band>
export MINIMAX_BASE_URL=https://api.minimax.io/v1
export MINIMAX_MODEL=MiniMax-M3
export JWT_SECRET=<strong-local-secret-at-least-32-chars>
export DATABASE_URL=postgresql://doculens:local-postgres@127.0.0.1:55433/doculens
```

For a local PostgreSQL container:

```bash
POSTGRES_PASSWORD=local-postgres POSTGRES_PORT=55433 docker-compose up -d db
export DATABASE_URL='postgresql://doculens:local-postgres@127.0.0.1:55433/doculens'
```

If `psql` is installed by Homebrew `libpq`, include it on PATH:

```bash
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
```

### Reset, migrate, and seed

```bash
npm run db:reset
npm run demo:seed
```

`demo:seed` aliases `db:seed`. The seed creates two users, one demo NDA document, document chunks, and an adversarial prompt-injection section.

### Run the app

Start the Node API:

```bash
npm run dev
```

Start the Vite UI in a second terminal:

```bash
npm exec vite -- --host 127.0.0.1 --port 5173
```

Default URLs:

- API health: `http://127.0.0.1:3000/health`
- Vite UI: `http://127.0.0.1:5173`

Seeded demo credentials are defined in `db/seeds/001_demo.sql`. Treat them as non-secret local demo data only.

## Commands

```bash
npm run dev                  # Start local Node API / dev path
npm run build                # Build React UI
npm run db:migrate           # Apply migrations
npm run db:reset             # Drop/recreate schema and apply migrations
npm run db:seed              # Seed demo data
npm run demo:seed            # Alias for db:seed
npm run test:unit            # Unit/contract coverage for AI, retrieval, chat, ingestion, config, redaction
npm run test:integration     # HTTP/authz/integration contracts
npm run test:e2e             # Playwright canonical UI flow
npm run test:eval            # Eval regression test suite
npm run test:docker          # Docker Compose contract
npm run test:aws             # AWS/Terraform model contract
npm run smoke:markitdown     # Sample PDF -> Markdown -> chunks smoke
npm run smoke:minimax        # Live MiniMax smoke, requires explicit opt-in and real key
npm run eval                 # Reviewer-readable eval PASS/SKIP/FAIL output
npm run verify               # Guardrail + foundation verification
npm run guard:tdd            # Staged TDD guardrail
```

## RAG, fallback, and unsupported behavior

Normal chat is RAG-first:

1. The server retrieves top-k chunks scoped to the current user and document.
2. The prompt builder wraps retrieved chunks as untrusted evidence.
3. MiniMax-facing prompts receive redaction canaries and delimiter escaping.
4. Normal answers must cite retrieved chunk IDs only.
5. Response metadata exposes safe fields: provider/model, prompt version, retrieval backend, context strategy, retrieved chunk IDs, fallback reason, score summary, uncertainty, token estimates, and budget data.

Fallback is explicit. Low-coverage or whole-document synthesis questions can use a controlled fallback strategy, but metadata records the fallback reason and uncertainty.

Unsupported answers are explicit. Out-of-document/current-facts questions refuse instead of silently fabricating citations or using unsupported model knowledge.

## Retrieval backend and fallback policy

The preferred target remains pgvector/hybrid retrieval. This assessment implementation uses deterministic PostgreSQL-compatible retrieval contracts and labels lexical fallback explicitly as `lexical_fallback` when that path is used. Eval and tests assert backend metadata, score summaries, scope filtering, and fallback/unsupported policy.

## MiniMax M3 integration

MiniMax integration is isolated behind `AIProvider` / `MiniMaxProvider`.

Configured defaults:

```bash
AI_PROVIDER=minimax
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3
```

Live calls require explicit credentials and opt-in. The live smoke fails closed before transport unless the caller supplies a real key and opt-in flag.

```bash
DOCULENS_LIVE_MINIMAX=true MINIMAX_API_KEY=<real-key> npm run smoke:minimax
```

Eval live mode is separately gated:

```bash
DOCULENS_EVAL_REQUIRE_LIVE_MINIMAX=true MINIMAX_API_KEY=<real-key> npm run eval
```

Observed local limitation: no real `MINIMAX_API_KEY` was available during final verification, so live MiniMax network proof is not claimed here. Deterministic provider-shape, metadata, redaction, budget, prompt safety, citation, fallback, unsupported, and authz contracts were run.

Implemented request/context limits:

- JSON request bodies are capped at 1 MiB by `MAX_JSON_BODY_BYTES`.
- Section chunking defaults to 180 estimated tokens per chunk.
- Default MiniMax server budget allows up to 32 live calls, 8,000 estimated input tokens, 800 output tokens, 8,000 context tokens, one retry, concurrency 2, and estimated cost cap 1 USD.
- Raw MiniMax provider defaults cap configured input/context estimates at 16,000 tokens when not overridden.

## MarkItDown sample PDF flow

Files:

```txt
samples/markitdown/doculens-sample.pdf
scripts/markitdown/convert-sample.mjs
scripts/checks/markitdown-contract.mjs
tests/markitdown/markitdown-contract.test.mjs
```

Run:

```bash
npm run smoke:markitdown
```

Observed output:

```txt
MarkItDown smoke converted the sample PDF into ingestion-ready Markdown chunks.
```

The committed PDF is tiny and synthetic. It contains no sensitive document content. The smoke verifies the converted Markdown preserves sample text, normalizes through the existing ingestion path, and produces stable chunks with heading metadata and positive token estimates.

## UI and canonical Playwright selectors

Canonical `data-testid` values:

| Area | Test IDs |
| --- | --- |
| Auth | `auth.email-input`, `auth.password-input`, `auth.login-submit` |
| Document input | `document.title-input`, `document.content-input`, `document.submit`, `document.analyze` |
| Analysis | `analysis.panel`, `analysis.summary` |
| Chat | `chat.input`, `chat.submit`, `chat.answer`, `chat.citations`, `chat.retrieved-chunks` |
| AI transparency | `ai.metadata` |
| State | `state.loading`, `state.error`, `state.empty` |
| Unsupported answer | `answer.unsupported` |

Playwright coverage:

```bash
npm run test:e2e
```

Observed final verification:

```txt
Running 2 tests using 1 worker
2 passed
```

## Docker

Local Compose path:

```bash
POSTGRES_PASSWORD=local-postgres JWT_SECRET=DocuLensLocalJwtSecret1234567890Aa MINIMAX_API_KEY=minimax-local-placeholder docker-compose up --build
```

Services:

- `frontend` on `http://127.0.0.1:5173`
- `backend` on `http://127.0.0.1:3000`
- `db` PostgreSQL on configurable host port

AWS app image path:

```bash
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .
```

Observed final verification:

```txt
Successfully built e78c4cfeb14b
Successfully tagged doculens-ai:aws-demo
```

## AWS demo infrastructure

Terraform lives in `infra/aws`.

It models:

- public ALB with `/health` target group check
- one ECS Fargate service and task definition
- explicit `image_uri` contract for the app image
- RDS PostgreSQL with `publicly_accessible = false`
- database security group ingress on 5432 only from the app security group
- Secrets Manager containers or external ARNs for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`
- CloudWatch app log group
- IAM task execution role and secret-read policy
- bounded defaults: desired count 1, CPU 512, memory 1024 MiB, RDS 20 GiB, micro instance, single-AZ, no NAT gateway, deletion protection false, skip final snapshot true

Validation:

```bash
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws plan -var image_uri=<pushed-image-uri>
```

Observed final verification using configured AWS demo credentials and a placeholder public image URI for plan-shape validation:

```txt
terraform -chdir=infra/aws fmt -check
terraform: ok

terraform -chdir=infra/aws validate
Success! The configuration is valid.

terraform -chdir=infra/aws plan -var image_uri=public.ecr.aws/docker/library/node:22-alpine
Plan: 25 to add, 0 to change, 0 to destroy.
Outputs: alb_url, app_url, database_endpoint, health_url, secret_arns (sensitive)
```

No `terraform apply` was run during final verification. Apply requires a pushed DocuLens app image and externally populated secrets. See `infra/aws/README.md` for plan review, optional apply, ALB health smoke, destroy, cleanup verification, estimated cost, and production gaps.

Production gaps are intentional and explicit: HTTPS/TLS, private subnet/NAT or VPC endpoints, database backup retention, final snapshots, WAF, rate limits, remote state, secret rotation, multi-AZ RDS, autoscaling, image scanning, least-privilege hardening beyond the demo, custom domains, and full observability.

## Optional AWS Lambda MarkItDown extension

PDF conversion is not part of the required AWS demo stack. A future production design could upload PDFs to S3, invoke Lambda or a Lambda container image packaging Microsoft MarkItDown, write Markdown back to S3, and send Markdown to ingestion. Review timeout, package size, IAM scope, object size limits, scanning, and log redaction so raw document text, API keys, prompts, and conversion errors do not leak to CloudWatch.

## Data, privacy, logging, and retention

- Demo inputs should be non-sensitive.
- The committed sample PDF is synthetic and non-sensitive.
- Raw sensitive documents must not be committed.
- Logs must redact API keys, JWTs, database URLs/passwords, authorization headers, raw document text, full prompts, provider responses, and sensitive stack traces.
- MiniMax live mode sends document/prompt context to a third-party provider; use only approved data.
- Provider retention/training terms are not asserted by this repo. Treat provider retention/training behavior as unknown unless verified against the active MiniMax agreement.
- Terraform state and plan files can contain infrastructure metadata and must remain local/ignored.
- AWS Secrets Manager values are intentionally populated outside Terraform to avoid secret payloads in Terraform state.
- Local PostgreSQL data and Docker volumes persist until reset or removed.

## Cost and rate-limit strategy

MiniMax:

- Live calls require explicit opt-in.
- Provider budget gates bound live calls, input/output/context token estimates, retries, concurrency, and estimated cost.
- Eval reports call/token totals for deterministic provider calls.

AWS:

- The demo stack is short-lived and disposable.
- Cost drivers: ALB hours, one Fargate task, RDS micro instance/storage, Secrets Manager containers, CloudWatch logs, data transfer.
- No NAT gateway is created.
- Destroy after review.

## Verification evidence

Final local verification commands run:

```txt
npm ci                                                PASS
POSTGRES_PASSWORD=local-postgres POSTGRES_PORT=55433 docker-compose up -d db   PASS
npm run db:reset                                     PASS
npm run demo:seed                                    PASS
psql seed counts                                     users=2 documents=1 chunks=2 adversarial_chunks=1
npm run test:unit                                    PASS: 55 passed
npm run test:integration                             PASS: 23 passed
npm run test:e2e                                     PASS: 2 passed
npm run test:eval                                    PASS: 6 passed
npm run smoke:markitdown                             PASS
npm run test:aws                                     PASS: 5 passed
npm run test:docker                                  PASS: 2 passed
npm run build                                        PASS
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .  PASS
terraform -chdir=infra/aws fmt -check                PASS
terraform -chdir=infra/aws validate                  PASS
terraform plan with AWS demo credentials             PASS: 25 to add, 0 to change, 0 to destroy
openspec validate --changes build-doculens-ai-assessment PASS
node --test scripts/guardrails/check-tdd.test.mjs    PASS: 8 passed
```

Live MiniMax verification was not run because no real `MINIMAX_API_KEY` was available in the environment. Run the gated commands in the MiniMax section with a real key before claiming live provider proof.

## Repository safety

`.gitignore` excludes:

```txt
.env
.env.*
*.tfstate
*.tfstate.*
*.tfplan
.terraform/
crash.log
crash.*.log
node_modules/
dist/
coverage/
playwright-report/
test-results/
local harness folders
```

GitHub branch protection requires the `guardrails` check on `main`.

## OpenSpec

Change artifacts:

```txt
openspec/changes/build-doculens-ai-assessment/proposal.md
openspec/changes/build-doculens-ai-assessment/design.md
openspec/changes/build-doculens-ai-assessment/tasks.md
openspec/changes/build-doculens-ai-assessment/specs/document-ai-assistant/spec.md
openspec/changes/build-doculens-ai-assessment/specs/ai-reliability-evals/spec.md
openspec/changes/build-doculens-ai-assessment/specs/aws-demo-infrastructure/spec.md
```

Validate:

```bash
openspec validate --changes build-doculens-ai-assessment
```

Observed final result:

```txt
✓ change/build-doculens-ai-assessment
Totals: 1 passed, 0 failed (1 items)
```
