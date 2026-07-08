# assessment-pdf-golden-path

## Purpose
Capture the accepted behavior for the `assessment-pdf-golden-path` capability after the `fix-real-pdf-ai-endpoints` change.

## Requirements

### Requirement: Assessment PDF conversion preserves usable section structure
The system SHALL convert the real assessment PDF into text and chunks that preserve enough section structure for retrieval and reviewer answers.

#### Scenario: Converted assessment text has known markers
- **WHEN** the assessment PDF is uploaded and converted
- **THEN** extracted content SHALL include known markers such as assessment title, overview/purpose, backend requirements, frontend requirements, data/privacy/logging expectations, deployment requirements, deliverables, and evaluation criteria.

#### Scenario: Chunk headings are inferred when Markdown headings are absent
- **WHEN** converted PDF text contains visible section labels without Markdown heading syntax
- **THEN** chunk metadata SHALL infer useful heading paths rather than assigning every chunk to `Untitled`.

### Requirement: Assessment briefing contains real structured content
The system SHALL produce a briefing for the assessment PDF that uses canonical fields relevant to the assignment.

#### Scenario: Assessment analysis succeeds
- **WHEN** analysis is generated for the uploaded assessment PDF
- **THEN** the briefing SHALL include a meaningful summary and non-empty requirements or deliverables, plus risks, uncertainties, or recommended questions when present in the provider output or source.

#### Scenario: Assessment analysis is reloaded
- **WHEN** the generated assessment analysis is saved and then read back through the API
- **THEN** canonical arrays and metadata SHALL survive persistence without becoming JSON strings or raw object text.

### Requirement: Assessment golden questions remain stable
The system SHALL answer the assessment golden questions with expected answer-state behavior.

#### Scenario: Supported assessment questions are asked
- **WHEN** the reviewer asks about backend, frontend, data/privacy, deployment, deliverables, reliability/evaluation, and main requirements
- **THEN** the system SHALL return grounded, source-overview, or section-summary answers with safe display text rather than fallback-only or insufficient-evidence states.

#### Scenario: Unsupported assessment question is asked
- **WHEN** the reviewer asks an outside-source question about current external facts
- **THEN** the system SHALL return an unsupported answer state without invoking unsupported fabrication.
