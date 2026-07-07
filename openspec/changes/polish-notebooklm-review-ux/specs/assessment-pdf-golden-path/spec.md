## ADDED Requirements

### Requirement: Assessment PDF is a supported demo fixture
The system SHALL treat the Full Stack AI Engineer Assessment PDF content as a golden reviewer demo path.

#### Scenario: Reviewer uploads the assessment PDF
- **WHEN** the reviewer uploads a committed sanitized text-based assessment PDF fixture
- **THEN** the system SHALL create a ready PDF source with safe filename metadata, uploaded time, normalized text, and retrievable chunks.

#### Scenario: Assessment fixtures are available
- **WHEN** tests exercise the golden path
- **THEN** they SHALL use both a generated/sanitized assessment PDF fixture for upload/E2E coverage and an extracted-text fixture for deterministic provider/retrieval unit tests, with expected title markers, content snippets, metadata, and minimum chunk assertions.

#### Scenario: Assessment source opens
- **WHEN** the assessment PDF source opens in the review workspace
- **THEN** the system SHALL show source identity, source type, readiness, and source preview that makes the assessment recognizable.

### Requirement: Assessment briefing is useful and structured
The system SHALL produce a useful structured briefing for the assessment PDF rather than raw JSON or empty cards.

#### Scenario: Reviewer generates assessment briefing
- **WHEN** the reviewer runs analysis on the assessment PDF
- **THEN** the briefing SHALL summarize that the document is a Full Stack AI Engineer Assessment covering an AI-powered full-stack app, data/AI architecture, reliability/evaluation, and AWS/deployment deliverables.

#### Scenario: Requirements are extracted
- **WHEN** the assessment briefing is visible
- **THEN** it SHALL identify required or expected items such as REST API, LLM endpoint, persistence layer, JWT authentication, React frontend, loading/error/empty states, AI response display, data retention/PII/logging, evaluation/reliability, AWS infrastructure, secure secret handling, and README deliverables when present in the source.

#### Scenario: Risks and trade-offs are extracted
- **WHEN** the assessment briefing is visible
- **THEN** it SHALL identify only risks or trade-offs supported by the fixture text or explicitly label them as derived reviewer risks with a caveat; it SHALL NOT invent prompt-injection, cost, or deployment risks as source facts when absent.

#### Scenario: Suggested questions are generated
- **WHEN** the assessment briefing succeeds
- **THEN** recommended questions SHALL be specific to the assessment, such as backend requirements, frontend UX requirements, data/privacy requirements, AI reliability requirements, deployment requirements, and deliverables.

### Requirement: Assessment chat golden questions succeed
The system SHALL answer representative assessment PDF questions with useful reviewer-facing output.

#### Scenario: Reviewer asks what the assessment document is about
- **WHEN** the reviewer asks `What is this document about?`
- **THEN** the answer SHALL explain the assessment purpose and major parts in reviewer-facing prose and SHALL NOT be a generic insufficient-evidence failure.

#### Scenario: Reviewer asks about backend requirements
- **WHEN** the reviewer asks what the backend requires
- **THEN** the answer SHALL mention REST API, AI interaction endpoint, persistence, authentication, provider abstraction or prompt handling, and relevant source evidence or full-document caveat.

#### Scenario: Reviewer asks about frontend requirements
- **WHEN** the reviewer asks what the frontend requires
- **THEN** the answer SHALL mention React, multiple pages or flow states, input form, user-friendly AI responses, loading/error/empty states, refinement/re-ask behavior, and uncertainty/hallucination handling when present.

#### Scenario: Reviewer asks about data and reliability requirements
- **WHEN** the reviewer asks about data flow, storage, privacy, logging, evaluation, or reliability
- **THEN** the answer SHALL identify relevant source requirements and SHALL distinguish source-stated requirements from reviewer-derived interpretation.

#### Scenario: Reviewer asks about deployment requirements
- **WHEN** the reviewer asks about infrastructure or deployment
- **THEN** the answer SHALL identify AWS, Terraform or CloudFormation, secrets handling, config/code separation, and scaling considerations when present.

#### Scenario: Reviewer asks about deliverables
- **WHEN** the reviewer asks what must be delivered
- **THEN** the answer SHALL identify the Git repository and README expectations, plus any architecture, AI design, trade-off, and run-local instructions present in the source.

### Requirement: Golden path is regression-tested
The system SHALL include automated coverage for the assessment PDF path so reported demo regressions cannot silently return.

#### Scenario: Golden path test runs
- **WHEN** the targeted assessment PDF test suite runs
- **THEN** it SHALL verify no raw JSON fences are visible, expected requirements are extracted, starter questions are answerable, chat answers show correct answer state and evidence/caveat behavior, and the real PDF upload path is exercised.
