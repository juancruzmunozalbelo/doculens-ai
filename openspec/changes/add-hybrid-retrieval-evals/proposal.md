## Why

DocuLens currently labels pgvector/hybrid retrieval as the preferred production target, but the implementation path still depends on lexical fallback unless a caller injects a preferred search. This change adds no-cost vector/hybrid retrieval evidence that runs inside the Docker/ECS app container while explicitly preventing metadata-only vector claims.

## What Changes

- Add a real pgvector-backed retrieval path for document chunks, including vector storage, query-time embedding, backend metadata, and safe fallback to labeled lexical retrieval when embeddings or vector search are unavailable at runtime.
- Lock the first no-cost embedding provider contract before schema work: `EMBEDDING_PROVIDER=local_hashing`, `EMBEDDING_MODEL=doculens-local-hashing-v1`, `EMBEDDING_DIMENSIONS=384`; this provider runs in-process and performs no paid API calls.
- Add hybrid retrieval behavior that combines local vector similarity with existing lexical/section-aware signals through a fixed formula and component metadata without weakening unsupported-answer policy.
- Add deterministic retrieval evals covering golden assessment questions, controlled paraphrase/lexical-negative cases appropriate to the local embedding model, expected chunks/sections, backend provenance, fallback reasons, answer-state behavior, and citation claim support.
- Add local and AWS/demo documentation for pgvector prerequisites, embedding configuration, effective-vs-configured backend status, fallback behavior, and production gaps.
- Preserve existing API response shape and reviewer UI contracts; no route-level breaking API changes are intended. Applying this change requires a pgvector-capable PostgreSQL runtime for migrations.

## Capabilities

### New Capabilities
- `pgvector-hybrid-retrieval`: Stores and searches chunk embeddings through PostgreSQL pgvector, exposes `pgvector`/`hybrid` backend metadata only when the repository vector path executes, and falls back honestly when query embeddings, chunk embeddings, or vector search are unavailable.
- `retrieval-quality-evals`: Defines deterministic eval contracts for no-cost vector/hybrid retrieval quality, golden question chunk coverage, backend provenance, citation claim support, and fallback/unsupported behavior.

### Modified Capabilities
- None. There are no archived main specs in `openspec/specs/`; existing retrieval and eval expectations live in prior change specs and are used as context rather than modified main capabilities.

## Impact

- Backend: `apps/api/src/server/retrieval/`, `apps/api/src/server/ingestion/`, `apps/api/src/server/postgresql/repositories.mjs`, `apps/api/src/server/config/env.mjs`, and server wiring in `apps/api/src/server/index.mjs`.
- Database: new migration for pgvector extension, `vector(384)` chunk embedding column, embedding metadata, embedding coverage metadata, and vector indexes. The migration requires a pgvector-capable PostgreSQL runtime.
- Config/secrets: `RETRIEVAL_BACKEND`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, and `EMBEDDING_STRICT`; the default local hashing provider requires no provider key, no external embedding service, and no paid embedding calls.
- Tests/evals: retrieval unit tests, PostgreSQL migration/integration checks, cross-tenant vector tests, stale/no-embedding document tests, chat API answer-state coverage, and eval golden questions for the assessment PDF/source.
- Infra/docs: Docker Compose PostgreSQL image requirements, RDS pgvector prerequisite checks, root README updates, `infra/aws/README.md` updates, configured-vs-effective backend status, and fallback limitations.
