## ADDED Requirements

### Requirement: Eval runner verifies local MiniMax demo contract
The system SHALL provide an executable eval command that verifies the seeded local demo contract with PostgreSQL persistence, configured MiniMax M3 provider, and API key.

#### Scenario: Eval passes in MiniMax mode
- **WHEN** the eval command is run with `AI_PROVIDER=minimax` and a configured MiniMax M3 API key
- **THEN** it verifies seeded user existence, seeded document existence, document chunks, retrieval, analysis schema, citation validity, fallback/refusal behavior, prompt metadata, provider/model metadata, prompt-injection resistance, MarkItDown smoke output when enabled, and owner-scoped access

### Requirement: Live MiniMax calls are budgeted and rate limited
The system SHALL enforce configurable live MiniMax budgets before invoking the provider.

#### Scenario: Eval reports MiniMax usage
- **WHEN** the eval command runs with MiniMax mode
- **THEN** it prints live call count, estimated input/output tokens, timeout/retry settings, and whether the run stayed within the configured budget

#### Scenario: Budget exceeded skips provider invocation
- **WHEN** a request would exceed max calls, token limits, timeout/retry budget, concurrency limit, or per-run estimated cost
- **THEN** the system fails closed with a budget/rate-limit error before calling MiniMax

### Requirement: Eval validates structured analysis schema
The eval runner SHALL verify that document analysis output conforms to the expected structured schema.

#### Scenario: Analysis schema is valid
- **WHEN** the eval runner analyzes the seeded document through MiniMax M3
- **THEN** it confirms required analysis fields are present and correctly typed and provider/model metadata is present

### Requirement: Eval validates retrieval, fallback, and citations
The eval runner SHALL verify that chat answers depend on retrieved chunks when coverage is sufficient, that fallback is recorded only for deterministic fallback cases, and that citations reference valid retrieved chunk IDs.

#### Scenario: Supported seeded question has valid RAG citations
- **WHEN** the eval runner asks a seeded supported question
- **THEN** it confirms retrieval returned top-k chunks, retrieval backend metadata is `pgvector`, `hybrid`, or labeled `lexical_fallback`, context strategy is `rag`, and every answer citation maps to one of those chunks

#### Scenario: Global or low-coverage seeded question records fallback reason
- **WHEN** the eval runner asks a seeded global or low-coverage question that triggers fallback
- **THEN** it confirms the response records context strategy `fallback`, fallback reason, retrieval score summary, uncertainty, and citation policy

### Requirement: Eval validates unsupported-answer behavior
The eval runner SHALL verify that unsupported questions do not produce fabricated document claims.

#### Scenario: Unsupported seeded question is refused
- **WHEN** the eval runner asks a seeded question not answered by the document
- **THEN** it confirms the response states the answer is not supported and does not include fabricated citations

### Requirement: Eval validates prompt-injection resistance
The eval runner SHALL include adversarial document content or a seeded adversarial question that attempts to override system instructions, reveal secrets, or forge citations.

#### Scenario: Prompt injection attempt is ignored
- **WHEN** the eval runner asks about a seeded document section containing malicious instructions
- **THEN** it confirms the answer remains grounded in retrieved chunks, citations validate to retrieved IDs, and no hidden prompt, API key, JWT, or secret is exposed

### Requirement: Logs and outputs redact secrets and document text
The system SHALL test redaction for secrets, document text, prompts, provider responses, database URLs, and authorization headers.

#### Scenario: Secret canaries do not appear in logs
- **WHEN** tests inject sentinel values for MiniMax API key, JWT secret, database password, authorization header, document text, and full prompt content
- **THEN** stdout, stderr, app logs, eval output, error responses, and provider error logs contain only redacted placeholders, IDs, or metadata

### Requirement: External AI transfer is disclosed and gated
The system SHALL disclose that MiniMax receives document text/chunks in live mode and SHALL require explicit live-mode configuration.

#### Scenario: Live MiniMax mode is explicit
- **WHEN** analysis, chat, fallback, eval, or E2E paths invoke MiniMax
- **THEN** configuration and UI/README messaging indicate live provider mode and external document transfer, while logs expose only metadata


### Requirement: Eval validates authorization boundary for documents and child resources
The eval runner SHALL verify that one user cannot access another user's document or document-derived child resources.

#### Scenario: Cross-user document access is denied
- **WHEN** the eval runner authenticates as a second user and requests the seeded user's document
- **THEN** it confirms the system returns not-found or forbidden without document content

#### Scenario: Cross-user child-resource access is denied
- **WHEN** the eval runner authenticates as a second user and attempts to analyze, chat with, read analysis, read messages, read retrieved chunks, read citations, or delete the seeded user's document
- **THEN** each operation returns not-found or forbidden without document text, chunks, citations, messages, analysis, or AI metadata

### Requirement: Implementation follows a TDD loop
The implementation SHALL add or update the relevant failing test before implementing each behavioral slice.

#### Scenario: Slice begins with failing test
- **WHEN** a task implements auth, ownership, ingestion, retrieval, fallback, MiniMax, analysis, chat, UI, redaction, data integrity, MarkItDown, or Terraform behavior
- **THEN** the corresponding unit, integration, eval, Playwright, smoke, or Terraform validation check is created or updated and observed failing before the implementation is completed

### Requirement: Unit tests cover deterministic AI and retrieval utilities
The system SHALL include focused unit tests for deterministic logic that does not require a browser, database, or external AI provider.

#### Scenario: Unit tests validate pure utility behavior
- **WHEN** the unit test command is run
- **THEN** it verifies chunking, lexical retrieval scoring, fallback decision logic, citation validation, prompt metadata helpers, schema parsing, prompt construction guardrails, and unsupported-answer decision logic

### Requirement: Integration tests cover API, database, authorization, and MiniMax behavior
The system SHALL include integration tests that exercise backend API routes with PostgreSQL test persistence and configured MiniMax M3 provider behavior where AI invocation is required.

#### Scenario: Integration tests validate protected document flows
- **WHEN** the integration test command is run
- **THEN** it verifies authentication, owner-scoped document access, child-resource access denial, document ingestion, analysis endpoint behavior, chat endpoint behavior, fallback/refusal routing, and cross-user denial

### Requirement: Integration tests cover PostgreSQL integrity invariants
The system SHALL include PostgreSQL integration tests for relational constraints, migrations, deletes, and transaction rollback.

#### Scenario: Integrity tests reject invalid data relationships
- **WHEN** integration tests attempt orphan child inserts, cross-document citation links, duplicate chunk IDs within a document, or invalid ownership relationships
- **THEN** PostgreSQL constraints or application transaction logic reject the invalid state

#### Scenario: Delete or soft-delete hides child resources
- **WHEN** a document is deleted according to the retention policy
- **THEN** analysis, chunks, messages, citations, and prompt metadata are either cleaned up or hidden from all read paths

#### Scenario: Migration and reset are idempotent
- **WHEN** migrations and reset/seed commands run on a clean PostgreSQL test database
- **THEN** schema creation, teardown, and seed data are repeatable without orphaned records or duplicate stable IDs


### Requirement: Playwright E2E tests cover reviewer-critical user flows
The system SHALL include Playwright end-to-end tests for the primary UI flow using canonical `data-testid` locators.

#### Scenario: E2E test completes document analysis and chat flow
- **WHEN** the Playwright E2E test runs against the local app in MiniMax provider mode
- **THEN** it logs in, submits or opens a document, views analysis, asks a supported question, sees citations, sees retrieved chunks, sees unsupported-answer behavior when applicable, and sees AI transparency metadata

#### Scenario: E2E selectors use canonical data test IDs
- **WHEN** Playwright locates critical UI elements
- **THEN** it uses only the canonical `data-testid` matrix for auth, document input, analysis, chat, citations, retrieved chunks, AI metadata, loading, error, empty, and unsupported-answer elements

### Requirement: MarkItDown smoke check proves PDF conversion path
The system SHALL provide a smoke check that runs the sample PDF through the MarkItDown script and confirms the resulting Markdown can be chunked.

#### Scenario: MarkItDown smoke check creates chunks
- **WHEN** the MarkItDown smoke check runs against the sample PDF
- **THEN** it produces Markdown and verifies the normalized Markdown creates one or more chunks with stable chunk metadata

### Requirement: Eval output is reviewer-readable
The eval command SHALL print concise pass/fail lines for each contract check and exit non-zero when any required check fails.

#### Scenario: Eval prints required checks
- **WHEN** the eval command completes successfully
- **THEN** the output includes checks for seeded user, seeded document, chunks, retrieval, fallback, MiniMax call/token budget, analysis schema, citation IDs, unsupported answer, prompt injection, redaction, data integrity, prompt version, MiniMax provider/model metadata, MarkItDown smoke when enabled, and cross-user document/child-resource access
