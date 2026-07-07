## ADDED Requirements

### Requirement: Degraded answer states are concise and actionable
The reviewer workspace SHALL render insufficient-evidence and unsupported states with compact, neutral, actionable copy that does not dominate the page or imply the source is useless when only the question needs refinement.

#### Scenario: Insufficient evidence answer is shown
- **WHEN** an answer is correctly classified as insufficient evidence
- **THEN** the answer card SHALL use concise copy, avoid repeated large headings, avoid jargon-heavy sections such as empty citation controls, and provide clear actions such as ask overview or refine with source evidence.

#### Scenario: No evidence was used
- **WHEN** an answer has no citations or evidence excerpts
- **THEN** the UI SHALL avoid rendering oversized empty evidence regions and SHALL clearly state that no answer-specific evidence was used.

### Requirement: Source preview and cards remain readable on narrow screens
The reviewer workspace SHALL prevent source preview panels, active source headers, and source cards from overlapping or overflowing on mobile/narrow layouts.

#### Scenario: Long PDF filename is selected
- **WHEN** a source has a long filename such as `Full_Stack_AI_Engineer_Assessment (1).pdf`
- **THEN** the active source header and source card SHALL truncate or wrap the title safely without covering the source preview or controls.

#### Scenario: Source preview is open on mobile width
- **WHEN** the source preview is visible on a narrow viewport
- **THEN** the preview SHALL fit within the viewport, remain scrollable, and not obscure the source rail controls in a way that prevents opening, renaming, deleting, or reviewing sources.

### Requirement: Briefing headings avoid duplicated or confusing labels
The reviewer workspace SHALL avoid duplicate adjacent labels such as `Summary Summary` and SHALL distinguish section headings from field labels.

#### Scenario: Briefing renders summary section
- **WHEN** the briefing summary is shown
- **THEN** the UI SHALL render one clear summary heading and the summary body without repeated label text.

#### Scenario: Briefing is fallback-only
- **WHEN** the briefing has only safe fallback limitation copy
- **THEN** the UI SHALL present the limitation as a recovery state, not as a normal structured briefing with empty sections.
