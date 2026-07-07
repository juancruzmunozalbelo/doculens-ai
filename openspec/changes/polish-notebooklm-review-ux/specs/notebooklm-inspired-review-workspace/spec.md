## ADDED Requirements

### Requirement: Compact single-active-source review workspace
The system SHALL present a NotebookLM-inspired review workspace that keeps source selection, source preview, and review/chat output visible without an oversized landing-page hero. This change SHALL use a single active source model and SHALL NOT require NotebookLM feature parity, multi-source synthesis, source checkboxes, audio overviews, mind maps, or web discovery.

#### Scenario: Authenticated reviewer opens sources
- **WHEN** an authenticated reviewer opens the app
- **THEN** the system SHALL show a compact app shell with a source rail, a primary review/chat area, and selected source context without a large marketing-style hero consuming the viewport.

#### Scenario: Reviewer selects a source
- **WHEN** the reviewer selects a source from the source rail
- **THEN** the system SHALL keep the selected source identity visible, update the source preview region, regenerate source-scoped actions/questions, and scope briefing, answers, citations, and evidence to that single active source.

#### Scenario: Reviewer switches active source
- **WHEN** the reviewer switches from one source to another
- **THEN** subsequent briefing, starter questions, and chat requests SHALL use only the newly active source, while previous answer history entries remain labeled with the source they were produced from or are reset intentionally.

#### Scenario: Layout adapts to viewport
- **WHEN** the viewport is narrow or the source rail would crowd the review panel
- **THEN** the system SHALL collapse or stack source navigation without hiding the active source identity or primary review actions.

### Requirement: Unified source creation flow
The system SHALL expose sample, PDF upload, and pasted text as methods of one source creation flow rather than separate competing panels.

#### Scenario: Reviewer adds a source
- **WHEN** the reviewer activates the add-source action
- **THEN** the system SHALL present PDF upload, pasted text, and safe sample options as one unified flow with clear method selection.

#### Scenario: Reviewer chooses a source method
- **WHEN** the reviewer switches between PDF and pasted text creation
- **THEN** the system SHALL preserve safe entered context for the active method and SHALL NOT make PDF and text feel like unrelated features.

### Requirement: Source cards show useful metadata and in-scope actions
The system SHALL render each source with a useful display name, type, readiness state, safe upload metadata, and only supported lifecycle actions.

#### Scenario: PDF source has original filename metadata
- **WHEN** a PDF-derived source is listed
- **THEN** the source card SHALL show the user title when present, the sanitized original basename when available, source type, readiness state, and uploaded time or relative age.

#### Scenario: Source names are duplicate or generic
- **WHEN** multiple sources have the same or low-information title such as `test`
- **THEN** the system SHALL disambiguate them using safe filename, created/uploaded time, source type, or another reviewer-readable detail.

#### Scenario: Reviewer opens a source
- **WHEN** a source card is available
- **THEN** the system SHALL provide an open action that selects the source and updates source preview, briefing context, starter questions, and chat context.

#### Scenario: Reviewer renames a source
- **WHEN** the reviewer renames a source title
- **THEN** the system SHALL persist the new reviewer-facing title, preserve safe original filename metadata, and update source card and active source title without changing source ownership or content.

#### Scenario: Reviewer deletes a source
- **WHEN** the reviewer deletes a source
- **THEN** the system SHALL remove it from the source rail, prevent stale active-source citations or answers from appearing as current context, and route to another safe source or the empty source state.

#### Scenario: Recoverable operation fails before source persistence
- **WHEN** upload, conversion, analysis, or chat fails before creating a usable source/result
- **THEN** retry SHALL be offered in the relevant operation UI while preserving safe client-side context; the source rail SHALL NOT show unsupported server-side retry actions for hidden failed document records.

### Requirement: Workspace is keyboard and screen-reader operable
The system SHALL make source navigation, source creation, lifecycle actions, citations, and responsive navigation usable by keyboard and assistive technology.

#### Scenario: Source rail is keyboard operated
- **WHEN** the reviewer tabs through the source rail
- **THEN** each source and supported action SHALL have visible focus, accessible labels, and an active/selected state that can be announced without exposing raw document IDs.

#### Scenario: Add-source method is changed by keyboard
- **WHEN** the reviewer uses keyboard controls in the add-source flow
- **THEN** method selection SHALL follow accessible tab/radio/segmented-control semantics and focus SHALL remain predictable.

#### Scenario: Lifecycle action completes
- **WHEN** rename or delete completes or is cancelled
- **THEN** focus SHALL return to the relevant source card, next safe source, or add-source control.

### Requirement: Product shell polish and favicon
The system SHALL include minimal product polish expected of a demo app, including favicon and browser metadata.

#### Scenario: App loads in a browser tab
- **WHEN** the reviewer opens the app
- **THEN** the browser tab SHALL show a DocuLens-specific title, meta description, theme color, and a non-generic favicon/app icon resolved from app assets rather than a generic Vite or missing icon state.

#### Scenario: Reviewer captures a screenshot
- **WHEN** the app is screenshotted during the demo
- **THEN** the visible shell SHALL look like a complete source review product with consistent spacing, typography, active states, and no placeholder/demo-only chrome.
