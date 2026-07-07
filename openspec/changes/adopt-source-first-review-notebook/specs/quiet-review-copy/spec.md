## ADDED Requirements

### Requirement: MVP copy language is consistent
The system SHALL use one consistent primary copy language across the authenticated MVP review flow.

#### Scenario: Primary authenticated flow renders
- **WHEN** the MVP source-first review flow renders headings, CTAs, helper text, loading states, error states, starter questions, and answer states
- **THEN** those primary labels SHALL use English consistently and MUST NOT mix English and Spanish CTAs or state labels in the same path.

#### Scenario: Non-English document or question is used
- **WHEN** the source document or user question is in Spanish or another non-English language
- **THEN** the system MAY answer in the user's/document's language where appropriate, but persistent product navigation and primary UI labels SHALL remain in the MVP copy language.

#### Scenario: Future localization is added
- **WHEN** localization or browser-language-aware UI is introduced in a future change
- **THEN** the system SHALL define language selection, fallback, and tests explicitly before mixing UI languages.

### Requirement: Primary-path copy uses user outcomes
The system SHALL use concise user-facing copy in the primary review path and MUST NOT rely on explanatory notes to teach implementation details.

#### Scenario: Primary review screen renders
- **WHEN** the source-first review screen renders
- **THEN** visible headings, labels, helper text, buttons, and empty states SHALL describe user outcomes or actions such as ready source, generate summary, ask a question, view evidence, retry, or paste text.

#### Scenario: Implementation vocabulary would appear
- **WHEN** copy is shown outside an explicit technical-details disclosure
- **THEN** the system MUST NOT show implementation terms such as chunk, retrieval score, citation-quality chunk, fallback reason, prompt ID, provider payload, token usage, raw metadata, normalization, converter, conversion timeout, or converter internals.

#### Scenario: Helper note is not actionable
- **WHEN** a note does not directly explain the current state, next action, result, risk, or recovery path
- **THEN** the system SHALL omit it from the primary path or move it behind a disclosure.

### Requirement: Quiet loading states
The system SHALL communicate loading progress with short user-level statuses.

#### Scenario: PDF upload or reading is running
- **WHEN** PDF upload, validation, conversion, persistence, or preparation is pending
- **THEN** the system SHALL show a short state such as `Reading PDF` or `Preparing document` and MUST NOT enumerate internal upload limits, parsing, conversion, normalization, chunking, or evidence-preparation steps as the loading message.

#### Scenario: Analysis is running
- **WHEN** review briefing or analysis is pending
- **THEN** the system SHALL show a short state such as `Generating summary` and MUST NOT expose provider invocation, retrieval, prompt, citation validation, token, or fallback details in the primary loading state.

#### Scenario: Question answering is running
- **WHEN** the user asks a source-scoped question
- **THEN** the system SHALL show a short state such as `Searching this document` or `Looking for evidence` and SHALL preserve the question and prior visible review context.

### Requirement: Quiet error and recovery copy
The system SHALL make errors recoverable without exposing technical internals.

#### Scenario: Recoverable source error occurs
- **WHEN** source upload, PDF reading, or document creation fails
- **THEN** the system SHALL state what the user can do next, such as retry, choose another PDF, or paste text, and MUST NOT show stack traces, converter command output, dependency names, local paths, or raw backend errors.

#### Scenario: AI provider or answer generation fails
- **WHEN** analysis or chat cannot complete
- **THEN** the system SHALL explain that the answer could not be generated, preserve the source and input, and offer retry or refinement without exposing provider configuration, model transport, prompt, or token details.

#### Scenario: A question is ambiguous
- **WHEN** the user asks an ambiguous or overly broad question
- **THEN** the system SHALL guide the user with clarification options or starter questions instead of showing raw fallback/debug state.

### Requirement: Trust summary separates user facts from technical details
The system SHALL keep a small user-level trust summary visible while moving technical AI metadata behind an explicit disclosure.

#### Scenario: Grounded answer is visible
- **WHEN** an answer is grounded in active-source evidence
- **THEN** the visible trust summary SHALL use user-level facts such as `Based on this document` and citation count, and MUST NOT show provider/model, prompt ID, retrieval mode, fallback reason, token usage, or backend diagnostics.

#### Scenario: Evidence is insufficient
- **WHEN** answer evidence is insufficient or no citation-quality evidence is available
- **THEN** the visible trust summary SHALL say that evidence is insufficient or that the answer is outside the document scope, and MUST NOT expose raw fallback labels, low-retrieval labels, or diagnostic names.

#### Scenario: Technical metadata exists
- **WHEN** provider/model, prompt version, retrieval mode, fallback reason, citation coverage diagnostics, token usage, or backend diagnostics are available
- **THEN** those details SHALL be hidden from the primary path unless the user opens a clearly labeled technical-details disclosure.

#### Scenario: Technical details are opened
- **WHEN** the user opens the technical-details disclosure
- **THEN** the system SHALL show safe, redacted, understandable labels for provider/model, prompt version, retrieval mode, fallback reason, citation diagnostics, and token usage, and MUST NOT expose raw provider payloads, raw JSON metadata, internal IDs, stack traces, local paths, or secret-like values.

### Requirement: Quiet-copy tests distinguish primary path from technical details
The system SHALL support deterministic tests that validate quiet primary copy separately from safe technical disclosure.

#### Scenario: Primary path is tested
- **WHEN** tests assert quiet copy requirements
- **THEN** they SHALL scope assertions to primary regions such as source cards, briefing, questions, answer cards, evidence panel, and visible trust summary with technical details closed.

#### Scenario: Technical disclosure is tested
- **WHEN** tests open technical details
- **THEN** they MAY expect safe technical labels and MUST still reject raw payloads, internal IDs, raw JSON dumps, stack traces, local paths, and secret-like values.
