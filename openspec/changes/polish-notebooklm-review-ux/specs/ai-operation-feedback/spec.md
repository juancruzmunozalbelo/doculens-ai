## ADDED Requirements

### Requirement: Operation-specific loading states
The system SHALL show operation-specific status for every asynchronous reviewer action that can take perceptible time.

#### Scenario: PDF source is submitted
- **WHEN** the reviewer submits a PDF source
- **THEN** the system SHALL show staged status such as uploading file, reading PDF text, normalizing content, preparing evidence, and opening the review workspace.

#### Scenario: Backend stage telemetry is unavailable
- **WHEN** the backend operation is a blocking request without intermediate stage events
- **THEN** the frontend MAY show truthful local operation labels for the pending request and MUST NOT imply that a backend stage has completed before it has completed.

#### Scenario: Analysis is running
- **WHEN** the reviewer starts or regenerates a review briefing
- **THEN** the system SHALL show AI-specific progress copy such as building briefing, extracting requirements, identifying risks, and preparing suggested questions.

#### Scenario: Chat answer is running
- **WHEN** the reviewer asks a source question
- **THEN** the system SHALL show question-specific status such as searching selected source, drafting answer, and checking evidence while preserving the current question and prior answers.

#### Scenario: Source is switching
- **WHEN** the reviewer opens a source that needs detail loading
- **THEN** the system SHALL show source-specific preparation status and SHALL NOT leave the UI looking idle or frozen.

### Requirement: Pending controls and accessible animation
The system SHALL use lightweight animation and pending controls to communicate progress without relying on motion alone.

#### Scenario: Action is pending
- **WHEN** an operation is in progress
- **THEN** the triggering control SHALL be disabled or guarded against duplicate submission and its label SHALL change to the current action such as `Reading PDF…`, `Creating source…`, or `Asking…`.

#### Scenario: Loading placeholders are displayed
- **WHEN** a panel is waiting on source, analysis, retrieval, or answer data
- **THEN** the system SHALL show skeletons, shimmer, progress dots, or card enter states plus text in a `role="status"` or `aria-live` region and the related region SHALL expose `aria-busy` while pending.

#### Scenario: Reviewer prefers reduced motion
- **WHEN** the browser reports `prefers-reduced-motion: reduce`
- **THEN** non-essential animation SHALL be disabled while textual loading and disabled/pending states remain visible.

#### Scenario: Reviewer uses keyboard during pending state
- **WHEN** an action is pending
- **THEN** focus SHALL remain predictable, duplicate rapid activations SHALL be prevented, and entered text/file context SHALL be preserved.

### Requirement: Recovery actions and safe context
The system SHALL preserve user context and provide recovery actions when an operation fails or returns a limitation state.

#### Scenario: PDF processing fails
- **WHEN** upload, validation, conversion, normalization, chunking, or persistence fails
- **THEN** the system SHALL preserve safe selected-file context where browser security permits, show a contextual message, and offer choose-another-PDF and paste-text fallback actions.

#### Scenario: AI analysis or chat fails
- **WHEN** analysis or chat cannot complete because of API, provider, retrieval, or network failure
- **THEN** the system SHALL preserve selected source, question, and previous output, show a safe error, and offer retry or refine action.

#### Scenario: Support context exists
- **WHEN** a backend response includes a safe request identifier or operation stage
- **THEN** the system MAY expose the redacted reference in error/retry UI and MUST NOT expose stack traces, raw provider payloads, raw document text, or secret-shaped values.
