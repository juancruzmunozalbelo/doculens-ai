## ADDED Requirements

### Requirement: Real provider analysis output is normalized before display
The system SHALL normalize real MiniMax analysis responses into the canonical analysis contract when structured content is present in top-level JSON, Markdown-fenced JSON, provider-shaped wrappers, nested `answer` objects, nested string fields, or parseable JSON embedded in text.

#### Scenario: Analysis response contains JSON inside a text field
- **WHEN** MiniMax returns an analysis response whose useful object is encoded as a JSON string inside a text, content, output, message, or answer field
- **THEN** the system SHALL parse that object and map canonical briefing fields instead of returning a fallback-only summary.

#### Scenario: Analysis response cannot be normalized
- **WHEN** MiniMax returns prose or malformed content with no recoverable canonical fields
- **THEN** the system SHALL return safe limitation copy and recovery guidance without exposing raw provider output.

### Requirement: Chat answer text is always reviewer-facing prose
The system SHALL normalize chat provider output so `answer.text` is concise reviewer-facing prose and never a Markdown JSON fence, serialized JSON object, provider envelope, nested answer wrapper, or raw object string.

#### Scenario: Chat response is Markdown-fenced JSON
- **WHEN** MiniMax returns a chat answer as ```json with an `answer` field inside the fence
- **THEN** the API SHALL expose only the parsed answer prose in `answer.text` and SHALL preserve safe citations, uncertainty, display state, and metadata separately.

#### Scenario: Chat response is nested answer object
- **WHEN** MiniMax returns chat content under nested fields such as `answer.answer`, `message.answer`, `output.answer`, or a provider-specific content wrapper
- **THEN** the system SHALL unwrap the nested value and expose only canonical answer fields.

#### Scenario: Unsafe provider details are present
- **WHEN** provider output includes response IDs, provider payloads, hidden reasoning, chain-of-thought, policy text, stack traces, raw prompts, raw document text, or secret-shaped values
- **THEN** those values SHALL be redacted or omitted from API display fields, persisted messages, print output, and UI answer cards.
