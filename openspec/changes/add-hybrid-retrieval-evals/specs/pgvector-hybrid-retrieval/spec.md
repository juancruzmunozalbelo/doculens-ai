## ADDED Requirements

### Requirement: Embedding configuration is explicit and dimension-safe
The system SHALL validate retrieval and embedding configuration before using pgvector or hybrid retrieval.

#### Scenario: Supported embedding configuration is accepted
- **WHEN** `RETRIEVAL_BACKEND` is `pgvector` or `hybrid` and `EMBEDDING_PROVIDER=local_hashing`, `EMBEDDING_MODEL=doculens-local-hashing-v1`, and `EMBEDDING_DIMENSIONS=384` are configured
- **THEN** the system SHALL construct an in-process embedding provider and preferred retrieval path without requiring provider credentials, external embedding services, or paid embedding calls.

#### Scenario: Unsupported embedding configuration fails closed
- **WHEN** vector retrieval is configured with an unsupported embedding provider, unsupported model, or non-384 dimension for the first migration
- **THEN** startup, ingestion, or query handling SHALL fail closed with an operator-readable configuration error and SHALL NOT claim `pgvector` or `hybrid` retrieval.

#### Scenario: Provider-returned dimension mismatch is rejected
- **WHEN** an embedding provider returns a vector whose length does not match the configured and stored dimension
- **THEN** the system SHALL reject or mark the embedding operation failed before storing or querying with an invalid vector.

### Requirement: Chunk embeddings are stored with pgvector metadata
The system SHALL store document chunk embeddings in PostgreSQL using pgvector-compatible storage and SHALL record the embedding provider, model, dimension, creation status, and coverage metadata needed to interpret those vectors.

#### Scenario: New chunks receive embeddings
- **WHEN** a supported document is ingested with vector retrieval enabled and the embedding provider is available
- **THEN** each persisted chunk SHALL include a `vector(384)` embedding and embedding metadata matching the configured provider, model, and dimension.

#### Scenario: Existing chunk identity is preserved
- **WHEN** embeddings are added to chunks
- **THEN** existing stable chunk IDs, chunk indexes, heading paths, content, document ownership, and citation relationships SHALL remain unchanged.

#### Scenario: Existing chunks lack embeddings
- **WHEN** vector retrieval is enabled for a document whose chunks do not have embeddings
- **THEN** the system SHALL NOT claim `pgvector` or `hybrid` for that document and SHALL report labeled `lexical_fallback` with fallback reason `missing_chunk_embeddings` unless a bounded backfill/re-embed operation succeeds.

### Requirement: Preferred retrieval uses repository-backed pgvector search when available
The system SHALL execute pgvector-backed preferred retrieval through the PostgreSQL repository for user questions when vector retrieval is configured, query embeddings exist, chunk embeddings exist, and PostgreSQL pgvector support is available.

#### Scenario: Query uses local vector similarity
- **WHEN** a user asks a question against a document whose chunks have embeddings
- **THEN** retrieval SHALL locally embed the query, search owned document chunks by pgvector cosine distance, and return top-k chunks ordered by bounded normalized score and stable chunk index tie-breakers.

#### Scenario: Backend metadata reports pgvector only for repository vector search
- **WHEN** preferred retrieval successfully uses the PostgreSQL repository pgvector search path
- **THEN** chat metadata and eval output SHALL report retrieval backend `pgvector` and SHALL NOT report `pgvector` for injected fake preferred searches or lexical fallback rows.

#### Scenario: Authorization is preserved in vector search
- **WHEN** vector search runs for a user-owned document
- **THEN** the SQL query SHALL scope chunks by document ID, current user ownership, non-failed document status, and non-deleted document state before vector ordering and limit are applied.

#### Scenario: Cross-tenant nearest chunk cannot affect recall
- **WHEN** another user's chunk is semantically closer to the query than the current user's chunks
- **THEN** vector search SHALL neither return nor let that other user's chunk consume the authorized user's top-k candidate slots.

### Requirement: Hybrid retrieval combines semantic and deterministic source signals
The system SHALL support a hybrid retrieval mode that combines vector similarity with deterministic lexical or section-aware signals while keeping scores bounded, deterministic, and explainable.

#### Scenario: Hybrid backend is reported only for repository hybrid search
- **WHEN** retrieval is configured for hybrid mode and the PostgreSQL repository successfully combines vector and deterministic signals
- **THEN** chat metadata and eval output SHALL report retrieval backend `hybrid` and include component score metadata for the returned chunks.

#### Scenario: Hybrid ranking remains deterministic
- **WHEN** two chunks have equivalent hybrid scores
- **THEN** retrieval SHALL break ties by stable chunk index rather than nondeterministic database ordering.

#### Scenario: Hybrid scoring is bounded and ordered
- **WHEN** vector distances and lexical/heading components are combined
- **THEN** normalized vector, lexical, heading, and hybrid scores SHALL remain bounded between 0 and 1 and SHALL order stronger evidence ahead of weaker evidence.

#### Scenario: Hybrid retrieval does not weaken unsupported policy
- **WHEN** a question is outside the selected document or lacks sufficient source evidence after hybrid retrieval
- **THEN** the system SHALL return unsupported or insufficient-evidence behavior instead of fabricating an answer or citations.

### Requirement: Vector retrieval falls back honestly when unavailable
The system SHALL preserve lexical fallback behavior and clearly label fallback reasons when vector retrieval is disabled, query embeddings fail, chunk embeddings are missing, pgvector search is unavailable, or preferred retrieval is not wired.

#### Scenario: Vector retrieval is intentionally disabled
- **WHEN** `RETRIEVAL_BACKEND=lexical_fallback`
- **THEN** retrieval SHALL report backend `lexical_fallback` with a reason that distinguishes intentional lexical mode from an embedding outage.

#### Scenario: Embedding provider is unavailable
- **WHEN** query embedding cannot be generated because the embedding provider is missing, unconfigured, over budget, timed out, or fails closed
- **THEN** retrieval SHALL either return a safe error in strict mode or use labeled `lexical_fallback` with a precise fallback reason in degraded mode.

#### Scenario: pgvector runtime search is unavailable
- **WHEN** PostgreSQL schema exists but vector query operators, indexes, or search execution fail at runtime
- **THEN** retrieval SHALL use labeled `lexical_fallback` with fallback reason `vector_unavailable` rather than claiming `pgvector` or `hybrid`.

#### Scenario: Preferred search is not wired
- **WHEN** vector or hybrid backend is configured but server wiring does not construct a repository-backed preferred search
- **THEN** retrieval SHALL use labeled `lexical_fallback` with fallback reason `preferred_backend_unavailable` and evals SHALL fail if metadata claims `pgvector` or `hybrid`.

#### Scenario: Fallback metadata is visible
- **WHEN** lexical fallback is used after preferred retrieval fails or is unavailable
- **THEN** API metadata and eval output SHALL identify the effective `retrievalBackend` as `lexical_fallback`, include the backend fallback reason, and distinguish configured backend from effective backend.

### Requirement: Embedding ingestion is bounded and redaction-safe
The system SHALL bound synchronous embedding work and SHALL prevent embedding inputs, outputs, and provider payloads from leaking into logs or reviewer-facing output.

#### Scenario: Embeddings are batched with limits
- **WHEN** a document is ingested with vector retrieval enabled
- **THEN** embedding generation SHALL use bounded `embedTexts` batches and enforce configured timeout, maximum chunks, and maximum text/character budget for the assessment path.

#### Scenario: Embedding failure in degraded mode preserves lexical usability
- **WHEN** chunk embedding fails in degraded mode after document text is accepted
- **THEN** the system SHALL persist ordinary chunks when safe, record vector coverage failure metadata, and make retrieval report a precise lexical fallback reason.

#### Scenario: Embedding failure in strict mode fails closed
- **WHEN** chunk embedding fails in strict mode
- **THEN** the system SHALL fail or mark the document failed without exposing partial vector state as ready for pgvector or hybrid retrieval.

#### Scenario: Embedding data is not leaked
- **WHEN** embedding requests, responses, errors, or fallback diagnostics are logged or returned
- **THEN** raw document text, raw query text, vector arrays, provider payloads, and secret values SHALL NOT appear in logs, API responses, eval output, or reviewer UI.

### Requirement: Local and AWS runtime prerequisites are documented
The system SHALL document the runtime prerequisites for pgvector/hybrid retrieval and the production limitations that remain outside the assessment slice.

#### Scenario: Local setup uses pgvector-capable PostgreSQL
- **WHEN** a developer follows local setup for vector retrieval
- **THEN** documentation SHALL identify the required pgvector-capable PostgreSQL image or installation path and the migration command that enables vector schema.

#### Scenario: AWS demo prerequisites are explicit
- **WHEN** deploying the demo stack with vector retrieval enabled
- **THEN** documentation SHALL state that the target RDS PostgreSQL version must support pgvector and include an operator verification command before claiming vector retrieval.

#### Scenario: Configured and effective backend are documented
- **WHEN** docs explain retrieval configuration
- **THEN** docs SHALL distinguish configured backend from effective backend and show examples for lexical-only, pgvector, hybrid, missing embeddings, unavailable provider, and runtime vector failure.
