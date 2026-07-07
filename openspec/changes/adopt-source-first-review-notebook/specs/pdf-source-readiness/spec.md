## ADDED Requirements

### Requirement: PDF upload creates a source readiness flow
The system SHALL treat PDF upload as creation of a reviewable source with simple readiness states.

#### Scenario: User selects a PDF
- **WHEN** the user selects a PDF for upload
- **THEN** the system SHALL show the selected filename and a simple action to create or read the source, with PDF caveats available in concise help or disclosure text.

#### Scenario: PDF upload is pending
- **WHEN** a selected PDF is being uploaded or read and no persisted document exists yet
- **THEN** the system MAY show a client-side pending source card with safe visible context such as filename, file type, and title, and MUST NOT imply that the source is persisted or ready before the API returns a document.

#### Scenario: PDF upload succeeds
- **WHEN** a text-based PDF is accepted, converted, persisted, and ready for review
- **THEN** the system SHALL create or update a source card for that PDF and mark it ready for review without showing converter, normalization, chunking, or internal persistence details in the primary path.

#### Scenario: PDF source opens
- **WHEN** the ready PDF source is opened
- **THEN** the system SHALL navigate to the source-first review notebook with that PDF as the active source and show starter questions and review actions.

### Requirement: PDF limitations are contextual and recoverable
The system SHALL communicate PDF limitations only where they help the user choose or recover.

#### Scenario: User has not selected a PDF
- **WHEN** the PDF upload method is visible before file selection
- **THEN** the system MAY show concise caveats such as text-based PDFs only and no scanned OCR, but MUST NOT dominate the screen with limits, conversion internals, or implementation notes.

#### Scenario: PDF is too large or outside limits
- **WHEN** the selected PDF exceeds supported limits
- **THEN** the system SHALL explain the user action needed, such as choosing a smaller PDF or pasting text, and MAY expose exact limits in secondary copy.

#### Scenario: PDF has no readable text or is protected
- **WHEN** the system cannot extract usable text from the PDF
- **THEN** the system SHALL say the PDF could not be read, preserve safe visible context where possible, and offer choose-another-file or paste-text recovery actions.

#### Scenario: Converter or backend fails
- **WHEN** the PDF cannot be processed because a converter, dependency, timeout, or backend error occurs
- **THEN** the primary UI SHALL show a safe recovery message and MUST NOT reveal converter stdout/stderr, dependency names, local paths, stack traces, command output, or raw implementation details.

### Requirement: PDF failure recovery exposes concrete actions
The system SHALL map PDF failure categories to clear recovery actions.

#### Scenario: Oversized PDF fails
- **WHEN** PDF upload fails because the file is too large or exceeds page/text limits
- **THEN** the UI SHALL preserve safe visible context such as filename and size, and SHALL offer `Choose another PDF` and `Paste text instead` or equivalent actions.

#### Scenario: Unsupported PDF fails
- **WHEN** PDF upload fails because the file type is unsupported or mismatched
- **THEN** the UI SHALL explain that the user should choose a PDF or paste text, and MUST NOT expose MIME parser or multipart internals.

#### Scenario: Scanned, encrypted, protected, or no-text PDF fails
- **WHEN** PDF reading fails because the file is scanned, encrypted, protected, or has no readable text
- **THEN** the UI SHALL explain that the PDF could not be read and SHALL offer choose-another-file and paste-text recovery actions.

#### Scenario: Temporary processing failure occurs
- **WHEN** PDF processing fails because of timeout, converter unavailable, or backend failure
- **THEN** the UI SHALL preserve safe visible context and offer retry when appropriate plus choose-another-file or paste-text recovery.

#### Scenario: File object cannot be preserved
- **WHEN** browser behavior or security prevents preserving the selected File object after failure
- **THEN** the system SHALL still preserve safe visible context such as filename/title/error and SHALL let the user choose another file or paste text.

### Requirement: PDF-derived review content is user-facing
The system SHALL present PDF-derived document content and answers as review content, not conversion artifacts.

#### Scenario: PDF source evidence is shown
- **WHEN** the active source came from a PDF
- **THEN** source evidence SHALL be shown with document/title/section context and MUST NOT refer to raw conversion artifacts unless the user opens technical details.

#### Scenario: PDF question is answered
- **WHEN** the user asks a question about a PDF-derived source
- **THEN** the answer SHALL follow the same safe answer, inline citation, evidence-panel, and quiet-copy requirements as pasted or sample documents.

### Requirement: Review output is print-safe through a summary action or print styles
The system SHALL prevent broken browser-print artifacts from being the only way to share or save a review.

#### Scenario: User prints a review summary
- **WHEN** the user activates a print/review-summary action or prints the review page
- **THEN** the output SHALL use a print-safe layout with a coherent title, active source summary, briefing or selected answers, citations, and evidence.

#### Scenario: Print layout is generated
- **WHEN** print media styles or a review-summary view are active
- **THEN** navigation, forms, source-management controls, and technical details SHALL be hidden by default, while source title, summary, answer text, citation labels, and evidence excerpts remain visible.

#### Scenario: Answer and evidence blocks print
- **WHEN** answer and evidence sections are printed
- **THEN** the layout SHALL avoid broken multi-column app chrome and SHOULD keep answer/evidence blocks together using print-safe single-column layout and page-break controls where supported.

#### Scenario: Technical details exist in printed output
- **WHEN** technical trust details are available while printing or exporting
- **THEN** the output SHALL either omit them by default or include them in a clearly labeled appendix-style section that does not interrupt the review summary.

#### Scenario: Browser print adds chrome
- **WHEN** the browser adds URL/date/page headers or footers that the app cannot control
- **THEN** the application SHALL still ensure its own printed content is coherent and MUST NOT rely on browser chrome as primary review content.
