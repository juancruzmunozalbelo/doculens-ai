# DocuLens AI

DocuLens AI is a source-first AI document reviewer for the Full Stack AI Engineer assessment. It lets an authenticated reviewer choose one active source, generate a concise review briefing, ask grounded questions, inspect inline citations, and keep technical AI internals out of the primary reviewer path.

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

Repo docs are the source of truth for the hybrid retrieval proof in this change. External wiki publication can follow later; reviewer claims about vector or hybrid retrieval should not be made from wiki pages until the README and `infra/aws/README.md` prerequisites above are reflected there.

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

- The server default MiniMax budget caps live calls at 32, input tokens at 8,000, context tokens at 8,000, output tokens at 800, timeout at 30,000 ms, retries at 1, concurrency at 2, and max estimated live-call cost at $1.
- The provider rejects exhausted live-call budgets, over-limit input/context tokens, over-limit output tokens, exceeded estimated-cost budgets, invalid timeout/retry budgets, and concurrency overflow before the network call is made.
- Over-budget requests fail closed before MiniMax transport invocation instead of silently making an over-budget live call.

Caveats:

- Actual provider billing can vary by MiniMax tokenizer behavior, document length, retrieved chunk volume, answer length, retry behavior, provider pricing changes, cache usage, service tier, long-context routing, failed requests, and unsupported requests.
- The estimates use representative averages and repo token-estimation heuristics for planning; they are not billing reconciliation.
- Streaming responses, LLM tool/function calling, and queue/worker processing remain out of scope for this assessment implementation.
## Local quick start

Prerequisites:

- Node.js 22+
- npm
- PostgreSQL 16+ for full persistence.
- `pgvector`-capable PostgreSQL for `RETRIEVAL_BACKEND=pgvector` or `RETRIEVAL_BACKEND=hybrid`; Docker Compose uses `pgvector/pgvector:pg16`.
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

For AWS vector or hybrid retrieval, the RDS engine must support pgvector and the database must pass the extension/vector-column readiness checks before deploy notes or reviewer demos claim an effective `pgvector` or `hybrid` backend. See `infra/aws/README.md` for operator commands.

## Security

Secrets are not stored in the repository. GitHub Actions uses OIDC for AWS access, and runtime secret payloads live outside the repo in AWS Secrets Manager or private local environment variables. Logs and model prompts are covered by centralized redaction contracts.

See [Security and Secrets](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Security-and-Secrets) for details.

## Current limitations

- Live MiniMax chat/analysis proof requires a real `MINIMAX_API_KEY` and explicit opt-in.
- Local vector/hybrid retrieval uses deterministic no-cost `local_hashing` embeddings inside the Node container. It proves pgvector/hybrid wiring and fallback honesty, but it is not hosted/deep semantic embedding quality.
- Existing documents ingested before the vector migration may report `missing_chunk_embeddings` until reingested or backfilled.
- AWS vector/hybrid demos require an RDS PostgreSQL version with pgvector available and explicit operator verification before claiming an effective vector backend.
- AWS `terraform apply` requires protected `aws-demo` environment approval, a pushed image digest, and populated external secret ARNs.
- The AWS stack is demo-grade, not production-ready.

## OpenSpec

Change artifacts live under `openspec/changes/`. Validate OpenSpec changes with:

```bash
openspec validate --changes <change-name>
```
