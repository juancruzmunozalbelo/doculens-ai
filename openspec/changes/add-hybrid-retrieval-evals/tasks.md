## 1. Retrieval Contracts and Test Fixtures

- [x] 1.1 Lock the no-cost embedding provider/model/dimension contract: `EMBEDDING_PROVIDER=local_hashing`, `EMBEDDING_MODEL=doculens-local-hashing-v1`, `EMBEDDING_DIMENSIONS=384`, and strict/degraded defaults.
- [x] 1.2 Add failing config coverage for valid/invalid retrieval backend, embedding provider, embedding model, embedding dimension, and strict/degraded mode; default local hashing must require no provider key.
- [x] 1.3 Add failing unit coverage for embedding provider dimension validation, batched `embedTexts`, timeout/limit handling, and redaction-safe metadata.
- [x] 1.4 Add failing PostgreSQL migration/integrity coverage for pgvector extension, `vector(384)` embedding column, embedding metadata, partial index, and idempotency.
- [x] 1.5 Add failing retrieval provider coverage proving `pgvector` or `hybrid` labels appear only when PostgreSQL repository vector/hybrid search executes.
- [x] 1.6 Add failing fallback coverage for `retrieval_disabled`, `embedding_unavailable`, `missing_chunk_embeddings`, `vector_unavailable`, and `preferred_backend_unavailable` metadata.
- [x] 1.7 Add deterministic fixtures for controlled paraphrase, lexical-negative, cross-tenant closer-vector, stale/no-embedding, unsupported, and low-evidence retrieval cases.

## 2. Database and Runtime Prerequisites

- [x] 2.1 Update local Docker Compose or test runtime to use a canonical pgvector-capable PostgreSQL service for vector migration/eval proof.
- [x] 2.2 Add a new migration for `vector` extension, nullable `embedding vector(384)`, embedding provider/model/dimension/status metadata, embedding coverage fields, and a partial vector index.
- [x] 2.3 Update migration/reset checks so pgvector schema creation remains idempotent and existing chunk/citation constraints stay intact.
- [x] 2.4 Add pgvector preflight checks for strict vector mode: extension installed, vector type/operator available, expected column dimension present, and vector index present.
- [x] 2.5 Add configuration parsing for `RETRIEVAL_BACKEND`, `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `EMBEDDING_STRICT`, and configured-vs-effective backend diagnostics.
- [x] 2.6 Preserve safe startup and lexical fallback when vector retrieval is disabled, while failing migration/startup with an operator-readable prerequisite error when pgvector schema is required but unavailable.

## 3. Embedding Provider and Ingestion

- [x] 3.1 Add an `EmbeddingProvider` contract with `embedText` and bounded `embedTexts` behavior plus deterministic test fake.
- [x] 3.2 Implement the selected local hashing embedding provider behind the contract using normalized word/character n-gram feature hashing, L2 normalization, no network calls, no provider secrets, and no paid API usage.
- [x] 3.3 Implement dimension validation, provider/model metadata normalization, timeout handling, max chunk/text budget handling, and safe error codes for embedding failures.
- [x] 3.4 Wire `DocumentService`/ingestion to enrich chunks with embeddings before repository persistence when vector retrieval is enabled; repositories must not call embedding providers.
- [x] 3.5 Persist chunk embeddings and embedding metadata without changing stable chunk IDs, heading paths, indexes, content, ownership, or citation relationships.
- [x] 3.6 Implement strict-mode embedding failure behavior that fails or marks the document failed without exposing partial vector-ready state.
- [x] 3.7 Implement degraded-mode embedding failure behavior that persists ordinary chunks when safe and records fallback metadata for lexical retrieval.
- [x] 3.8 Detect existing/stale documents whose chunks lack embeddings and report `missing_chunk_embeddings` unless a bounded backfill/re-embed path succeeds.

## 4. pgvector and Hybrid Retrieval

- [x] 4.1 Add PostgreSQL repository search for pgvector cosine distance scoped by document ID, current user ownership, non-deleted state, and non-failed status before vector ordering and limit.
- [x] 4.2 Add cross-tenant vector integration coverage where another user's closer vector cannot leak or consume top-k capacity.
- [x] 4.3 Normalize vector similarity as `clamp(1 - cosine_distance, 0, 1)`, exclude null embeddings, preserve ascending SQL distance order, and keep chunk-index tie-breaking.
- [x] 4.4 Add hybrid retrieval scoring using `0.75 * vectorScore + 0.20 * lexicalScore + 0.05 * headingMatchScore`, with bounded component metadata and deterministic ties.
- [x] 4.5 Wire server default retrieval construction to pass configured preferred backend and repository-backed preferred search into `RetrievalProvider` only when vector readiness checks pass.
- [x] 4.6 Preserve existing lexical fallback behavior and precise fallback reasons when preferred retrieval fails, is disabled, lacks chunk embeddings, or is not wired.
- [x] 4.7 Verify hybrid retrieval does not promote unsupported or low-evidence questions to grounded answers without sufficient support.

## 5. Retrieval Quality Evals

- [x] 5.1 Build golden retrieval evals on a pgvector-capable PostgreSQL repository path; faked preferred search may be used only for unit tests and must be labeled test-only.
- [x] 5.2 Add eval assertions that each assessment golden question retrieves expected evidence sections before checking answer text.
- [x] 5.3 Add controlled paraphrase and lexical-negative eval cases that fail or clearly report `lexical_fallback` when vector/hybrid retrieval is not actually used.
- [x] 5.4 Add eval assertions for configured backend, effective backend, backend provenance, and fallback reason.
- [x] 5.5 Add eval assertions that citations map only to retrieved chunk IDs, citation quotes are supported by cited chunks, and nontrivial answer claims are supported by expected evidence.
- [x] 5.6 Add adversarial provider-answer fixtures that try to pass citation mechanics with unsupported answer claims.
- [x] 5.7 Add eval assertions that outside-source questions remain unsupported and precise low-evidence questions remain insufficient or unsupported.
- [x] 5.8 Add stale/no-embedding document eval coverage that reports `missing_chunk_embeddings` or proves successful backfill before pgvector/hybrid claims.
- [x] 5.9 Make retrieval eval output reviewer-readable with question category, matched evidence, configured backend, effective backend, backend provenance, fallback reason, answer state, citation result, claim-support result, and pass/fail status.
- [x] 5.10 Assert eval output states the local hashing provider is no-cost and in-container, and does not claim hosted/deep semantic embedding quality.

## 6. Documentation and Verification

- [x] 6.1 Update root `README.md` for pgvector prerequisites, embedding env vars, runtime secrets, strict/degraded modes, configured-vs-effective backend, fallback reasons, and production roadmap limits.
- [x] 6.2 Update `infra/aws/README.md` to state RDS pgvector prerequisite verification commands before claiming vector or hybrid retrieval.
- [x] 6.3 Update reviewer/wiki-facing notes only after repo docs are accurate; external wiki publication is non-blocking for implementation.
- [x] 6.4 Run targeted retrieval unit tests covering provider config, embedding provider, fallback taxonomy, score normalization, hybrid formula, and answer-state policy.
- [x] 6.5 Run targeted PostgreSQL migration/integrity tests with a pgvector-capable test database.
- [x] 6.6 Run chat API and retrieval eval tests for golden assessment questions, controlled paraphrases, unsupported questions, citation validity, claim support, backend provenance, and fallback metadata.
- [x] 6.7 Confirm docs and eval output do not require external embedding credentials and do not claim MiniMax-M3 or hosted semantic embeddings for the local vector path.
- [x] 6.8 Run OpenSpec validation for `add-hybrid-retrieval-evals`.
