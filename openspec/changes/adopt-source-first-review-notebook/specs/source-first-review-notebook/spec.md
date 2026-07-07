## ADDED Requirements

### Requirement: Source-first review notebook workspace
The system SHALL organize the authenticated review experience around visible sources before analysis, chat, or technical metadata.

#### Scenario: User opens the authenticated experience
- **WHEN** an authenticated user reaches the main product flow
- **THEN** the system SHALL present a source-first review notebook or create-review experience where sample documents, uploaded PDFs, and pasted text are represented as sources rather than unrelated intake panels.

#### Scenario: Source is selected
- **WHEN** a user selects or creates a source
- **THEN** the system SHALL keep the active source visible while showing review briefing, questions, answers, citations, and evidence associated with that source.

#### Scenario: No source exists
- **WHEN** the authenticated user has no available source
- **THEN** the system SHALL present one primary create-source action with clear methods for sample, PDF upload, or pasted text and MUST NOT present multiple equal-weight panels that require the user to infer the preferred path.

### Requirement: Single active source scope
The system SHALL support one active review source at a time for this MVP and MUST NOT imply multi-source synthesis or cross-source comparison.

#### Scenario: Multiple sources exist
- **WHEN** multiple sample, pasted-text, or PDF sources are available
- **THEN** the system SHALL show which source is active and SHALL scope briefing, questions, answers, citations, and evidence to that one active source only.

#### Scenario: User asks about all sources
- **WHEN** the user asks a question that requires comparing or synthesizing across multiple sources
- **THEN** the system SHALL guide the user to select one source or explain that this review uses one active source at a time, and MUST NOT claim to compare sources unless a future multi-source contract exists.

#### Scenario: User switches active source
- **WHEN** the user changes the active source
- **THEN** the system SHALL clear, hide, or clearly relabel briefing, question history, answer history, citations, and evidence that belong to the previous source so they cannot appear attached to the new source.

### Requirement: Source cards and readiness states
The system SHALL represent each reviewable document as a source card with simple readiness and recovery state.

#### Scenario: Source is ready
- **WHEN** a sample, pasted text document, or PDF-derived document is ready for review
- **THEN** the source card SHALL show the source title, source type, and a simple ready state such as `Ready` without exposing chunking, retrieval, conversion, prompt, or provider terminology.

#### Scenario: Source is processing
- **WHEN** a source is being created, uploaded, parsed, or prepared
- **THEN** the system SHALL show a short user-level state such as `Reading PDF` or `Preparing document` and MUST NOT describe internal normalization, chunking, provider calls, retrieval, or citation-validation steps in the primary path.

#### Scenario: Source cannot be prepared
- **WHEN** a source fails ingestion or preparation
- **THEN** the source card SHALL preserve safe visible context, show a concise failure state, and offer retry, choose another file, or paste-text recovery actions.

### Requirement: Source detail is available when reopening sources
The system SHALL load enough source content to support the source-first evidence experience when a source is reopened from a list or recent-source card.

#### Scenario: Source list omits full content
- **WHEN** a source or recent-document list response does not include full source content
- **THEN** opening that source SHALL fetch or otherwise load source detail before showing the source evidence panel as ready.

#### Scenario: Source detail loads successfully
- **WHEN** source detail is loaded after selecting a recent source
- **THEN** the source card and evidence panel SHALL show real source title/content context rather than placeholder text about missing list content.

#### Scenario: Source detail cannot be loaded
- **WHEN** source detail fails to load after selecting a recent source
- **THEN** the system SHALL show a concise recovery state and MUST NOT show implementation placeholder copy such as missing list response internals.

### Requirement: Starter questions before analysis
The system SHALL offer guided questions as soon as a source is ready, even before structured analysis has been generated.

#### Scenario: Ready source has no analysis
- **WHEN** a source is ready and no structured analysis exists yet
- **THEN** the system SHALL show starter questions relevant to the source, such as what the document is, what it requires, what deliverables it lists, what risks matter, or which sections discuss infrastructure.

#### Scenario: User selects a starter question
- **WHEN** a user selects a starter question
- **THEN** the system SHALL populate or submit the question in the source-scoped question flow without requiring the user to first run structured analysis.

#### Scenario: Starter questions are displayed
- **WHEN** starter questions are visible in the MVP
- **THEN** their primary labels SHALL use the MVP copy language defined for the product flow and SHALL NOT mix English and Spanish primary CTAs in the same authenticated path.

### Requirement: Review briefing as synthesis surface
The system SHALL present structured analysis as a review briefing rather than a technical analysis step.

#### Scenario: Briefing has not been generated
- **WHEN** the active source has no current analysis result
- **THEN** the system SHALL offer a user-facing action such as `Generate summary` or `Generate review briefing` and MUST NOT require the user to understand `Run structured analysis` as a technical prerequisite.

#### Scenario: Briefing is available
- **WHEN** analysis returns summary, entities, obligations, risks, uncertainties, or recommended questions
- **THEN** the system SHALL render them as scannable notebook sections connected to the active source.

#### Scenario: User switches source
- **WHEN** the user changes the active source
- **THEN** briefing, questions, answers, citations, and evidence SHALL update to match the selected source or clearly indicate that no review content exists for that source.
