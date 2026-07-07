## ADDED Requirements

### Requirement: Request-volume AI cost estimates
The system SHALL provide a reviewer-readable AI usage cost-estimation section for the current MiniMax-backed DocuLens workflow.

#### Scenario: Required request tiers are documented
- **WHEN** a reviewer reads the cost-estimation section
- **THEN** it SHALL include separate estimates for 1k, 10k, and 100k requests.

#### Scenario: Token totals are visible
- **WHEN** an estimate is shown for a request tier
- **THEN** it SHALL show average input tokens per request, average output tokens per request, total input tokens, and total output tokens with clear units.

#### Scenario: Provider cost is calculated
- **WHEN** token totals are shown
- **THEN** the section SHALL show the formula used to convert input/output tokens into estimated provider cost and SHALL include the final estimated cost for each request tier.

### Requirement: Assumptions and caveats are explicit
The system SHALL disclose the assumptions that make the estimate reproducible and safe to interpret.

#### Scenario: Pricing assumptions are stated
- **WHEN** provider pricing is used for cost estimation
- **THEN** the section SHALL state the model, input-token price, output-token price, currency, pricing date or source, and whether the prices are fixed assumptions rather than live billing data.

#### Scenario: Request mix is stated
- **WHEN** the estimate combines analysis and chat behavior
- **THEN** the section SHALL identify the request mix or SHALL present separate scenarios for chat and full-document analysis.

#### Scenario: Approximation limits are stated
- **WHEN** the cost estimate uses repo token-estimation heuristics or representative averages
- **THEN** the section SHALL state that actual provider billing can vary by tokenizer, document length, answer length, retries, provider pricing changes, and failed/unsupported requests.

### Requirement: Budget guardrails are connected to estimates
The system SHALL connect the cost-estimation section to existing live-call budget controls so reviewers can see how runaway cost is bounded.

#### Scenario: Existing guardrails are referenced
- **WHEN** the cost-estimation section describes risk controls
- **THEN** it SHALL reference live-call limits, input/output/context token limits, timeout/retry limits, concurrency limits, and max estimated-cost guardrails as implemented constraints.

#### Scenario: Over-budget behavior is described
- **WHEN** a request would exceed configured live-call or token budgets
- **THEN** the section SHALL state that the provider call fails closed before network transport instead of silently making an over-budget live call.

### Requirement: Cost-estimation documentation is verified
The system SHALL include deterministic verification that protects the bonus section from drift.

#### Scenario: Verification is run
- **WHEN** the targeted documentation or verification test runs
- **THEN** it SHALL fail if any required request tier, formula, pricing assumption, token unit, scenario/mix disclosure, caveat, or budget-guardrail reference is missing.

#### Scenario: Verification avoids live spend
- **WHEN** cost-estimation verification runs in local or CI environments
- **THEN** it SHALL NOT call MiniMax, fetch live pricing, require cloud credentials, or depend on remote wiki availability.
