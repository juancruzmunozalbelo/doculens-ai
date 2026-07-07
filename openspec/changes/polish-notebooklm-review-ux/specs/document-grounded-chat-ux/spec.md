## ADDED Requirements

### Requirement: Answer state contract
The system SHALL preserve explicit answer states across API response, persistence, and UI rendering.

#### Scenario: Grounded answer state is returned
- **WHEN** retrieval finds citation-quality chunks and answer citations validate against the selected source
- **THEN** `displayState.kind` SHALL be `grounded`, the answer SHALL show inline citations, and the citation policy SHALL indicate retrieved evidence.

#### Scenario: Full-document overview state is returned
- **WHEN** the question is an explicit broad/global source overview and the provider returns useful source-wide prose without precise chunk citations
- **THEN** `displayState.kind` SHALL be `full_document_overview`, the answer SHALL preserve the useful prose, and the UI SHALL show a full-document caveat rather than `Not enough evidence`.

#### Scenario: Specific question has low retrieval coverage
- **WHEN** the question asks for a specific claim and no citation-quality chunks support it
- **THEN** `displayState.kind` SHALL be `insufficient_evidence`, the system SHALL guide refinement, and it SHALL NOT invent a full-document answer as if it were grounded.

#### Scenario: Outside-source question is asked
- **WHEN** the question asks for information outside the selected source
- **THEN** `displayState.kind` SHALL be `unsupported` and the UI SHALL suggest in-scope questions.

#### Scenario: Chat operation fails
- **WHEN** provider, API, retrieval, or network failure prevents an answer
- **THEN** `displayState.kind` SHALL be `error` or an equivalent safe error state, previous answers SHALL remain visible, the draft question SHALL be preserved where possible, and retry/refine actions SHALL be offered without persisting the failure as grounded evidence.

### Requirement: Starter questions are answerable for the selected source
The system SHALL only present starter questions that are supported by the current source and routing policy.

#### Scenario: Default starter questions are shown
- **WHEN** no analysis-specific questions are available
- **THEN** each default starter question SHALL route to a useful source-grounded, full-document overview, or recoverable refinement state by design and SHALL NOT default to unsupported or generic failure.

#### Scenario: Analysis recommends questions
- **WHEN** structured analysis includes recommended questions
- **THEN** the system SHALL prefer those source-specific questions over generic defaults.

### Requirement: Broad document questions use full-document overview
The system SHALL answer broad source-understanding questions through an explicit full-document overview state when precise chunk citations are unavailable.

#### Scenario: Reviewer asks what the document is about
- **WHEN** the reviewer asks `What is this document about?` or an equivalent broad overview question
- **THEN** the system SHALL answer using selected source context and SHALL NOT return generic `Not enough evidence` solely because no chunk citation passed retrieval.

#### Scenario: Full-document overview lacks precise citations
- **WHEN** an answer uses full-document overview rather than citation-backed chunks
- **THEN** the answer SHALL be labeled as full-document overview or fallback, include a concise caveat, and SHALL NOT be styled as a grounded citation-backed answer.

### Requirement: Citation-backed answers behave like a source notebook
The system SHALL present grounded answers with inline citations and navigable source evidence inspired by NotebookLM citation behavior.

#### Scenario: Answer has valid retrieved citations
- **WHEN** the provider returns citations that match retrieved chunks from the selected source
- **THEN** the answer SHALL show inline citation controls and evidence chips that reveal or highlight the matching source excerpt.

#### Scenario: Citation is inspected
- **WHEN** the reviewer selects, hovers, or focuses a citation
- **THEN** the system SHALL show the quoted text or excerpt, navigate or highlight its source context, expose keyboard-operable controls and visible focus, and avoid raw chunk IDs in accessible labels.

#### Scenario: Retrieved evidence exists but provider omits citations
- **WHEN** retrieved chunks exist and the provider answer is otherwise usable but no valid provider citation is returned
- **THEN** the system SHALL attach a fallback citation only if the answer is supported by the retrieved excerpt; otherwise it SHALL downgrade or mark the answer as needing evidence validation without showing false inline citation precision.

### Requirement: Insufficient and unsupported states guide next action
The system SHALL make limitation states useful instead of dead ends.

#### Scenario: Retrieval coverage is weak
- **WHEN** no citation-quality chunks match a specific question
- **THEN** the system SHALL explain the limitation, suggest source-specific refinements, and offer retry, inspect source, or ask overview actions.

#### Scenario: Question is outside source scope
- **WHEN** the question asks for information outside the selected source
- **THEN** the system SHALL present an intentional unsupported state with suggested in-scope questions rather than a generic error.

### Requirement: Source preview and answer evidence are distinct
The system SHALL separate always-available source preview from evidence used by a specific answer.

#### Scenario: Source preview is visible
- **WHEN** a source is selected
- **THEN** the system MAY show a region labeled `Source preview` with source overview or excerpts independent of the current answer.

#### Scenario: Answer has no evidence
- **WHEN** an answer has no answer-specific citations or evidence
- **THEN** the answer evidence region SHALL say that no answer-specific evidence was used and SHALL NOT imply that stale source preview content supported the answer.
