## ADDED Requirements

### Requirement: Provider analysis output is normalized before display
The system SHALL normalize provider analysis responses into a stable reviewer-facing analysis contract before API response, persistence, or UI rendering.

#### Scenario: Provider returns top-level structured JSON
- **WHEN** the provider returns JSON containing summary, sections, entities, requirements or obligations, deliverables, risks, uncertainties, and recommended questions
- **THEN** the system SHALL preserve those fields in the structured analysis contract and SHALL NOT render the raw JSON text as summary.

#### Scenario: Provider returns Markdown-fenced JSON
- **WHEN** the provider returns structured analysis inside a Markdown JSON fence
- **THEN** the system SHALL parse the fenced JSON, extract reviewer-facing fields, and SHALL NOT expose the fence markers in API display fields or UI.

#### Scenario: Provider returns nested answer object
- **WHEN** the provider returns analysis under a nested object such as `answer.summary`, `answer.entities`, `answer.requirements`, `answer.obligations`, or `answer.risks`
- **THEN** the system SHALL normalize the nested object into the same structured analysis contract.

#### Scenario: Normalized analysis is persisted and returned
- **WHEN** structured analysis is saved and later reloaded through API or repository paths
- **THEN** top-level API output SHALL preserve `summary`, `sections`, `entities`, `requirements`, `obligations` when applicable, `deliverables`, `risks`, `uncertainties`, `recommendedQuestions`, and sanitized `metadata` without lossy conversion into one summary string.

#### Scenario: Provider returns malformed or prose-only analysis
- **WHEN** the provider response cannot be parsed into structured fields
- **THEN** the system SHALL show a safe reviewer-facing limitation and recovery action rather than raw provider diagnostics such as `Provider returned prose instead of structured JSON.`

### Requirement: Chat provider answer output is normalized before persistence and display
The system SHALL normalize provider chat answers into safe answer text, validated citations, display state, and metadata before API response, persistence, or UI rendering.

#### Scenario: Chat provider returns fenced JSON answer
- **WHEN** a chat provider response contains answer text and citations inside a Markdown JSON fence
- **THEN** the system SHALL parse the fenced payload, sanitize answer text, validate citations against retrieved chunks, and SHALL NOT persist or display the raw fence.

#### Scenario: Chat provider returns nested answer object
- **WHEN** a chat provider response contains nested fields such as `answer.text`, `answer.citations`, or `answer.uncertainty`
- **THEN** the system SHALL normalize those fields into the chat answer contract before display and persistence.

#### Scenario: Chat provider returns unsupported or malformed prose
- **WHEN** a chat provider response cannot be safely normalized
- **THEN** the system SHALL return a safe insufficient, unsupported, full-document overview, or error state according to retrieval and failure context rather than raw provider output.

### Requirement: Structured briefing supports non-contract documents
The system SHALL extract useful review structure from assessment, requirements, and instruction documents, not only legal contracts.

#### Scenario: Assessment document is analyzed
- **WHEN** the active source is an assessment or challenge document
- **THEN** the briefing SHALL identify major parts, required capabilities, deliverables, risks/trade-offs, uncertainties, and suggested reviewer questions where those concepts are present.

#### Scenario: Analysis category is empty
- **WHEN** a category has no useful reviewer-facing items
- **THEN** the system SHALL hide, collapse, or group the empty category instead of showing large negative cards that dominate the briefing.

### Requirement: Raw provider artifacts stay out of reviewer surfaces
The system SHALL keep raw provider formatting, provider IDs, raw metadata, stack traces, chain-of-thought markers, and internal diagnostics out of primary reviewer UI and persisted display fields.

#### Scenario: Provider response contains raw/internal fields
- **WHEN** provider output contains raw payload, response IDs, hidden reasoning, internal policies, raw metadata, backend diagnostics, or credential-shaped values
- **THEN** response display fields, persisted reviewer-facing fields, and the visible UI SHALL omit or redact those values.

#### Scenario: Technical details are opened
- **WHEN** the reviewer opens technical details
- **THEN** the system SHALL show only allowlisted fields such as provider family/model, prompt version, retrieval mode, fallback/display state, citation count, redacted request reference, token usage, and score summary buckets without raw payloads, hidden reasoning, raw chunk IDs, document UUIDs, or provider response IDs.

#### Scenario: Forbidden artifact matrix is tested
- **WHEN** API responses, saved/reloaded analysis, saved/reloaded chat, briefing, answer cards, evidence panel, technical details, print output, aria labels, and error/retry UI render AI data
- **THEN** none of those reviewer-facing surfaces SHALL contain raw JSON fences, provider payloads, provider response IDs, hidden reasoning, stack traces, raw document text in errors, raw chunk IDs, or secret-shaped values.
