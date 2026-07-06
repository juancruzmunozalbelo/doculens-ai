## ADDED Requirements

### Requirement: PostgreSQL-backed authenticated document ownership
The system SHALL use PostgreSQL-compatible persistence and allow users to register, log in with hashed passwords and expiring JWT authentication, and create, list, read, and delete only their own documents.

#### Scenario: User creates and reads own document
- **WHEN** an authenticated user submits Markdown or text content with a title
- **THEN** the system persists the document in PostgreSQL for that user and allows the same user to retrieve it

#### Scenario: User cannot read another user's document
- **WHEN** an authenticated user requests a document owned by a different user
- **THEN** the system returns a not-found or forbidden response without exposing the document content

### Requirement: Child resources are authorized through document ownership
The system SHALL authorize analysis, chat messages, retrieved chunks, citations, and delete/cascade operations through the current user's ownership of the parent document.

#### Scenario: User cannot access another user's analysis
- **WHEN** an authenticated user requests analysis for another user's document
- **THEN** the system returns not-found or forbidden without exposing analysis content or AI metadata

#### Scenario: User cannot chat with another user's document
- **WHEN** an authenticated user sends or reads chat messages for another user's document
- **THEN** the system returns not-found or forbidden without exposing messages, chunks, citations, or document text

#### Scenario: User cannot retrieve another user's chunks or citations
- **WHEN** an authenticated user attempts to read retrieved chunks or citations for another user's document
- **THEN** the system returns not-found or forbidden without exposing document-derived content

#### Scenario: Delete respects ownership and child-resource cleanup
- **WHEN** a user deletes their own document
- **THEN** the system removes or soft-deletes the document and its child analysis, chunk, message, and citation records according to the documented retention policy

### Requirement: PostgreSQL integrity preserves document relationships
The system SHALL enforce relational integrity for users, documents, chunks, analyses, messages, citations, prompt metadata, and fallback metadata.

#### Scenario: Invalid child records are rejected
- **WHEN** code attempts to create orphaned chunks, analyses, messages, citations, or prompt metadata without a valid parent document/message/chunk relationship
- **THEN** PostgreSQL constraints or transaction logic reject the invalid state

#### Scenario: Citations remain within the same document
- **WHEN** code attempts to attach a citation to a chunk from a different document than the message or answer
- **THEN** the system rejects the citation and does not persist cross-document evidence

#### Scenario: Partial ingestion rolls back
- **WHEN** document ingestion fails after creating some chunks
- **THEN** the system rolls back partial records or marks the document failed without exposing incomplete retrieval state


### Requirement: Documents are normalized and section-aware chunked
The system SHALL normalize submitted Markdown/text and create ordered section-aware chunks with stable chunk identifiers, heading paths, content, chunk index, and token estimate metadata.

#### Scenario: Document chunks are created after ingestion
- **WHEN** a user submits a supported document
- **THEN** the system creates one or more chunks linked to the document with stable chunk IDs and heading metadata

#### Scenario: Retrieved chunks expose traceable metadata
- **WHEN** chunks are returned for retrieval or display
- **THEN** each chunk includes its chunk ID, heading path, content excerpt, chunk index, and token estimate when available

### Requirement: Document analysis produces structured MiniMax output
The system SHALL produce structured document analysis for a user-owned document using MiniMax M3 and store the analysis with provider, model, prompt version, context strategy, thinking mode, and token metadata.

#### Scenario: User analyzes owned document
- **WHEN** an authenticated user requests analysis for their own document with `AI_PROVIDER=minimax` and a configured MiniMax M3 API key
- **THEN** the system invokes MiniMax M3 and returns structured JSON containing summary, entities, obligations, risks, uncertainties, provider metadata, and model metadata

### Requirement: Retrieval prefers pgvector or hybrid search
The system SHALL implement retrieval through `RetrievalProvider` with pgvector or hybrid retrieval as the preferred target, and SHALL use lexical retrieval only as a clearly labeled fallback if the embedding provider blocks implementation or credentials.

#### Scenario: Preferred retrieval backend is visible
- **WHEN** a chat response returns retrieved chunks
- **THEN** the response metadata identifies whether retrieval used `pgvector`, `hybrid`, or labeled `lexical_fallback`

#### Scenario: Lexical fallback is explicitly labeled
- **WHEN** embeddings or pgvector cannot be used and lexical retrieval is selected
- **THEN** the README, eval output, and response metadata label retrieval as `lexical_fallback` instead of presenting it as vector RAG

### Requirement: Chat answers are RAG-first and citation-backed
The system SHALL answer user questions over a document by retrieving top-k chunks first, grounding the prompt in those chunks, and returning citations that reference only retrieved chunk IDs.

#### Scenario: Supported question receives cited answer
- **WHEN** a user asks a question answered by retrieved document chunks
- **THEN** the system returns an answer, the retrieved chunk IDs, citation objects, context strategy `rag`, and AI provider metadata

#### Scenario: Citations are validated against retrieved chunks
- **WHEN** the AI provider returns citations for a chat answer
- **THEN** the system accepts only citations whose chunk IDs exist in the retrieved chunk set

#### Scenario: Unsupported question is refused
- **WHEN** a user asks a question that is not supported by retrieved chunks or fallback context
- **THEN** the system returns an unsupported-answer response instead of inventing facts or citations

### Requirement: Fallback routing is deterministic and auditable
The system SHALL use full-document MiniMax reasoning for initial analysis and only use full-document fallback for chat when deterministic retrieval coverage rules classify the question as low-coverage or global-reasoning.

#### Scenario: Normal chat uses RAG context
- **WHEN** retrieval coverage is sufficient for a user question
- **THEN** the system uses retrieved chunks as the answer context, records context strategy `rag`, and does not send the full document as the primary chat context

#### Scenario: Low-coverage chat records fallback strategy
- **WHEN** retrieval coverage is insufficient and fallback is used
- **THEN** the response metadata records context strategy `fallback`, fallback reason, retrieval score summary, retrieved chunk IDs, uncertainty, and citation policy

#### Scenario: Out-of-document question refuses instead of fallback
- **WHEN** a user asks for facts outside the document
- **THEN** the system returns unsupported-answer behavior instead of using full-document fallback to invent an answer

### Requirement: Prompt injection is treated as untrusted document content
The system SHALL treat document text and retrieved chunks as untrusted evidence and SHALL prevent document instructions from overriding system or developer instructions.

#### Scenario: Malicious document instruction is ignored
- **WHEN** retrieved document text instructs the model to ignore rules, reveal secrets, forge citations, or answer without evidence
- **THEN** the system keeps the answer grounded in retrieved chunks, validates citations, and does not reveal secrets or hidden prompts

### Requirement: AI provider integration is separated and metadata-rich
The system SHALL separate prompt construction, model invocation, and response post-processing behind provider interfaces and SHALL implement MiniMax M3 as the required live provider.

#### Scenario: Provider mode is visible
- **WHEN** an analysis or chat response is returned
- **THEN** the response includes provider, model, prompt ID or version, context strategy, thinking mode, retrieved chunk IDs when applicable, fallback reason when applicable, and token estimates when available

#### Scenario: MiniMax provider is configurable
- **WHEN** `AI_PROVIDER=minimax` is configured with MiniMax base URL, API key, and model
- **THEN** the system invokes MiniMax M3 through the provider boundary without endpoint code depending on MiniMax-specific details

### Requirement: UI exposes login, document input, analysis, chat, and AI transparency
The React frontend SHALL provide login, document input, and analysis/chat views or routes, with loading, error, empty, unsupported-answer, citation, retrieved chunk, and model metadata states.

#### Scenario: User logs in from UI
- **WHEN** a seeded or registered user enters valid credentials in the login view
- **THEN** the UI authenticates the user and allows access to document input

#### Scenario: User submits content from input view
- **WHEN** a user opens the document input view
- **THEN** they can submit Markdown/text content and see loading, error, or success states

#### Scenario: User reviews analysis and chat evidence
- **WHEN** a user opens the analysis/chat view for a document
- **THEN** the UI shows structured analysis, chat controls, answers, citations, retrieved chunks, unsupported-answer state, and an AI transparency panel

#### Scenario: Critical UI elements expose canonical test IDs
- **WHEN** the UI renders auth, document, analysis, chat, AI metadata, or state elements
- **THEN** those elements expose the canonical `data-testid` values: `auth.email-input`, `auth.password-input`, `auth.login-submit`, `document.title-input`, `document.content-input`, `document.submit`, `document.analyze`, `analysis.panel`, `analysis.summary`, `chat.input`, `chat.submit`, `chat.answer`, `chat.citations`, `chat.retrieved-chunks`, `ai.metadata`, `state.loading`, `state.error`, `state.empty`, and `answer.unsupported`

### Requirement: MarkItDown PDF conversion is demonstrable by script
The system SHALL include a documented MarkItDown script path that converts a sample PDF into Markdown suitable for the same ingestion and chunking pipeline.

#### Scenario: Sample PDF converts to Markdown
- **WHEN** the MarkItDown conversion script is run against the sample PDF
- **THEN** it outputs Markdown that can be ingested and chunked by the document pipeline
