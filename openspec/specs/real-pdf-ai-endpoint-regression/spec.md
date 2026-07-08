# real-pdf-ai-endpoint-regression

## Purpose
Capture the accepted behavior for the `real-pdf-ai-endpoint-regression` capability after the `fix-real-pdf-ai-endpoints` change.

## Requirements

### Requirement: Real assessment PDF endpoints are semantically regression-tested
The system SHALL provide an endpoint-level regression path that uploads the real Full Stack AI Engineer Assessment PDF, validates extracted document content, validates chunk availability, generates a structured analysis, and asks representative reviewer questions without relying only on HTTP status codes.

#### Scenario: Real PDF upload creates a ready source
- **WHEN** the reviewer authenticates and uploads `Full_Stack_AI_Engineer_Assessment (1).pdf` to `/api/documents/uploads/pdf`
- **THEN** the API SHALL return `201` with a `document.id`, `sourceType` of `pdf`, `status` of `ready`, PDF metadata including safe original basename, MIME type, byte size, upload time, and extracted content containing the assessment title and overview text.

#### Scenario: Real PDF chunks are available for retrieval
- **WHEN** the reviewer requests `/api/documents/{documentId}/chunks` after upload
- **THEN** the API SHALL return at least the minimum expected chunks for the assessment and SHALL include safe content excerpts and section metadata suitable for citation and retrieval.

#### Scenario: Real PDF analysis is semantically useful
- **WHEN** the reviewer posts to `/api/documents/{documentId}/analysis` for the uploaded assessment PDF
- **THEN** the API SHALL return `201` with a structured analysis containing a meaningful summary and non-empty assessment-relevant requirements or deliverables rather than only fallback text about failed briefing conversion.

#### Scenario: Real PDF chat validates representative questions
- **WHEN** the reviewer asks overview, main requirements, backend requirements, frontend UX, deliverables, and unsupported outside-source questions through `/api/documents/{documentId}/chat`
- **THEN** supported source questions SHALL return useful answer states and unsupported questions SHALL return unsupported or insufficient evidence without fabricated citations.

#### Scenario: Regression output is safe for UI display
- **WHEN** endpoint regression captures analysis, answer cards, retrieved chunks, messages, citations, or technical details
- **THEN** reviewer-facing fields SHALL NOT contain Markdown JSON fences, provider payloads, raw object strings, chain-of-thought, response IDs, stack traces, secret-shaped values, or raw internal chunk identifiers.
