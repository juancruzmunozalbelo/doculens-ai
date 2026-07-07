## ADDED Requirements

### Requirement: Reviewer-facing start experience
The system SHALL present a reviewer-facing start experience that communicates the DocuLens AI value proposition before exposing technical metadata or raw implementation details.

#### Scenario: Reviewer lands on the start experience
- **WHEN** a reviewer opens the application after authentication or reaches the authenticated empty state
- **THEN** the system SHALL show a clear product headline, a short explanation of grounded document review, proof chips for assessment-relevant capabilities, a primary sample-document CTA, secondary paste-text and upload-PDF paths, and visible PDF limits/caveat for text-based PDFs only with no OCR.

#### Scenario: Technical metadata is not shown before AI work
- **WHEN** no analysis or chat answer has been produced in the current review session
- **THEN** the system MUST NOT show raw provider metadata, raw JSON metadata, provider response IDs, chunk IDs, or retrieval score internals in the primary start experience.

### Requirement: Distinct intake and review workspace flow
The system SHALL provide at least two distinct user-facing flow states or pages for document intake and document review results, with a visible navigation, URL hash/history state, or route boundary that tests can assert.

#### Scenario: User submits or selects a document
- **WHEN** a user submits pasted content, uploads a PDF document, or selects the sample document from the intake experience
- **THEN** the system SHALL transition to a review workspace that is visually and navigationally distinct from the intake experience.

#### Scenario: User navigates between flow states
- **WHEN** a user moves between intake and review workspace states
- **THEN** the system SHALL preserve authentication state and available document context without requiring the user to re-enter submitted content.

### Requirement: Safe sample document golden path
The system SHALL provide a safe sample-document path that demonstrates document review without accidental operational notes, real secrets, credential requests, or local harness content.

#### Scenario: Reviewer starts the sample path
- **WHEN** the reviewer activates the primary sample-document CTA
- **THEN** the system SHALL select the existing safe seeded sample by stable ID/title when present, avoid duplicate sample creation by title/content hash, create an equivalent safe sample only when missing, and route the reviewer to the review workspace for that document.

#### Scenario: Sample content is displayed or analyzed
- **WHEN** the sample document is visible or used for analysis
- **THEN** the sample content MUST be realistic business document content suitable for assessment review and MUST NOT contain AWS cleanup instructions, real credential values, local harness paths, or accidental internal operational notes.

### Requirement: Review workspace layout
The system SHALL present the selected document and AI outputs in a review workspace that separates source evidence from analysis and follow-up actions.

#### Scenario: Workspace opens before analysis
- **WHEN** a selected document has no current analysis result
- **THEN** the workspace SHALL show the document title, a review status, source/content context, a primary run-analysis action, and an empty state explaining that analysis will produce summary, entities, obligations, risks, uncertainties, and citations.

#### Scenario: Workspace shows completed analysis context
- **WHEN** analysis or chat output is available
- **THEN** the workspace SHALL keep the selected document identity visible and SHALL separate source evidence, structured analysis, chat/refine controls, and AI trust information into clearly labeled regions.

### Requirement: AI operation state system
The system SHALL show operation-specific loading, empty, error, fallback, unsupported, and recovery states for the reviewer flow.

#### Scenario: Analysis is running
- **WHEN** a user starts analysis and the request is pending
- **THEN** the system SHALL show AI-specific staged status copy such as document preparation, evidence retrieval, model invocation, and citation or uncertainty validation instead of only a generic loading message.

#### Scenario: Chat is running
- **WHEN** a user asks a document question and the request is pending
- **THEN** the system SHALL show a question-specific AI status and SHALL preserve the current document, current question, and previous visible results.

#### Scenario: Recoverable error occurs
- **WHEN** an API, AI provider, authentication, or network error prevents the requested operation from completing
- **THEN** the system SHALL show a safe, contextual error message with a recovery action and MUST preserve user-entered document, selected file context, or question content where applicable.

#### Scenario: Retrieval or conversion limitation occurs
- **WHEN** retrieval coverage is weak, PDF conversion fails, or a PDF is scanned/image-only
- **THEN** the system SHALL show human-readable limitation copy such as `Insufficient document evidence`, `No citation-quality chunks matched`, or `Text-based PDFs only; scanned PDFs are not OCRed in this demo`, with refine, retry, inspect, or paste-text fallback actions.

### Requirement: Guided refine and re-ask flow
The system SHALL make follow-up and refinement actions discoverable from the review workspace.

#### Scenario: Analysis is available
- **WHEN** structured analysis is visible
- **THEN** the system SHALL show suggested document-specific questions or refinement prompts relevant to the selected document and analysis output.

#### Scenario: User asks multiple questions
- **WHEN** a user asks more than one question in the review workspace
- **THEN** the system SHALL preserve prior visible Q&A entries or provide an equivalent review history so the reviewer can see iterative AI use without losing the previous answer context.
