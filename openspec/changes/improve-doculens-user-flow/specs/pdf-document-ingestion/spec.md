## ADDED Requirements

### Requirement: Authenticated PDF upload intake
The system SHALL allow authenticated users to submit a bounded text-based PDF document from the reviewer intake flow in addition to pasted Markdown/text.

#### Scenario: Reviewer selects a PDF file
- **WHEN** an authenticated reviewer selects a PDF from the intake experience
- **THEN** the system SHALL show the inert basename, file type, file size, text-based-PDF/no-OCR caveat, default max 5 MiB size limit, default max 20 page limit, and a primary action to create a review workspace from the PDF.

#### Scenario: Reviewer submits the selected PDF
- **WHEN** the reviewer submits a valid selected PDF
- **THEN** the system SHALL upload the file through authenticated `POST /api/documents/uploads/pdf` as `multipart/form-data` with one required `file` field and optional `title` field, and SHALL preserve the existing pasted-text submission path.

#### Scenario: User is unauthenticated
- **WHEN** a PDF upload request has no valid authentication
- **THEN** the system MUST reject the request before conversion, temp-file creation, or document persistence.

### Requirement: PDF upload contract and limits
The system SHALL enforce a bounded upload contract before PDF conversion or persistence.

#### Scenario: File exceeds configured limits
- **WHEN** the selected PDF exceeds default limits of 5 MiB, 20 detectable pages, 15 seconds conversion wall clock, or 120,000 extracted characters
- **THEN** the system SHALL reject or stop processing the file with a safe limit message and MUST NOT create a ready document or chunks.

#### Scenario: File type is unsupported
- **WHEN** the selected file is not a PDF according to accepted content type, extension, and magic-byte or converter validation
- **THEN** the system SHALL reject the file with a safe user-facing message and SHALL offer the pasted-text path as a fallback.

#### Scenario: Multipart body is malformed or over limit
- **WHEN** the upload body is malformed, contains multiple files, omits the `file` field, or exceeds the request limit while streaming
- **THEN** the system SHALL abort processing safely, clean up any temporary file, and MUST NOT invoke PDF conversion.

### Requirement: PDF conversion runtime
The system SHALL use a real MarkItDown-compatible converter runtime for user PDF uploads and SHALL NOT use fixture-only fallback conversion for arbitrary uploads.

#### Scenario: PDF conversion succeeds
- **WHEN** an accepted PDF can be converted to text or Markdown by the configured runtime
- **THEN** the system SHALL normalize and chunk the converted content using the existing ingestion pipeline and SHALL persist it as a document owned by the authenticated user.

#### Scenario: Converter runtime is unavailable
- **WHEN** the configured PDF conversion runtime is unavailable, not packaged in the demo environment, exits non-zero, or times out
- **THEN** the system SHALL return a safe conversion-unavailable failure, SHALL offer paste-text fallback, and MUST NOT claim that the document was analyzed or ready.

#### Scenario: PDF conversion produces no usable text
- **WHEN** conversion succeeds technically but produces empty or unusable text
- **THEN** the system SHALL show a conversion failure state explaining that scanned/image-only or unsupported PDFs are not OCRed in this demo and SHALL offer paste-text fallback.

### Requirement: PDF conversion safety
The system SHALL treat PDFs and converter output as hostile input.

#### Scenario: PDF is encrypted, password-protected, malformed, or active-content-heavy
- **WHEN** the uploaded PDF is encrypted, password-protected, malformed, contains embedded actions/attachments, attempts remote references, or otherwise cannot be safely converted
- **THEN** the system SHALL fail safely before analysis readiness and MUST NOT execute embedded actions, fetch remote resources, or expose raw converter details.

#### Scenario: Temporary files are used
- **WHEN** the backend writes an uploaded PDF or converted output to disk for conversion
- **THEN** temporary files SHALL be created outside the repository under the OS temporary directory, use safe generated names rather than user filenames, and be deleted after success, validation failure, conversion failure, or timeout.

#### Scenario: Converter emits sensitive details
- **WHEN** converter stdout, stderr, exceptions, or logs contain raw document excerpts, local paths, stack traces, commands, dependency details, or secret-shaped strings
- **THEN** visible responses and application logs MUST redact those details and show only a safe conversion error.

### Requirement: PDF ingestion status and recovery UX
The system SHALL show reviewer-friendly upload and conversion progress states before analysis begins.

#### Scenario: PDF upload is pending
- **WHEN** the PDF is uploading or converting
- **THEN** the UI SHALL show operation-specific status such as uploading file, converting PDF, normalizing content, and preparing evidence, without implying token streaming or completed analysis.

#### Scenario: PDF ingestion fails
- **WHEN** upload, validation, conversion, normalization, chunking, or persistence fails
- **THEN** the UI SHALL preserve the selected-file context where safe, show a contextual recovery action, and MUST NOT lose unrelated document or authentication state.

### Requirement: PDF analysis readiness
The system SHALL route successfully converted PDFs into the same analysis and chat readiness flow as pasted text documents.

#### Scenario: PDF document is persisted
- **WHEN** a PDF has been converted, normalized, chunked, and persisted
- **THEN** the system SHALL return `201 { document }`, transition to the review workspace for that document, and allow the user to run analysis and ask document-grounded questions.

#### Scenario: PDF-derived document is reviewed
- **WHEN** analysis or chat runs on a PDF-derived document
- **THEN** the system SHALL apply the same citation, uncertainty, fallback, unsupported-answer, backend answer normalization, and AI transparency rules used for pasted-text documents.

### Requirement: PDF upload safety and privacy
The system SHALL handle uploaded PDFs as untrusted and potentially sensitive documents.

#### Scenario: PDF content contains unsafe instructions or credential-like text
- **WHEN** converted PDF text includes prompt injection, forged-citation instructions, credential requests, secret-shaped values, or operational instructions
- **THEN** the system SHALL treat that text as untrusted document evidence and SHALL preserve redaction, citation, uncertainty, backend answer normalization, and unsupported-answer policies.

#### Scenario: Failed PDF conversion would otherwise create partial state
- **WHEN** PDF validation or conversion fails before normalized text is ready
- **THEN** the system MUST NOT create a ready document, chunks, analysis, chat messages, or citations for that failed upload.
