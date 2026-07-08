## Context

DocuLens already has the right retrieval seam: `RetrievalProvider` accepts a preferred backend/search function, recognizes `pgvector` and `hybrid`, and falls back to labeled lexical retrieval when preferred retrieval is unavailable. The current default server wiring only passes a chunk repository, so normal runtime behavior still depends on lexical fallback unless tests or callers inject `preferredSearch`.

The database stores ordered, section-aware chunks and retrieval metadata, but chunks do not have embeddings. Docker Compose uses a vanilla PostgreSQL image, so local pgvector support also needs an explicit runtime change. Council/adversarial review identified the main risk: this change must not pass through metadata theater, fake preferred searches, or broad lexical-friendly evals. The revised constraint is no paid embedding provider: the proof path must run entirely inside the Docker image/ECS task with a local deterministic embedding implementation and a repository-backed pgvector path.

Stakeholders:
- Reviewer: needs proof that `pgvector`/`hybrid` is real, not metadata theater.
- Maintainer: needs a bounded implementation that preserves current fallback and unsupported-answer safety.
- Operator: needs clear local/AWS prerequisites and failure modes when pgvector, query embeddings, or chunk embeddings are unavailable.

## Goals / Non-Goals

**Goals:**
- Store chunk embeddings in PostgreSQL through pgvector with provider/model/dimension metadata.
- Lock the first no-cost embedding contract to `EMBEDDING_PROVIDER=local_hashing`, `EMBEDDING_MODEL=doculens-local-hashing-v1`, and `EMBEDDING_DIMENSIONS=384` before schema implementation.
- Generate local hashed text embeddings for newly ingested chunks and for query text through an explicit embedding provider boundary, with no external API key or paid provider call.
- Detect existing chunks that lack embeddings and report a distinct `missing_chunk_embeddings` degraded reason unless a bounded backfill/re-embed path succeeds.
- Wire the server default retrieval path to a real PostgreSQL repository preferred search when configured and healthy.
- Support `pgvector` and `hybrid` backend metadata while preserving labeled `lexical_fallback` behavior.
- Add deterministic evals proving golden assessment questions retrieve expected sections/chunks, include controlled paraphrase cases suitable for the local embedding model, reject metadata theater, and preserve unsupported-answer behavior.
- Keep API and UI response shapes stable.

**Non-Goals:**
- No production async worker/backfill system in this change; synchronous embedding during ingestion is acceptable for the assessment slice and existing chunks may remain lexical-only with explicit metadata unless a bounded command handles them.
- No claim that pgvector/hybrid is production-tuned for large corpora.
- No broad multi-provider parity beyond the embedding provider contract, the selected local hashing implementation, and deterministic test fixtures.
- No OCR, multi-document synthesis, streaming, or queue-based processing.
- No removal of lexical fallback.

## Decisions

### Decision 0: Lock the first embedding contract before schema work

The assessment proof path will use `EMBEDDING_PROVIDER=local_hashing`, `EMBEDDING_MODEL=doculens-local-hashing-v1`, and `EMBEDDING_DIMENSIONS=384`. The provider runs in-process inside the Node API container and produces deterministic L2-normalized feature-hashing vectors from normalized word/character n-grams plus heading text. The migration will encode `embedding vector(384)` and store embedding provider/model/dimension metadata on each embedded chunk. Changing dimensions later requires a new migration and a re-embedding/backfill plan, not an in-place runtime toggle.

Default runtime posture:
- `RETRIEVAL_BACKEND=lexical_fallback` remains the safest no-vector mode.
- `RETRIEVAL_BACKEND=pgvector|hybrid` requires pgvector schema readiness and the local embedding provider.
- `EMBEDDING_STRICT=false` degrades to labeled lexical fallback when local embedding generation fails; `EMBEDDING_STRICT=true` fails ingestion or query handling closed with an operator-readable error.
- There is no paid or network embedding dependency in the default proof path; any future hosted embedding provider must be a separate change and must not be claimed by this one.

Rationale: the deployment must run in the existing Docker/ECS shape without new paid AI calls. A fixed local embedding model still proves real vector storage, vector SQL, tenancy-safe KNN, hybrid ranking, fallback taxonomy, and eval behavior. It is not a claim of production-grade semantic embeddings.

Alternatives considered:
- Hosted OpenAI/MiniMax/Bedrock embeddings: rejected for this change because they add cost, secrets, external latency, and provider availability risk.
- Keep provider/model open until implementation: rejected because migration and config validation depend on it.
- Use dimensionless metadata-only vectors: rejected because it weakens index/operator guarantees.
- Use only lexical fallback: rejected because it would not exercise pgvector storage/search.

### Decision 1: Add an `EmbeddingProvider` boundary separate from `AIProvider`

Embeddings are not chat completions. Add a small provider contract such as `embedText`/`embedTexts` that returns vectors plus provider, model, and dimension metadata. Keep it separate from MiniMax chat/analysis provider code.

Rationale: retrieval quality, cost, batching, model dimensions, and failure modes are different from answer generation. A separate boundary avoids coupling chunk ingestion and question retrieval to the chat provider implementation.

Alternatives considered:
- Reuse `AIProvider`: rejected because it mixes completion and embedding responsibilities and makes configuration harder to reason about.
- Store deterministic fake vectors only: rejected because it would create a fake vector-RAG claim.

### Decision 2: Add pgvector schema through a new migration, not by editing the foundation migration

Add `vector` extension, nullable `embedding vector(384)`, embedding provider/model/dimension metadata, embedding status metadata, and a partial vector index where embeddings exist. Keep existing chunk identity and citation constraints unchanged.

Migration posture: this change requires a pgvector-capable PostgreSQL runtime before applying the vector migration. Lexical-only runtime remains a supported application mode after the schema exists, but a database that cannot install the `vector` extension is outside this change's migration prerequisites. Local Docker Compose should move to a pgvector-capable PostgreSQL image for the vector proof path. AWS docs must include an explicit RDS extension verification step before deploy claims vector readiness.

Rationale: current migrations are part of the project contract. A new migration makes the change reviewable while preserving existing database integrity tests. Making pgvector a migration prerequisite avoids pretending an unconditional migration can both require and not require the extension.

Alternatives considered:
- Rewrite `001_foundation_schema.sql`: rejected because it obscures the migration story and risks breaking existing reset/integrity assumptions.
- Store vectors only inside `retrieval_metadata`: rejected because pgvector indexing and distance operators require a vector column.
- Build optional migration orchestration now: rejected as extra migration-runner scope; document pgvector as a hard prerequisite for this change's schema.

### Decision 3: Orchestrate embeddings in ingestion/service code, not repositories

The ingestion flow should be explicit:
1. `DocumentService` normalizes and chunks the source.
2. If vector retrieval is enabled, `DocumentService`/ingestion calls `embeddingProvider.embedTexts` in bounded local batches.
3. The service validates vector dimensions and attaches embedding metadata to chunks.
4. `chunksRepository.createManyForDocument` stores supplied vectors/metadata and enforces document ownership/integrity.
5. The repository never computes embeddings; it only persists embeddings and performs vector/hybrid SQL search.

Strict mode reuses existing failed-document/rollback behavior when embedding fails. Degraded mode persists ordinary chunks, records embedding coverage failure metadata, and lets retrieval report `missing_chunk_embeddings` or `embedding_unavailable` before lexical fallback.

Rationale: synchronous local embedding is enough to prove real pgvector behavior without introducing workers, job tables, queues, external providers, secrets, or status UI. Keeping embedding computation out of repositories preserves separation between persistence and feature extraction.

Alternatives considered:
- Async embedding worker now: better production shape, but too much scope for this change.
- Require embeddings for every document: rejected because provider outages should not make the whole app unusable unless strict mode is explicitly configured.
- Call embedding providers from PostgreSQL repositories: rejected because persistence should not own network/provider behavior.

### Decision 4: Implement preferred search in PostgreSQL repository and wire it through server config

Add repository methods for vector search and hybrid search. SQL must join/authorize through `documents` and apply `document_id`, `user_id`, `status <> 'failed'`, and `deleted_at is null` inside the nearest-neighbor candidate set before `ORDER BY` and `LIMIT`. Server startup should construct `preferredSearch` only when retrieval config, pgvector support, embedding provider, schema readiness, and repository support are available. Otherwise `RetrievalProvider` keeps existing fallback behavior with a precise reason.

Rationale: `RetrievalProvider` already owns backend/fallback metadata. The repository should own SQL and document/user scoping. Filtering preferred-search rows after a global nearest-neighbor limit is not sufficient because it can collapse recall and risks tenant leakage.

Alternatives considered:
- Put vector SQL inside `RetrievalProvider`: rejected because SQL belongs with PostgreSQL persistence and authorization queries.
- Always set `preferredBackend='hybrid'` without a real preferred search: rejected because that is the current gap.

### Decision 5: Define pgvector score and hybrid formula before implementation

Vector search will use cosine distance with pgvector ordering by `embedding <=> query_vector ASC`; lower distance is better. Public normalized vector score is `clamp(1 - distance, 0, 1)` after excluding null embeddings. Provider sorting still treats higher normalized score as better.

Hybrid mode will use a fixed component formula:

```txt
hybridScore = normalizeScore(
  0.75 * vectorScore +
  0.20 * lexicalScore +
  0.05 * headingMatchScore
)
```

Tie-breakers use stable `chunkIndex`. Retrieval metadata should include component scores for eval diagnostics, without exposing raw vectors. `DEFAULT_RELEVANCE_THRESHOLD` remains the answer-state gate unless tests show a safer calibrated value is needed; hybrid boosts must not promote outside-source or low-evidence questions to grounded answers.

Rationale: vector search is the primary missing behavior. Hybrid ranking can improve assessment-document questions, but it must be deterministic and testable.

Alternatives considered:
- Complex re-ranker or LLM judge: rejected as unnecessary and more expensive.
- Pure lexical plus vector metadata: rejected because it would not prove semantic retrieval.
- Leave formula to implementer discretion: rejected because eval thresholds would be unstable.

### Decision 6: Eval repository-backed vector behavior, not only answer text

Golden evals should assert retrieved section/chunk coverage, controlled paraphrase retrieval within the limits of the local hashing model, backend provenance, citation claim support, and unsupported/fallback behavior. The proof path must distinguish repository-backed pgvector/hybrid search from injected fake `preferredSearch`.

Eval tiers:
- Unit: local embedding provider, scoring math, fallback taxonomy.
- Integration: pgvector-capable PostgreSQL, persisted embeddings, repository vector/hybrid search, cross-tenant nearest-neighbor fixtures.
- Reviewer eval: assessment golden questions, controlled paraphrases, backend provenance, answer state, citation claim support, and fallback reasons.
- No live embedding smoke is required for this change because the default provider is local and runs in the ECS container.

Rationale: retrieval changes often degrade silently while model answers still sound plausible. The eval must fail when the wrong source sections are retrieved or when metadata claims a backend that did not execute.

Alternatives considered:
- Only check chat answers: rejected because LLM prose is nondeterministic and can hide retrieval regressions.
- Only check SQL unit tests: rejected because assessment value depends on end-to-end source-grounded behavior.

## Risks / Trade-offs

- [Risk] Local embedding model dimension changes break stored vector shape. → Mitigation: lock model/dimension, store metadata, validate dimensions before insert/query, and require new migration plus re-embedding/backfill for dimension changes.
- [Risk] Local PostgreSQL lacks pgvector. → Mitigation: make a pgvector-capable local database the canonical vector path; vector migration fails fast with prerequisite guidance when extension support is absent.
- [Risk] Existing chunks have no embeddings. → Mitigation: report `missing_chunk_embeddings` or run a bounded re-embed/backfill command; never claim `pgvector`/`hybrid` for documents without embeddings.
- [Risk] Local hashing embeddings have weaker semantic recall than hosted embedding models. → Mitigation: describe the provider honestly as no-cost local feature vectors, keep lexical/hybrid signals, use controlled eval cases, and leave hosted embeddings as future production work.
- [Risk] Hybrid scoring makes unsupported questions too permissive. → Mitigation: fixed formula, threshold tests, outside-document classification, citation validation, and unsupported-answer evals.
- [Risk] Claiming vector retrieval when fallback ran. → Mitigation: response metadata, eval output, backend provenance, and docs must distinguish configured backend from effective backend.
- [Risk] Embeddings could leak sensitive content through logs or errors. → Mitigation: reuse redaction rules; never log raw document/query text or vector arrays; add canary tests.
- [Risk] Citation mechanics pass while answer claims are unsupported. → Mitigation: golden evals must validate expected/forbidden answer claims, not just citation IDs and quote text.

## Migration Plan

1. Lock local embedding provider/model/dimension, strict/degraded defaults, fallback taxonomy, and hybrid formula in tests before writing schema.
2. Switch local vector proof path to a pgvector-capable PostgreSQL runtime and document RDS extension prerequisites.
3. Add a new database migration for pgvector extension, `vector(384)` embedding column, metadata, embedding coverage fields, and partial index.
4. Add embedding provider contract, local hashing implementation, deterministic provider tests, and config validation.
5. Add ingestion orchestration for bounded local embeddings and strict/degraded persistence behavior.
6. Add repository methods for vector/hybrid search with ownership filters applied before nearest-neighbor ordering/limit.
7. Wire retrieval config and preferred search into server startup with effective backend diagnostics.
8. Add retrieval eval fixtures, controlled paraphrases, lexical-negative cases, cross-tenant vector fixtures, stale-document missing-embedding fixtures, and golden assessment questions.
9. Update root README and `infra/aws/README.md` with config, fallback behavior, RDS pgvector checks, and production roadmap limits.

Rollback:
- Set `RETRIEVAL_BACKEND=lexical_fallback` to return to labeled lexical retrieval without route/API changes.
- Keep nullable embedding columns in place; rollback does not need to delete embeddings immediately.
- If migration rollback is required in a disposable demo database, drop vector index/columns/extension after confirming no dependent data path relies on them.

## Open Questions

- Should the local hashing provider include a small curated synonym map for assessment terms, or keep only n-gram feature hashing and rely on hybrid lexical/heading signals?
- Should existing documents get a bounded `db:embed-existing` command in this change, or remain lexical-only with `missing_chunk_embeddings` until reingested?
