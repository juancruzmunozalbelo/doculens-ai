## ADDED Requirements

### Requirement: Answers render as safe product cards
The system SHALL render AI responses as safe answer cards and MUST NOT expose raw provider formatting or JSON as the user answer.

#### Scenario: Provider returns JSON-shaped answer text
- **WHEN** the provider or backend answer field contains JSON-shaped text, markdown JSON fences, citation arrays, metadata objects, or raw structured payloads
- **THEN** the visible answer SHALL be normalized into concise user-facing prose and structured evidence UI, or downgraded to a safe insufficient-evidence/error state.

#### Scenario: Provider returns internal content
- **WHEN** an answer includes hidden reasoning, system/developer/policy references, provider IDs, chunk IDs, document IDs, retrieval scores, raw metadata, or stack traces
- **THEN** the default reviewer UI MUST NOT render that content in the answer card.

#### Scenario: Answer is unavailable after normalization
- **WHEN** the system cannot extract safe answer text from an AI response
- **THEN** the system SHALL show a safe recovery state and MUST NOT show the raw response as a fallback.

### Requirement: Answer display boundary has explicit allowlist and denylist
The system SHALL apply a display boundary before answer rendering that allows only safe final answer fields and rejects or hides internal provider fields.

#### Scenario: Safe answer fields are available
- **WHEN** an answer payload includes safe final text, state kind, citations, uncertainty, suggested refinements, and evidence excerpts
- **THEN** the system SHALL render those fields through the answer card and evidence UI.

#### Scenario: Unsafe answer fields are available
- **WHEN** an answer payload includes raw provider payloads, raw metadata objects, retrieved chunk IDs, internal document IDs, retrieval scores, system/developer/policy text, stack traces, local paths, or secret-like values
- **THEN** the system MUST NOT render those fields in the primary answer card.

#### Scenario: Raw response fallback would be used
- **WHEN** no safe final answer text can be derived from the response payload
- **THEN** the system SHALL show a safe recovery or insufficient-evidence state and MUST NOT fall back to rendering the raw response body.

### Requirement: Inline citations connect answers to evidence
The system SHALL make grounded answers verifiable through inline citations that connect directly to source evidence.

#### Scenario: Grounded answer is displayed
- **WHEN** an answer is presented as grounded in the active source
- **THEN** the answer SHALL include one or more inline citation markers or equivalent citation affordances adjacent to the claim they support.

#### Scenario: User selects a citation
- **WHEN** the user selects an inline citation or citation affordance
- **THEN** the system SHALL show the corresponding source excerpt in a persistent evidence region with source title or section context.

#### Scenario: Multiple citations exist
- **WHEN** an answer includes multiple citations
- **THEN** each citation SHALL be distinguishable and SHALL map to the evidence excerpt it supports without requiring the user to inspect raw chunk IDs or score metadata.

### Requirement: Coherent answer trust states
The system SHALL present each answer using one coherent user-level trust state.

#### Scenario: Answer is grounded
- **WHEN** an answer has valid citations and evidence for the active source
- **THEN** the system SHALL present it as based on the document and show citation-linked evidence.

#### Scenario: Evidence is insufficient
- **WHEN** citation coverage is empty, evidence coverage is weak, or fallback logic was used without source-quality citations
- **THEN** the system SHALL present a user-level insufficient-evidence state and MUST NOT simultaneously style the answer as grounded.

#### Scenario: Question is outside source scope
- **WHEN** the answer is unsupported by the active source
- **THEN** the system SHALL present an unsupported/outside-document state with suggested in-source questions and MUST NOT render it as a generic error.

#### Scenario: Technical fallback exists
- **WHEN** backend metadata includes fallback reason, low coverage, or retrieval diagnostics
- **THEN** those technical details SHALL be available only in the technical-details disclosure and MUST NOT appear as raw state labels in the primary answer card.

### Requirement: Fallback without citations does not show substantive claims as final answers
The system SHALL NOT present ungrounded fallback content as a normal answer in the primary path.

#### Scenario: Fallback has no valid citations
- **WHEN** an answer uses full-document fallback, has low evidence coverage, or has zero valid citations
- **THEN** the primary answer card SHALL show insufficient-evidence guidance and suggested refinements rather than a substantive claim styled as a final answer.

#### Scenario: Ungrounded synthesis is retained
- **WHEN** the system keeps a non-cited global synthesis for user orientation
- **THEN** it SHALL be visually separated from grounded answer cards, labeled as not verified by selected evidence, and MUST NOT show inline citations or grounded styling.

#### Scenario: Fallback metadata includes a useful reason
- **WHEN** fallback metadata contains a useful technical reason such as low coverage
- **THEN** the user-facing state SHALL translate it to simple guidance and technical details MAY expose the raw reason only after disclosure.

### Requirement: Ambiguous questions receive clarification help
The system SHALL guide ambiguous or overly broad questions before showing dense or technical answer states.

#### Scenario: User asks a very broad question
- **WHEN** a user asks a broad or ambiguous question such as what the document is without specifying an aspect
- **THEN** the system SHALL show clarification choices, starter questions, or a concise source overview path before showing a dense answer state.

#### Scenario: Backend returns unsupported or insufficient evidence for an ambiguous question
- **WHEN** backend state indicates unsupported scope or insufficient evidence for an ambiguous question
- **THEN** the UI SHALL present refinement options and MUST NOT show raw fallback labels, JSON, or diagnostic terms.

### Requirement: Evidence panel prioritizes selected citation context
The system SHALL prioritize the selected citation or answer evidence over long retrieved-chunk lists.

#### Scenario: Citation evidence is selected
- **WHEN** a citation or evidence marker is selected
- **THEN** the evidence panel SHALL show the selected excerpt, source label, section label when available, and enough surrounding context for the user to verify the claim.

#### Scenario: No citation is selected
- **WHEN** no specific citation is selected and a source is active
- **THEN** the evidence panel SHALL show source overview, outline, or short excerpt without overwhelming the user with raw retrieved chunks.

#### Scenario: Retrieved chunks exist for debugging
- **WHEN** retrieved chunks, scores, or raw retrieval diagnostics exist
- **THEN** the primary evidence panel MUST NOT expose raw score internals or UUIDs and MAY expose safe diagnostics only through technical details.
