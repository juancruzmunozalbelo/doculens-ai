# DocuLens AI

DocuLens AI is the source-first solution to the Full Stack AI Engineer Assessment. It lets an authenticated reviewer choose one active source, generate a concise review briefing, ask grounded questions, inspect inline citations, and keep technical AI internals out of the primary reviewer path.

This repository is public. Do not commit real secrets, `.env` files, Terraform state/plans, AWS credentials, MiniMax keys, JWT secrets, database passwords, raw sensitive document samples, or local harness folders.

## Documentation

The delivery documentation lives in the GitHub Wiki:

- [Wiki Home](https://github.com/juancruzmunozalbelo/doculens-ai/wiki)
- [Challenger Assessment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Challenger-Assessment)
- [Demo Script](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Demo-Script)
- [Reviewer Q&A](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Q-and-A)
- [Architecture](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Architecture)
- [Decisions and Tradeoffs](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Decisions-and-Tradeoffs)
- [Local Demo](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Local-Demo)
- [AWS Deployment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/AWS-Deployment)
- [Security and Secrets](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Security-and-Secrets)
- [Troubleshooting](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Troubleshooting)

This README is self-contained for the challenger submission. The GitHub Wiki is aligned with it and expands the same delivery story without replacing the repo-local setup, retrieval, cost, AWS, security, and command details below.

## Full Stack AI Engineer Assessment coverage

DocuLens AI implements the uploaded-document/source Q&A path from the assessment: users submit text or a small text-based PDF, receive structured AI review output, and can re-ask grounded questions over the selected source.

| Assessment requirement | Implemented evidence |
| --- | --- |
| Full-stack AI app for submitted content, AI interaction, and structured outputs | React reviewer UI in `apps/web/src/App.jsx`; Node API in `apps/api/src/server/index.mjs`; structured briefing and chat flow in `apps/api/src/server/chat/service.mjs`. |
| Backend: Node.js, REST API, AI endpoint, persistence, authentication | Node REST routes under `/api/*`; MiniMax-backed analysis/chat endpoints; PostgreSQL repositories in `apps/api/src/server/postgresql/repositories.mjs`; JWT auth in `apps/api/src/server/auth/service.mjs`. |
| AI architecture: separated prompt construction, model invocation, post-processing, provider abstraction, prompt configuration | `AIProvider` contract in `apps/api/src/server/ai/provider.mjs`; prompt registry/builder in `apps/api/src/server/ai/prompts/`; MiniMax transport and response safety in `apps/api/src/server/ai/minimax-provider.mjs`; prompt version `2026-07-07.1`. |
| Prompt-injection, unsafe input, hallucination, and uncertainty handling | Evidence is wrapped as untrusted data, delimiters are escaped, secrets are redacted, unsupported/out-of-scope questions are refused or labeled, citations are validated, and answer states expose uncertainty/fallback reasons. |
| Frontend: React, at least two pages, submission form, loading/error/empty/model status, refine or re-ask flow | Login, intake/add-source, and review workspace views in `apps/web/src/App.jsx`; paste/PDF/sample source forms; loading/error/empty states; trust metadata; retry/refine/overview actions. |
| Data and architecture thinking: storage, retention, PII/logging/auditability, vector/RAG | PostgreSQL stores users, documents, chunks, embeddings, analyses, chat messages, citations, prompt/audit metadata; redaction is centralized; retrieval uses lexical fallback by default and optional pgvector/hybrid with local hashing. |
| Evaluation and reliability thinking | Contract tests cover auth/ownership, chat, retrieval, prompt safety, logging redaction, pgvector readiness, PDF upload, cost estimation, workflows, and eval regression fixtures under `tests/`. |
| Infrastructure: AWS, IaC, secrets, config/code separation, scaling constraints | Terraform demo stack in `infra/aws`; Docker Compose and `Dockerfile.aws`; AWS Secrets Manager/OIDC workflow guidance; bounded MiniMax budgets and demo-grade ECS/Fargate deployment notes. |
| Bonus coverage | Cost estimates for 1k/10k/100k requests are documented below; vector/RAG proof is implemented. Streaming, LLM tool/function calling, and queues/workers are explicitly out of scope. |

## What is implemented

- React + Node source-first reviewer flow.
- JWT authentication, hashed passwords, expiring tokens, and owner-scoped document APIs.
- Child-resource authorization for analysis, messages, chunks, citations, and cascade delete paths.
- PostgreSQL schema, reset/migration/seed scripts, integrity contracts, and pgvector-capable chunk embedding storage for the vector proof path.
- Markdown/text normalization, section-aware chunking, stable chunk IDs, token estimates, local hashed chunk embeddings, and chunk persistence.
- Retrieval provider with deterministic fallback/unsupported policy, citation-ready metadata, repository-backed pgvector search, and hybrid scoring when configured.
- MiniMax M3 chat/analysis provider behind an `AIProvider` abstraction with live-call budgets and fail-closed live smoke gates.
- Full-document analysis and RAG-first chat with citation validation.
- Prompt safety wrappers, delimiter escaping, prompt-injection resistance, and centralized redaction.
- Authenticated PDF upload readiness for small text-based PDFs through MarkItDown-compatible conversion.
- Local Docker Compose path and single-container AWS image path.
- Terraform demo stack for ECS Fargate, ALB, RDS PostgreSQL, Secrets Manager, CloudWatch, IAM, and security groups.
- GitHub Actions required CI gates, AWS static validation, AWS container build smoke, release/deploy workflow, and rollback workflow.

## Architecture and AI decisions

- The product shape is intentionally narrow: one authenticated reviewer, one active source at a time, a structured briefing, and source-grounded chat with citations. This keeps the assessment focused on a complete vertical slice instead of a broad document-management platform.
- The backend keeps prompt construction, model invocation, and response post-processing separate. `AIProvider` defines the switchable provider boundary, while the current live provider is MiniMax M3 behind budget checks and a fail-closed unavailable-provider path.
- Prompts are versioned in code and built from sanitized document/chunk evidence. Document text is always treated as untrusted data: it cannot override system/developer policy, reveal hidden prompts, forge citations, or change logging/provider behavior.
- Retrieval defaults to `lexical_fallback` so the app remains honest without vector prerequisites. When configured, `pgvector` and `hybrid` use repository-backed PostgreSQL search with local deterministic hashing embeddings, and fall back with explicit reasons if prerequisites are missing.
- The primary reviewer UI favors usable answer states, citations, and evidence controls. Provider/model, prompt version, retrieval mode, and fallback reason remain available in the trust panel for auditability without making internals the main workflow.

## Data storage, retention, PII, logging, and auditability

- Stored application data includes user email/display name/password hash, document text and metadata, normalized chunks, local embedding vectors and metadata, structured analyses, chat messages, citations, prompt identifiers/versions, token estimates, retrieval metadata, and safe provider/model audit fields.
- Secrets are not stored in the repo. Runtime secrets come from local environment variables or AWS Secrets Manager; the local hashing embedding path needs no embedding-provider secret.
- Uploaded documents and AI outputs are retained in the configured PostgreSQL database; reviewer deletion removes the source from owner-scoped active views, while hard deletion, database reset, or demo-stack destroy is required for physical removal. The current app does not implement an automatic time-based retention policy.
- Schema foreign keys support cascade cleanup when users/documents/messages/chunks are hard-deleted. Audit metadata is designed to keep prompt identifiers, versions, provider/model, retrieval, citation, and token fields without storing raw full prompts or raw provider payloads as the audit record.
- Treat all uploaded documents as potentially sensitive. Do not commit real PII or confidential samples. Central redaction removes configured secrets, database URLs/passwords, bearer tokens, MiniMax keys, raw-document canaries, full-prompt canaries, provider-response canaries, and stack traces from log/display paths.
- Local logs are structured console output. The AWS demo sends app logs to CloudWatch with demo retention configured in Terraform; production would need explicit retention, access-review, incident/audit, and deletion policies.

## Evaluation, reliability, and wrong-answer handling

- Output quality is measured by source-grounding rather than free-form confidence: answers should cite retrieved chunks, expose uncertainty/fallback state, avoid unsupported claims, and keep raw provider internals out of reviewer-facing text.
- Regression protection lives in targeted contract tests and fixtures: retrieval/eval regression, chat API behavior, prompt safety, citation validation, redaction, ownership, pgvector readiness, PDF upload, cost estimation, and workflow checks under `tests/`.
- After prompt/model changes, rerun the affected contract suites and compare the golden assessment fixture behavior before reviewer claims are updated. The README cost/retrieval claims should remain tied to those verified contracts.
- Wrong answers in production should be handled as auditable incidents: preserve the source, question, citations, prompt version, provider/model, retrieval mode, fallback reason, and token metadata; let the reviewer retry/refine or ask an overview; then patch prompts/retrieval/tests before re-enabling a claim.


## AI usage cost estimation

This repo keeps the bonus cost model in the README so local verification does not depend on private or remote wiki content.

Pricing assumptions, captured on 2026-07-07:

- Model: `MiniMax-M3` through the existing chat-completions provider.
- Price basis: USD pay-as-you-go text tokens, uncached standard service tier, requests at or below the 512k input-token row.
- Unit prices: $0.30 per 1M input tokens and $1.20 per 1M output tokens. Prompt-cache reads, Priority service tier, long-context >512k pricing, speech, image, video, and music meters are excluded from this estimate.
- Sources: MiniMax's M3 announcement states M3 API pricing varies by input length and service tier; AI//COST last verified the standard MiniMax-M3 <=512k row at $0.30/M input and $1.20/M output on 2026-06-08; Puter's June 2026 pricing breakdown cites the same standard <=512k MiniMax-M3 token rates. These are fixed planning assumptions in this repo, not live billing data.
- Formula: `total_input_tokens = requests * average_input_tokens`; `total_output_tokens = requests * average_output_tokens`; `estimated_provider_cost_usd = (total_input_tokens / 1_000_000 * 0.30) + (total_output_tokens / 1_000_000 * 1.20)`.

Representative scenarios:

- RAG chat request: 6,000 average input tokens and 600 average output tokens. This represents the prompt wrapper, retrieved context, question, and concise grounded answer path.
- Full-document analysis request: 8,000 average input tokens and 800 average output tokens. This is intentionally bounded to the current server input/context and output token caps.

| Scenario | Request tier | Average input tokens/request | Average output tokens/request | Total input tokens | Total output tokens | Estimated provider cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| RAG chat | 1,000 | 6,000 tokens | 600 tokens | 6,000,000 tokens | 600,000 tokens | $2.52 |
| RAG chat | 10,000 | 6,000 tokens | 600 tokens | 60,000,000 tokens | 6,000,000 tokens | $25.20 |
| RAG chat | 100,000 | 6,000 tokens | 600 tokens | 600,000,000 tokens | 60,000,000 tokens | $252.00 |
| Full-document analysis | 1,000 | 8,000 tokens | 800 tokens | 8,000,000 tokens | 800,000 tokens | $3.36 |
| Full-document analysis | 10,000 | 8,000 tokens | 800 tokens | 80,000,000 tokens | 8,000,000 tokens | $33.60 |
| Full-document analysis | 100,000 | 8,000 tokens | 800 tokens | 800,000,000 tokens | 80,000,000 tokens | $336.00 |

Budget guardrails already bound live spend before MiniMax transport invocation:

- The server default MiniMax budget caps live calls at 32, input tokens at 8,000, context tokens at 8,000, output-token budget ceiling at 6,000, timeout at 30,000 ms, retries at 1, concurrency at 2, and max estimated live-call cost at $1. Normal chat requests default to 800 output tokens; full-document analysis can request up to 6,000.
- The provider rejects exhausted live-call budgets, over-limit input/context tokens, over-limit output tokens, exceeded estimated-cost budgets, invalid timeout/retry budgets, and concurrency overflow before the network call is made.
- Over-budget requests fail closed before MiniMax transport invocation instead of silently making an over-budget live call.

Caveats:

- Actual provider billing can vary by MiniMax tokenizer behavior, document length, retrieved chunk volume, answer length, retry behavior, provider pricing changes, cache usage, service tier, long-context routing, failed requests, and unsupported requests.
- The estimates use representative averages and repo token-estimation heuristics for planning; they are not billing reconciliation.
- Streaming responses, LLM tool/function calling, and queue/worker processing remain out of scope for this assessment implementation.

## AWS demo cost estimate

These infrastructure estimates are separate from MiniMax provider token costs. Assumptions, captured on 2026-07-08:

- Region: `us-east-1`, matching `infra/aws/variables.tf`.
- Runtime shape: one public Application Load Balancer, one ECS Fargate task at `0.5 vCPU` / `1 GiB`, one single-AZ RDS PostgreSQL `db.t4g.micro`, `20 GiB` gp3 storage, three Secrets Manager secrets, one CloudWatch log group, one ECR image, and tiny S3/DynamoDB Terraform backend usage.
- Time basis: `730` hours per month; "review day" estimates assume resources are destroyed after the stated runtime.
- AWS pricing assumptions: ALB `$0.0225/hour` plus one LCU at `$0.008/LCU-hour`; Fargate Linux/x86 in `us-east-1` at `$0.0404784/vCPU-hour` and `$0.004446/GB-hour`; RDS PostgreSQL `db.t4g.micro` single-AZ at `$0.016/instance-hour`; RDS gp3 storage at `$0.115/GB-month`; Secrets Manager at `$0.40/secret-month`; CloudWatch Logs standard ingest/storage at `$0.50/GB ingested` and `$0.03/GB-month`; ECR private storage at `$0.10/GB-month`; S3 Standard at `$0.023/GB-month`; DynamoDB on-demand requests are treated as pennies for Terraform locking at this scale.

| AWS demo resource | Planning quantity | Estimate |
| --- | ---: | ---: |
| Application Load Balancer | 730 hours + 1 LCU-hour/hour | $22.27/month |
| ECS Fargate app task | 0.5 vCPU + 1 GiB for 730 hours | $18.02/month |
| RDS PostgreSQL compute | `db.t4g.micro`, single-AZ, 730 hours | $11.68/month |
| RDS gp3 storage | 20 GiB provisioned | $2.30/month |
| Secrets Manager | 3 secrets | $1.20/month before API-call pennies |
| CloudWatch Logs | 1 GiB ingest + 1 GiB archived storage planning allowance | $0.53/month before free-tier effects |
| ECR image storage | 1 GiB private image storage planning allowance | $0.10/month before free-tier effects |
| Terraform backend | 1 GiB S3 state + low DynamoDB lock traffic | <$0.10/month |
| Approximate 24/7 AWS demo subtotal | Running all month | ~$56.20/month |
| Approximate 24-hour review window | Run for one day, then destroy | ~$1.85 |
| Approximate 8-hour review window | Run for a review session, then destroy | ~$0.62 |

Caveats:

- This is a planning estimate, not an AWS bill. Taxes, data transfer, NAT gateways, VPC endpoints, backups/snapshots, WAF, Route 53, ACM, CloudWatch alarms, higher log volume, RDS CPU credit surplus, Multi-AZ, autoscaling, and longer retention are excluded.
- Leaving the demo running 24/7 is the expensive path; ALB, Fargate, and RDS compute dominate the monthly subtotal. Destroy promptly after review.
- RDS storage, Secrets Manager, ECR storage, S3 state, and residual logs can continue costing money until deleted even if compute is stopped.
- For request-volume planning, add the MiniMax token estimates above to the AWS runtime subtotal for the period when the stack is live.

## Local quick start

Prerequisites:

- Node.js 22+
- npm
- PostgreSQL 16+ for full persistence.
- `pgvector`-capable PostgreSQL for `RETRIEVAL_BACKEND=pgvector` or `RETRIEVAL_BACKEND=hybrid`; Docker Compose uses `pgvector/pgvector:pg16`.

### Fastest local path: Docker Compose

Use this when the reviewer wants the simplest local run. Compose starts the React frontend, Node API, and a pgvector-capable PostgreSQL database:

```bash
POSTGRES_PASSWORD=local-postgres \
JWT_SECRET=DocuLensLocalJwtSecret1234567890Aa \
MINIMAX_API_KEY=minimax-local-placeholder \
RETRIEVAL_BACKEND=hybrid \
EMBEDDING_PROVIDER=local_hashing \
EMBEDDING_MODEL=doculens-local-hashing-v1 \
EMBEDDING_DIMENSIONS=384 \
EMBEDDING_STRICT=false \
docker-compose up --build
```

Open `http://127.0.0.1:5173` for the UI and `http://127.0.0.1:3000/health` for the API health check. Use a real `MINIMAX_API_KEY` for live analysis/chat; the placeholder is only for booting local non-live paths. Stop and remove local database volume with:

```bash
docker-compose down -v
```

### Manual local path

Install:

```bash
npm ci
```

Configure private environment through shell exports or a local-only sourced `.env`:

```bash
DATABASE_URL=postgresql://doculens:doculens@127.0.0.1:5432/doculens
JWT_SECRET=<strong-local-secret>
AI_PROVIDER=minimax
MINIMAX_API_KEY=<real-key-or-local-placeholder-for-non-live-paths>
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3

# Retrieval defaults are safe lexical fallback.
RETRIEVAL_BACKEND=lexical_fallback

# No-cost local vector/hybrid proof path. No embedding API key is required.
EMBEDDING_PROVIDER=local_hashing
EMBEDDING_MODEL=doculens-local-hashing-v1
EMBEDDING_DIMENSIONS=384
EMBEDDING_STRICT=false
```

Reset, migrate, and seed:

```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```

### Retrieval backends and fallback behavior

`RETRIEVAL_BACKEND=lexical_fallback` is the default safe mode and reports the effective backend as `lexical_fallback` with fallback reason `retrieval_disabled`.

`RETRIEVAL_BACKEND=pgvector` embeds the query with the in-process local hashing provider and searches owned, ready, non-deleted document chunks through PostgreSQL pgvector cosine distance. `RETRIEVAL_BACKEND=hybrid` uses the same repository-backed vector path plus deterministic lexical and heading signals:

```txt
0.75 * vectorScore + 0.20 * lexicalScore + 0.05 * headingMatchScore
```

The configured backend and effective backend are distinct. The API/eval metadata reports `pgvector` or `hybrid` only when the PostgreSQL repository vector/hybrid path executes with `postgresql_repository` provenance. Otherwise it reports `lexical_fallback` with a precise reason:

- `retrieval_disabled`: lexical mode is intentionally configured.
- `embedding_unavailable`: local query or chunk embedding generation failed or exceeded configured bounds.
- `missing_chunk_embeddings`: existing/stale chunks do not have ready embeddings.
- `vector_unavailable`: pgvector extension, vector column/operator/index, or runtime vector search is unavailable.
- `preferred_backend_unavailable`: vector/hybrid was configured but the repository-backed preferred search is not wired or did not prove PostgreSQL provenance.

`EMBEDDING_STRICT=false` degrades to labeled lexical fallback when embedding work fails and preserves ordinary chunks when safe. `EMBEDDING_STRICT=true` fails ingestion or query handling closed with an operator-readable prerequisite/configuration error instead of exposing partial vector-ready state.

The first embedding provider is intentionally no-cost and in-container: `local_hashing` with model `doculens-local-hashing-v1` and `384` dimensions. It performs deterministic feature hashing locally, stores provider/model/dimension/status metadata with chunks, and does not use MiniMax, hosted embeddings, external embedding credentials, or paid embedding calls. This proves vector storage/search and hybrid provenance; it is not a claim of production-grade hosted semantic embedding quality.

Run the app:

```bash
npm run dev --workspace apps/api
npm run dev --workspace apps/web
```

Default ports:

- React UI: `http://127.0.0.1:5173`
- Node API: `http://127.0.0.1:3000`

## Common commands

```bash
npm run build
npm run test:unit
npm run verify
npm run test:integration
npm run test:aws
npm run smoke:markitdown
npx playwright test tests/e2e/doculens-ui.spec.mjs --reporter=list
```

Docker Compose:

```bash
POSTGRES_PASSWORD=local-postgres \
JWT_SECRET=DocuLensLocalJwtSecret1234567890Aa \
MINIMAX_API_KEY=minimax-local-placeholder \
RETRIEVAL_BACKEND=hybrid \
EMBEDDING_PROVIDER=local_hashing \
EMBEDDING_MODEL=doculens-local-hashing-v1 \
EMBEDDING_DIMENSIONS=384 \
EMBEDDING_STRICT=false \
docker-compose up --build
```

Before claiming local vector readiness, run migrations against the Compose database and verify pgvector:

```sql
select extname from pg_extension where extname = 'vector';
select atttypid::regtype::text from pg_attribute where attrelid = 'document_chunks'::regclass and attname = 'embedding';
```

AWS image smoke:

```bash
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .
```

## AWS demo

Terraform lives in `infra/aws`. The stack is disposable demo-grade infrastructure: public ALB, one ECS Fargate service, RDS PostgreSQL, Secrets Manager bindings, CloudWatch logs, IAM, and remote S3/DynamoDB Terraform state.

See [AWS Deployment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/AWS-Deployment) for release/deploy, rollback, destroy, cost, and production-gap notes.

The current Terraform AWS demo does not expose `RETRIEVAL_BACKEND` or `EMBEDDING_*` task environment variables, so the deployed task runs `lexical_fallback` by default. If operators extend the ECS task environment or override it outside Terraform to set `pgvector`/`hybrid`, the RDS engine and database must pass pgvector/vector-column readiness checks and application metadata must prove an effective vector backend before deploy notes or reviewer demos claim it. See `infra/aws/README.md` for operator checks.

## Security

Secrets are not stored in the repository. GitHub Actions uses OIDC for AWS access, and runtime secret payloads live outside the repo in AWS Secrets Manager or private local environment variables. Logs and model prompts are covered by centralized redaction contracts.

See [Security and Secrets](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Security-and-Secrets) for details.

## Public limitations

- Live MiniMax chat/analysis proof requires a real `MINIMAX_API_KEY` and explicit opt-in.
- Streaming responses, LLM tool/function calling, and queue/worker processing remain out of scope for this assessment implementation.
- PDF support is for small text-based PDFs through conversion; OCR/scanned-document extraction is not claimed.
- Local vector/hybrid retrieval uses deterministic no-cost `local_hashing` embeddings inside the Node container. It proves pgvector/hybrid wiring and fallback honesty, but it is not hosted/deep semantic embedding quality.
- Existing documents ingested before the vector migration may report `missing_chunk_embeddings` until reingested or backfilled.
- The app explains retention and audit tradeoffs, but it does not implement automatic document TTLs, production DLP, enterprise audit exports, or human review queues.
- AWS vector/hybrid demos require an ECS task environment that sets retrieval/embedding variables, an RDS PostgreSQL version with pgvector available, and explicit operator verification before claiming an effective vector backend.
- AWS `terraform apply` requires protected `aws-demo` environment approval, a pushed image digest, and populated external secret ARNs.
- The AWS stack is disposable demo-grade infrastructure, not production-ready.

## OpenSpec

Change artifacts live under `openspec/changes/`. Validate OpenSpec changes with:

```bash
openspec validate --changes <change-name>
```
