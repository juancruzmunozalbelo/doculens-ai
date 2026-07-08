# document-grounded-chat-ux

## Purpose
Capture the accepted behavior for the `document-grounded-chat-ux` capability after the `fix-real-pdf-ai-endpoints` change.

## Requirements

### Requirement: Source-level requirements questions are answerable
The system SHALL treat broad questions about a selected source's requirements, deliverables, risks, or overall purpose as source-level summary intents when the selected source contains relevant sections.

#### Scenario: Reviewer asks for main requirements
- **WHEN** the selected assessment source contains requirements or assignment instructions and the reviewer asks `What are the main requirements in this source?`
- **THEN** the answer SHALL summarize the main requirements using the selected source and SHALL NOT return generic insufficient-evidence copy.

#### Scenario: Reviewer asks for deliverables
- **WHEN** the selected assessment source contains deliverable expectations and the reviewer asks `What deliverables does this source request?`
- **THEN** the answer SHALL identify the requested deliverables using the selected source and SHALL NOT return generic insufficient-evidence copy.

### Requirement: Grounding remains strict for unsupported or specific low-evidence claims
The system SHALL preserve unsupported and insufficient-evidence states when a question asks outside the selected source or asks for a specific claim that retrieved evidence does not support.

#### Scenario: Outside-source question is asked
- **WHEN** the reviewer asks for current external facts, private information, or facts not present in the selected source
- **THEN** the system SHALL refuse or mark the answer unsupported without model fabrication or citations.

#### Scenario: Specific low-coverage claim is asked
- **WHEN** the reviewer asks a precise question whose answer is not supported by retrieved evidence
- **THEN** the system SHALL return concise insufficient-evidence guidance and suggest a more source-specific or overview question.

### Requirement: Citation behavior matches answer state
The system SHALL show citations only when retrieved excerpts support the answer and SHALL keep source overview answers honest when precise answer-specific citations are unavailable.

#### Scenario: Grounded answer has support
- **WHEN** the answer is grounded in retrieved chunks
- **THEN** citations SHALL reference retrieved excerpts that validate the answer text.

#### Scenario: Full-document overview has no precise citation
- **WHEN** a source-level overview answer is useful but not tied to a single precise excerpt
- **THEN** the answer SHALL clearly indicate overview status and SHALL NOT fabricate answer-specific citations.
