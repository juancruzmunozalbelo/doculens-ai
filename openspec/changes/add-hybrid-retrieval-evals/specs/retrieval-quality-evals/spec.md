## ADDED Requirements

### Requirement: Retrieval evals verify golden question evidence
The system SHALL provide deterministic retrieval-quality evals that verify golden questions retrieve expected source sections or chunks before answer text is trusted.

#### Scenario: Assessment backend question retrieves backend evidence
- **WHEN** the eval asks a golden question about backend requirements in the assessment source
- **THEN** retrieval SHALL return at least one top-k chunk whose heading path or excerpt identifies backend/API/auth/persistence requirements.

#### Scenario: Assessment frontend question retrieves frontend evidence
- **WHEN** the eval asks a golden question about frontend UX requirements in the assessment source
- **THEN** retrieval SHALL return at least one top-k chunk whose heading path or excerpt identifies React, input/results views, AI response display, and loading/error/empty states.

#### Scenario: Assessment deployment question retrieves AWS evidence
- **WHEN** the eval asks a golden question about deployment or AWS requirements in the assessment source
- **THEN** retrieval SHALL return at least one top-k chunk whose heading path or excerpt identifies AWS infrastructure, secret handling, config separation, or scaling expectations.

#### Scenario: Controlled paraphrase retrieves expected evidence
- **WHEN** the eval asks a paraphrased golden question that is within the documented limits of the local hashing model
- **THEN** pgvector or hybrid retrieval SHALL return the expected evidence and lexical-only retrieval SHALL NOT be allowed to pass as vector/hybrid retrieval.

### Requirement: Retrieval evals verify backend provenance and fallback honesty
The system SHALL assert retrieval backend provenance for each golden eval and SHALL fail when vector/hybrid claims do not match the executed repository path.

#### Scenario: Repository preferred backend is used
- **WHEN** pgvector or hybrid retrieval succeeds during an eval run
- **THEN** eval output SHALL report `pgvector` or `hybrid`, identify repository-backed vector search provenance, and SHALL NOT report `lexical_fallback` for that question.

#### Scenario: Injected fake preferred search cannot satisfy vector proof
- **WHEN** a test-only or injected preferred search returns rows without executing PostgreSQL repository vector or hybrid search
- **THEN** reviewer-facing eval output SHALL NOT count that result as pgvector/hybrid proof.

#### Scenario: Fallback is used honestly
- **WHEN** embeddings, chunk embeddings, repository preferred search, or pgvector runtime support are unavailable during an eval run
- **THEN** eval output SHALL report `lexical_fallback` plus a precise fallback reason such as `retrieval_disabled`, `embedding_unavailable`, `missing_chunk_embeddings`, `vector_unavailable`, or `preferred_backend_unavailable`.

#### Scenario: Unsupported backend claims fail evals
- **WHEN** eval metadata claims `pgvector` or `hybrid` but returned chunks came from lexical fallback, test-only fake preferred search, or no repository preferred search was configured
- **THEN** the eval SHALL fail with a reviewer-readable diagnostic.

### Requirement: Retrieval evals preserve answer-state behavior
The system SHALL verify that improved retrieval quality does not weaken grounded, fallback, insufficient-evidence, or unsupported answer-state contracts.

#### Scenario: Supported golden question remains grounded
- **WHEN** a golden question has sufficient retrieved source evidence
- **THEN** the answer state SHALL be grounded, source-overview, or section-summary and citations SHALL map only to retrieved chunk IDs when citations are present.

#### Scenario: Outside-source question remains unsupported
- **WHEN** the eval asks an outside-source question about current external facts or facts not present in the selected source
- **THEN** the answer state SHALL be unsupported and SHALL NOT include fabricated citations.

#### Scenario: Low-evidence question remains insufficient
- **WHEN** the eval asks a precise question whose answer is not supported by retrieved evidence
- **THEN** the answer state SHALL be insufficient-evidence or unsupported rather than promoted to grounded by hybrid scoring alone.

#### Scenario: Plausible wrong evidence does not ground an answer
- **WHEN** hybrid retrieval returns topically related chunks that do not support the requested claim
- **THEN** the answer state SHALL remain insufficient-evidence or unsupported and SHALL NOT attach citations to unsupported answer claims.

### Requirement: Retrieval evals validate citations, claims, and score summaries
The system SHALL validate citation IDs, quote support, answer-claim support, top-k bounds, and retrieval score summaries for vector and hybrid retrieval paths.

#### Scenario: Citation IDs are retrieved IDs
- **WHEN** a chat answer includes citations during a retrieval eval
- **THEN** every citation chunk ID SHALL match one of the retrieved chunk IDs for that answer.

#### Scenario: Citation quote is supported by chunk content
- **WHEN** a citation includes a quote
- **THEN** the quoted text SHALL be found in the cited chunk content or excerpt after normal display normalization.

#### Scenario: Answer claims are supported by evidence
- **WHEN** a golden answer includes concrete claims about requirements, deliverables, security, deployment, reliability, or frontend behavior
- **THEN** the eval SHALL verify expected claim terms or facts are present and SHALL fail if fabricated or forbidden claims appear even when citation mechanics pass.

#### Scenario: Synthesized citations are identified
- **WHEN** citations are synthesized from retrieved chunks rather than supplied by the provider
- **THEN** eval output SHALL identify synthesized citation support and SHALL NOT treat synthesized citations alone as proof for nontrivial unsupported claims.

#### Scenario: Score summary is bounded
- **WHEN** retrieval returns chunks for an eval question
- **THEN** score summary metadata SHALL include returned count, passing count, threshold, normalized scores bounded between 0 and 1, and hybrid component scores when hybrid retrieval is used.

### Requirement: Retrieval evals include adversarial vector fixtures
The system SHALL include eval or integration fixtures that make incorrect vector implementation fail before reviewer proof can pass.

#### Scenario: Cross-tenant closer vector is excluded before limit
- **WHEN** another user's chunk has a vector closer to the query than the current user's chunks
- **THEN** repository-backed vector search SHALL still return only authorized chunks and SHALL NOT let the other user's chunk consume top-k candidate capacity.

#### Scenario: Stale document without embeddings reports missing coverage
- **WHEN** a document has chunks created before embedding storage or otherwise lacks chunk embeddings
- **THEN** retrieval evals SHALL report `missing_chunk_embeddings` or verify successful backfill before allowing a pgvector/hybrid claim.

#### Scenario: Lexical-negative controlled case fails lexical-only mode
- **WHEN** a controlled paraphrase or lexical-negative question is run with lexical-only retrieval
- **THEN** the eval SHALL either fail the vector/hybrid case or report `lexical_fallback` rather than passing as pgvector/hybrid.

### Requirement: Retrieval eval output is reviewer-readable
The system SHALL print concise retrieval eval output that shows question category, expected evidence, actual backend, backend provenance, fallback reason when present, answer state, citation validity, claim support, and pass/fail status.

#### Scenario: Eval success prints evidence summary
- **WHEN** retrieval-quality evals pass
- **THEN** output SHALL include a concise summary of each golden question, matched evidence section or chunk, configured backend, effective backend, backend provenance, answer state, citation result, and claim-support result.

#### Scenario: Eval failure identifies the broken contract
- **WHEN** a retrieval-quality eval fails
- **THEN** output SHALL identify whether the failure was missing expected evidence, wrong backend metadata, fake preferred-search provenance, invalid fallback reason, invalid citation, unsupported claim, unsafe answer state, or score summary regression.
