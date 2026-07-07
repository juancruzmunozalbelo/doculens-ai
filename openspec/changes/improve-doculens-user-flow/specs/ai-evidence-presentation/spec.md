## ADDED Requirements

### Requirement: Safe AI answer API and rendering
The system SHALL return, persist, and render AI answers as sanitized product output rather than raw provider output.

#### Scenario: Provider output contains chain-of-thought markers
- **WHEN** an AI answer payload contains chain-of-thought markers, hidden reasoning, internal policy text, system/developer instruction references, or `<think>` blocks
- **THEN** backend responses, persisted display fields, and the visible reviewer UI MUST NOT include that content and MUST expose only safe final answer text, state kind, unsupported state, uncertainty, citations, evidence excerpts, and diagnostics summary fields that pass the display contract.

#### Scenario: Provider output contains raw JSON or markdown fences
- **WHEN** an AI answer payload includes raw JSON fences or provider formatting that is not intended as the final user answer
- **THEN** backend display fields and the visible reviewer UI SHALL normalize the response into user-facing answer text and structured evidence sections rather than returning, persisting, or displaying raw provider formatting by default.

#### Scenario: Raw provider output exists internally
- **WHEN** a provider response includes raw payload, reasoning, provider IDs, or internal metadata needed only for debugging
- **THEN** the system MUST keep that data out of default API responses, persisted reviewer-facing message fields, and initial UI render paths unless it is explicitly redacted and exposed through an intentional developer-only diagnostic path.

### Requirement: Citation-gated grounded answers
The system SHALL distinguish grounded answers from fallback, insufficient-evidence, and unsupported answers using one shared grounding gate.

#### Scenario: Normal grounded answer has citations
- **WHEN** a chat answer is presented as grounded by document evidence
- **THEN** the answer SHALL display at least one citation or source evidence chip linked to the selected document evidence and metadata SHALL include at least one passing retrieved chunk above the configured relevance threshold.

#### Scenario: Retrieval coverage is weak
- **WHEN** retrieval metadata indicates low coverage, zero passing chunks, zero-score fallback, empty citations, or a fallback full-document citation policy
- **THEN** the system SHALL downgrade the answer to a fallback or insufficient-evidence state with copy such as `Insufficient document evidence`, `Using full-document fallback`, or `No citation-quality chunks matched`, and SHALL offer a refine, retry, or inspect-evidence action.

#### Scenario: Question is outside document scope
- **WHEN** the AI classifies a question as unsupported by the selected document
- **THEN** the system SHALL present the refusal as an intentional guardrail outcome with suggested in-scope questions and MUST NOT style it as a generic application error.

### Requirement: Structured analysis presentation
The system SHALL present document analysis as structured, scannable review output.

#### Scenario: Analysis succeeds
- **WHEN** analysis returns summary, entities, obligations, risks, and uncertainties
- **THEN** the system SHALL render those fields as labeled cards, tables, badges, or lists optimized for reviewer comprehension rather than as raw JSON or unformatted object strings.

#### Scenario: Analysis category is empty
- **WHEN** an analysis category has no returned items
- **THEN** the system SHALL show a category-specific empty state that explains what was not found instead of only saying that no data was returned.

### Requirement: Answer evidence and uncertainty presentation
The system SHALL make evidence and uncertainty visible in human-readable form for each answer.

#### Scenario: Answer includes uncertainty
- **WHEN** an answer includes an uncertainty value or confidence limitation
- **THEN** the system SHALL display it as a visible badge or callout with concise explanatory copy and MUST NOT append it only as an inline sentence fragment.

#### Scenario: Answer includes retrieved chunks
- **WHEN** retrieved evidence is available for an answer
- **THEN** the system SHALL summarize the evidence with human-readable source labels and excerpts and MUST NOT expose raw chunk UUIDs or score internals in the default answer card.

#### Scenario: Citation is selected
- **WHEN** a user selects a citation or evidence chip
- **THEN** the system SHALL reveal or highlight the matching source excerpt in the document evidence region.

### Requirement: Sanitized AI transparency layer
The system SHALL provide assessment-relevant AI transparency without dumping raw provider metadata in the default reviewer path.

#### Scenario: AI metadata exists
- **WHEN** analysis or chat metadata is available
- **THEN** the system SHALL show a compact trust summary containing model/provider, prompt ID or version, retrieval mode, citation coverage, uncertainty or fallback status, and token usage when available.

#### Scenario: Reviewer opens technical details
- **WHEN** the reviewer expands AI details
- **THEN** the system SHALL show technical context in understandable labels, including provider/model, prompt version, context strategy, retrieval backend, fallback reason, token usage, and retrieved evidence summary.

#### Scenario: Default reviewer view loads
- **WHEN** the review workspace first renders after an AI response
- **THEN** the system MUST NOT display raw metadata JSON, provider response IDs, internal document IDs, raw chunk IDs, backend stack traces, or raw provider payloads by default.

### Requirement: Sensitive-content and unsafe-input handling in the reviewer UX
The system SHALL treat uploaded document text as untrusted content and shall not echo credential-like secrets as normal AI answers.

#### Scenario: Document contains credential-like content
- **WHEN** submitted or sample document content contains password-like strings, credential requests, AWS profile/key references, or other secret-shaped content
- **THEN** the UI SHALL warn or redact in user-facing output and MUST NOT present secret-shaped values as recommended credentials to share.

#### Scenario: Document contains prompt injection text
- **WHEN** document content instructs the model to ignore policies, reveal secrets, forge citations, or answer without evidence
- **THEN** the answer presentation SHALL treat that text as document evidence only and SHALL preserve the citation, uncertainty, and unsupported-answer policies.

#### Scenario: PDF-origin prompt injection text
- **WHEN** converted PDF text instructs the model to reveal secrets, emit chain-of-thought, forge citations, ignore grounding policy, or answer without evidence
- **THEN** backend answer normalization and UI presentation SHALL treat that text as untrusted document evidence only and SHALL preserve citation gating, uncertainty, redaction, and unsupported-answer policies.

### Requirement: Safe error presentation
The system SHALL map backend and provider errors to safe reviewer-facing messages.

#### Scenario: Backend error includes sensitive implementation detail
- **WHEN** an API error payload contains stack traces, provider configuration names, secret-like strings, or raw provider failure text
- **THEN** the visible UI MUST show a safe contextual error and MUST NOT render the sensitive implementation detail directly.

#### Scenario: AI provider is unavailable
- **WHEN** the AI provider cannot complete analysis or chat
- **THEN** the system SHALL explain that AI processing is unavailable, preserve the selected document and current input, and offer a retry or fallback action appropriate to the operation.
