## ADDED Requirements

### Requirement: Pull request CI quality gates
The system SHALL run merge-blocking GitHub Actions quality gates that install dependencies from the lockfile, build the application, run unit contracts, run TDD/foundation verification, run integration contracts, and run AWS/Terraform static validation.

#### Scenario: Pull request opens against main
- **WHEN** a pull request targets `main`
- **THEN** GitHub Actions MUST run separate required checks for dependency install/build, unit contracts, verification contracts, integration contracts, and AWS static validation

#### Scenario: Required check fails
- **WHEN** any required quality gate exits non-zero
- **THEN** the pull request MUST be blocked from merge by its failed required check

#### Scenario: Required check passes
- **WHEN** all required quality gates exit successfully
- **THEN** the pull request MUST expose passing checks that identify each completed stage by name

### Requirement: GitHub branch rules enforce required checks
The system SHALL define and verify repository branch protection or ruleset settings that require the merge-blocking CI checks on `main`.

#### Scenario: Required workflow jobs are renamed or added
- **WHEN** CI job names change or new required jobs are introduced
- **THEN** the repository ruleset documentation and verification evidence MUST list the exact required check names

#### Scenario: Pull request has stale or missing required checks
- **WHEN** a pull request does not have current passing results for every required check
- **THEN** GitHub branch protection or rulesets MUST prevent merge

#### Scenario: Ruleset cannot be changed by code
- **WHEN** repository settings must be applied outside the repository
- **THEN** the implementation MUST document the owner, required settings, and verification evidence needed before the change is complete

### Requirement: Build validation
The system SHALL validate that the deployable application builds successfully in CI before code can merge.

#### Scenario: Frontend or API build breaks
- **WHEN** `npm run build` exits non-zero in CI
- **THEN** the build quality gate MUST fail and prevent merge

#### Scenario: Build succeeds
- **WHEN** `npm run build` exits successfully in CI
- **THEN** the build quality gate MUST pass independently of test job results

### Requirement: AWS container build smoke
The system SHALL validate the AWS deploy container build in pull request CI before release workflows can depend on it.

#### Scenario: AWS Dockerfile changes
- **WHEN** `Dockerfile.aws`, package manifests, server runtime files, web build files, MarkItDown packaging, or AWS deployment packaging changes
- **THEN** CI MUST build `Dockerfile.aws` without pushing the image

#### Scenario: AWS container smoke fails
- **WHEN** the AWS image cannot build or a minimal in-image runtime smoke fails
- **THEN** the AWS container build quality gate MUST fail and prevent merge

### Requirement: Integration validation
The system SHALL run integration contract checks in CI so API/authz/document behavior is validated before merge.

#### Scenario: Integration contract fails
- **WHEN** `npm run test:integration` exits non-zero in CI
- **THEN** the integration quality gate MUST fail and prevent merge

#### Scenario: Live database checks are not configured
- **WHEN** live PostgreSQL credentials are unavailable for CI
- **THEN** integration tests MUST still run deterministic non-live contract coverage and explicitly report any skipped live database coverage

### Requirement: Optional extended quality gates
The system SHALL provide slower or environment-heavy quality gates for E2E, eval, Docker, MarkItDown, and mutation coverage without making them ambiguous substitutes for required CI.

#### Scenario: Extended suite is manually dispatched
- **WHEN** an operator starts an extended quality workflow
- **THEN** the selected suite MUST install its prerequisites, run the corresponding repository command, and upload relevant reports or artifacts when available

#### Scenario: Extended suite runs on schedule
- **WHEN** a scheduled extended quality workflow runs
- **THEN** failures MUST be visible as workflow failures with the suite name identifying the failed quality area

#### Scenario: Required CI completes without extended suites
- **WHEN** a pull request only runs required fast quality gates
- **THEN** the checks MUST NOT imply that E2E, eval, Docker, MarkItDown, or mutation coverage ran unless those suites actually executed

### Requirement: Deterministic dependency installation
The system SHALL use lockfile-respecting dependency installation in CI workflows that validate or release repository code.

#### Scenario: CI installs Node dependencies
- **WHEN** a GitHub Actions workflow installs dependencies for validation or release
- **THEN** it MUST use `npm ci` instead of `npm install`

#### Scenario: Mutation workflow installs dependencies
- **WHEN** mutation testing runs in GitHub Actions
- **THEN** it MUST install dependencies from the lockfile before executing mutation commands
