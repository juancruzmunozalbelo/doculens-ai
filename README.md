# DocuLens AI

DocuLens AI is a full-stack AI document assistant for the Full Stack AI Engineer assessment. It provides an authenticated source-first review notebook where users choose one active source at a time, generate a concise review briefing, ask guided questions, inspect inline citations, and open technical AI details only when needed.

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
- React source-first reviewer flow with authenticated Sources and Review Notebook views, source cards for the sample NDA, pasted text, and bounded PDF uploads, active-source scoping, starter questions before analysis, review briefing sections, answer cards with inline citations, persistent evidence panel, quiet recovery copy, print-safe review output, and technical-details disclosure.
- Canonical Playwright `data-testid` coverage for the source-first notebook flow, quiet primary copy, PDF readiness/recovery, recent-source detail fetch, answer normalization, fallback/unsupported states, citation-linked evidence, print media behavior, and raw-internals absence.
- Eval runner and regression tests for retrieval, fallback, citations, unsupported answers, authz, prompt injection, AI display sanitization, redaction, budget, PDF upload, and PostgreSQL integrity.
- MarkItDown sample PDF conversion smoke path plus authenticated `/api/documents/uploads/pdf` ingestion for small text-based PDFs into the existing normalization/chunking pipeline.
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
- Microsoft MarkItDown CLI (`markitdown`) for arbitrary reviewer PDF uploads. The committed sample smoke can use a deterministic fallback only for the tiny non-sensitive fixture when the local CLI is absent; product uploads do not use that fallback.
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
npm run test:e2e             # Playwright canonical source-first reviewer flow
npm run test:eval            # Eval regression test suite
npm run test:docker          # Docker Compose contract
npm run test:aws             # AWS/Terraform model contract
npm run smoke:markitdown     # Sample PDF -> Markdown -> chunks smoke
npx playwright test tests/e2e/doculens-ui.spec.mjs --reporter=list
                                # Focused source-first notebook/PDF Playwright flow
node --test tests/chat-api/chat-api-contract.test.mjs tests/ingestion/pdf-upload-contract.test.mjs
                                # Focused answer-normalization + safe PDF error contracts
npm run smoke:minimax        # Live MiniMax smoke, requires explicit opt-in and real key
npm run eval                 # Reviewer-readable eval PASS/SKIP/FAIL output
npm run verify               # Guardrail + foundation verification
npm run guard:tdd            # Staged TDD guardrail
```

## CI/CD quality gates

Required pull-request checks for `main` are fast, merge-blocking jobs in `.github/workflows/ci.yml` plus the TDD companion workflow. Manual and scheduled gates are deliberately separate so required CI never implies slower E2E/eval/Docker/MarkItDown/mutation coverage ran when it did not.

Gate categories:

- Required: run on pull requests to `main` and on pushes where configured; the `main` branch ruleset must require the exact check names below before merge.
- Manual: `workflow_dispatch` extended quality suites and mutation testing for reviewer/operator-requested proof.
- Scheduled: weekly extended quality suites in `.github/workflows/extended-quality.yml`; failures are visible workflow failures but are not substitutes for current required PR checks.

| Required check name | Command or validation |
| --- | --- |
| `CI / Build` | `npm ci`, then `npm run build` |
| `CI / Unit Contracts` | `npm ci`, then `npm run test:unit` |
| `CI / Verification Contracts` | `npm ci`, then `npm run verify` |
| `CI / Integration Contracts` | `npm ci`, then `npm run test:integration`; live PostgreSQL checks remain explicit `SKIP` output unless `DOCULENS_TEST_DATABASE_URL` is configured |
| `CI / AWS Static Validation` | pinned Terraform, `terraform -chdir=infra/aws fmt -check`, `terraform -chdir=infra/aws init -backend=false`, `terraform -chdir=infra/aws validate`, then `npm run test:aws` |
| `CI / AWS Container Build Smoke` | `docker build -f Dockerfile.aws` without push and runtime packaging smoke |
| `TDD Guardrails / TDD Guardrails` | TDD companion guardrails for pull requests and pushes |

Repository branch protection or rulesets for `main` must be applied outside this repository and verified before the pipeline is considered enforced:

- Required checks: exactly `CI / Build`, `CI / Unit Contracts`, `CI / Verification Contracts`, `CI / Integration Contracts`, `CI / AWS Static Validation`, `CI / AWS Container Build Smoke`, and `TDD Guardrails / TDD Guardrails`.
- Stale or missing checks: enable the setting that requires current/up-to-date status checks before merge; a PR must not merge with missing results or checks from an older commit.
- Administrator policy: include administrators in enforcement, or retain a repository-owner emergency-bypass record that names the bypass approver and reason.
- Evidence: retain a screenshot/export of the `main` ruleset showing required check names, stale-check behavior, and administrator enforcement/bypass policy.

Extended quality gates are intentionally separate from required CI:

| Workflow | Trigger | Coverage |
| --- | --- | --- |
| `Extended Quality / Playwright E2E` | manual `workflow_dispatch` suite `e2e`/`all` or weekly schedule | installs Chromium prerequisites and runs `npm run test:e2e` |
| `Extended Quality / Eval Regressions` | manual suite `eval`/`all` or weekly schedule | `npm run test:eval` |
| `Extended Quality / Docker Compose Contracts` | manual suite `docker`/`all` or weekly schedule | `npm run test:docker` |
| `Extended Quality / MarkItDown Smoke` | manual suite `markitdown`/`all` or weekly schedule | `npm run smoke:markitdown` |
| `Mutation Testing / Mutation Testing` | manual `workflow_dispatch` only | bounded smoke/unit/integration/E2E mutation modes with report upload |

Every validation or release workflow that installs Node dependencies uses `npm ci`.


## Reviewer flow, fallback, and unsupported behavior

The primary UI is source-first:

1. The reviewer creates or selects one active source: sample NDA, pasted text, or a text-based PDF.
2. The notebook keeps the active source visible beside briefing, guided questions, answers, citations, and evidence.
3. Starter questions are available immediately after the source is ready; structured analysis is presented as a review briefing.
4. Grounded answers show concise prose with inline citation affordances and a persistent evidence panel.
5. The visible trust summary stays human-level: `Based on this document`, citation count, `Not enough evidence`, or `Outside this document`.
6. Provider/model, prompt version, retrieval mode, fallback reason, token usage, and diagnostics remain in the explicit technical-details disclosure.

Normal chat remains RAG-first behind the UI boundary. Normal answers must cite retrieved chunk IDs in API data, but raw IDs, scores, provider payloads, raw metadata, prompt internals, and JSON-shaped provider text are normalized or hidden before rendering.

Fallback is explicit in metadata. Low-coverage or whole-document fallback without valid citations is shown to the reviewer as `Not enough evidence` guidance rather than a substantive grounded final answer.

Unsupported answers are explicit. Out-of-document/current-facts questions render an `Outside this document` state with suggested in-source questions instead of fabricated citations.

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

## PDF source readiness and MarkItDown

Reviewer PDF intake is authenticated at `POST /api/documents/uploads/pdf` with `multipart/form-data`. The UI presents it as source readiness: selected PDF, reading, ready source, or failed with recovery.

- required `file`: exactly one text-based PDF;
- optional `title`: reviewer-facing source title;
- default limits: max 5 MiB upload, max 20 detectable pages, max 15 second processing window, max 120,000 extracted characters;
- no OCR: scanned/image-only PDFs fail safely with `Choose another PDF` and `Paste text instead`;
- failures use safe 400/401/413/415/422/503-style responses with categories and do not create ready documents, chunks, analysis, chat messages, or citations.

The backend invokes a real MarkItDown-compatible CLI for arbitrary user uploads. Docker runtime images install MarkItDown in a Python venv and expose `markitdown` on `PATH`. Converter stdout/stderr, local paths, stack traces, raw excerpts, command output, and dependency internals are redacted from responses/logs and are not shown in the primary reviewer path.

The sample smoke remains fixture-only:

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

The committed PDF is tiny and synthetic. It contains no sensitive document content. The smoke verifies the converted Markdown preserves sample text, normalizes through the existing ingestion path, and produces stable chunks with heading metadata and positive token estimates. The deterministic fallback in `scripts/markitdown/convert-sample.mjs` is smoke-only and is never used for arbitrary reviewer uploads.

## UI and canonical Playwright selectors

Canonical `data-testid` values:

| Area | Test IDs |
| --- | --- |
| Auth | `auth.email-input`, `auth.password-input`, `auth.login-submit` |
| Source creation | `source.create`, `intake.sample-cta`, `intake.paste-panel`, `intake.pdf-panel`, `intake.pdf-input`, `intake.pdf-submit`, `pdf.selected-source`, `pdf.status`, `pdf.recovery`, `pdf.paste-text-fallback` |
| Source notebook | `nav.intake`, `nav.workspace`, `source.rail`, `source.card`, `source.status`, `source.active`, `source.management`, `workspace.root` |
| Review briefing | `document.analyze`, `analysis.panel`, `analysis.summary`, `review.briefing`, `review.starter-questions`, `review.starter-question` |
| Chat/evidence | `chat.input`, `chat.submit`, `chat.answer`, `chat.citations`, `chat.retrieved-chunks`, `answer.card`, `answer.evidence-chip`, `answer.inline-citation`, `answer.unsupported`, `evidence.panel`, `evidence.source`, `evidence.section`, `evidence.excerpt` |
| Trust/print | `ai.metadata`, `ai.trust-bar`, `ai.details`, `trust.summary`, `trust.technical-details`, `print.review-output` |
| State | `state.loading`, `state.error`, `state.empty` |

Playwright coverage:

```bash
npx playwright test tests/e2e/doculens-ui.spec.mjs --reporter=list
```

Observed focused verification:

```txt
Running 8 tests using 1 worker
8 passed
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
- immutable `image_uri` contract for the app image digest released by GitHub Actions
- RDS PostgreSQL with `publicly_accessible = false`
- database security group ingress on 5432 only from the app security group
- Secrets Manager containers or external ARNs for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`
- CloudWatch app log group
- IAM task execution role and secret-read policy
- bounded defaults: desired count 1, CPU 512, memory 1024 MiB, RDS 20 GiB, micro instance, single-AZ, no NAT gateway, deletion protection false, skip final snapshot true
- partial S3 remote backend configuration supplied by GitHub environment variables with DynamoDB locking

Local static validation:

```bash
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
terraform -chdir=infra/aws plan -var image_uri=<pushed-image-digest>
```

GitHub Actions release/deploy:

1. `AWS Release Deploy Demo / AWS Image Release` assumes `AWS_DEMO_DEPLOY_ROLE_ARN` through GitHub OIDC in the protected `aws-demo` environment.
2. It builds `Dockerfile.aws`, tags the image with `GITHUB_SHA`, adds OCI label `org.opencontainers.image.revision=$GITHUB_SHA`, pushes to `AWS_DEMO_ECR_REPOSITORY`, and captures the immutable digest.
3. `AWS Release Deploy Demo / AWS Terraform Plan` initializes the configured S3/DynamoDB remote backend, checks Terraform format/validate, verifies external secret ARNs with `secretsmanager:GetSecretValue` without printing payloads, and uploads the binary plan plus redacted summary.
4. `AWS Release Deploy Demo / AWS Terraform Apply` is gated by `aws-demo` environment approval and applies the exact reviewed `doculens-demo.tfplan`.
5. The deploy fails unless the ALB `/health` endpoint returns success after apply.

Break-glass digest deploys are isolated behind `break_glass_image_digest`; the workflow rejects mutable tags and validates the digest belongs to the configured ECR repository with source-revision evidence for the reviewed commit.

Required `aws-demo` environment configuration is recorded in `infra/aws/README.md`: account id, region, ECR repository, backend bucket/table/key, deploy role ARN, rollback role ARN, external populated secret ARNs, required reviewers, allowed branches, OIDC trust constraints, least-privilege role split, rollback, and cleanup.

No `terraform apply` was run during this repository update. Apply requires the protected GitHub environment, a valid AWS demo account, remote backend bootstrap resources, deploy/rollback OIDC roles, a pushed DocuLens app image digest, and externally populated secrets. See `infra/aws/README.md` for plan review, optional apply, ALB health smoke, destroy, cleanup verification, estimated cost, and production gaps.

Production gaps are intentional and explicit: HTTPS/TLS, private subnet/NAT or VPC endpoints, database backup retention, final snapshots, WAF, rate limits, secret rotation, multi-AZ RDS, autoscaling, image scanning, least-privilege hardening beyond the demo, custom domains, and full observability.


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

Current change verification in the isolated worktree `~/WorkanaChallenger-complete-ci-aws-deploy-pipeline`:

```txt
npm ci                                                PASS
npm run build                                        PASS
npm run test:unit                                    PASS: 57 passed
npm run verify                                       PASS: guardrail + foundation contracts passed
npm run test:integration                             PASS: 23 passed, 1 skipped live PostgreSQL check
npm run test:aws                                     PASS: 6 passed
node --test tests/actions/workflows-contract.test.mjs PASS: 6 passed
terraform -chdir=infra/aws fmt -check                PASS
terraform -chdir=infra/aws init -backend=false       PASS
terraform -chdir=infra/aws validate                  PASS
docker build -f Dockerfile.aws -t doculens-ai:ci-smoke . PASS
docker run --rm --entrypoint node doculens-ai:ci-smoke ... runtime packaging smoke PASS
docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest .github/workflows/*.yml PASS
```

AWS-only verification that cannot be run locally from this workstation must be collected by the repository/AWS operator before claiming the AWS demo pipeline is enabled:

- GitHub `main` branch ruleset evidence: exact required checks `CI / Build`, `CI / Unit Contracts`, `CI / Verification Contracts`, `CI / Integration Contracts`, `CI / AWS Static Validation`, `CI / AWS Container Build Smoke`, and `TDD Guardrails / TDD Guardrails`; stale required checks block merge; administrators included or bypass documented.
- GitHub `aws-demo` environment evidence: required reviewers configured, allowed deployment branches restricted to `main` unless explicitly approved, and administrator bypass policy recorded.
- Canonical GitHub environment variables: `AWS_DEMO_ACCOUNT_ID`, `AWS_REGION`, `AWS_DEMO_ECR_REPOSITORY`, `AWS_DEMO_TF_STATE_BUCKET`, `AWS_DEMO_TF_LOCK_TABLE`, `AWS_DEMO_TF_STATE_KEY`, `AWS_DEMO_DEPLOY_ROLE_ARN`, `AWS_DEMO_ROLLBACK_ROLE_ARN`, `AWS_DEMO_DATABASE_URL_SECRET_ARN`, `AWS_DEMO_JWT_SECRET_ARN`, `AWS_DEMO_MINIMAX_API_KEY_SECRET_ARN`, `AWS_DEMO_DESIRED_COUNT`, `AWS_DEMO_DB_INSTANCE_CLASS`, and `AWS_DEMO_DB_ALLOCATED_STORAGE` are populated in the protected `aws-demo` environment without committing real values.
- AWS OIDC evidence: deploy and rollback role trust policies bind `token.actions.githubusercontent.com:aud` to `sts.amazonaws.com` and `sub` to this repository plus approved refs or protected `aws-demo` environment subjects.
- AWS role evidence: deploy and rollback roles are separate least-privilege roles; rollback has no image push or Terraform apply privileges.
- AWS backend evidence: S3 state bucket and DynamoDB lock table exist, bucket encryption/versioning and DynamoDB `LockID` locking are enabled, and names match GitHub environment variables.
- AWS secret readiness evidence: `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY` Secrets Manager ARNs have non-empty `AWSCURRENT` values; logs show presence/status only and payloads are not printed.
- AWS deploy evidence: the default path built and pushed `Dockerfile.aws` for the reviewed `GITHUB_SHA`, release image digest belongs to the configured ECR repository, source-revision label equals the reviewed commit SHA, the protected apply used the uploaded binary plan artifact, and ALB `/health` passed.
- AWS rollback evidence: rollback input was an ECS task definition ARN or `family:revision`, raw image URI/digest inputs were rejected, ECS service stability completed, running count equaled desired count, and ALB `/health` passed.
- AWS cleanup evidence: destroy uses the same remote state and account guard; ALB, ECS, RDS, CloudWatch log group, Secrets Manager containers, and local/CI plan artifacts are deleted or intentionally retained.

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

GitHub branch protection for `main` must require `CI / Build`, `CI / Unit Contracts`, `CI / Verification Contracts`, `CI / Integration Contracts`, `CI / AWS Static Validation`, `CI / AWS Container Build Smoke`, and `TDD Guardrails / TDD Guardrails` with stale checks blocking merges and administrator enforcement documented.

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
