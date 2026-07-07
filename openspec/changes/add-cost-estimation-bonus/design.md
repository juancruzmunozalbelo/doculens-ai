## Context

DocuLens already estimates prompt token size with a simple character-based heuristic, enforces MiniMax live-call budget limits before transport invocation, and exposes default server caps for calls, input/output/context tokens, retries, concurrency, and estimated cost. The assessment bonus asks for cost estimation at request-volume tiers, but the repo currently stops at implementation guardrails and wiki/README cost references rather than a concrete 1k/10k/100k AI usage model.

Current constraints:
- The app uses MiniMax M3 through `AIProvider`; the provider request body is a normal chat-completions call, not streaming or tool/function calling.
- Existing token estimates are approximate and suitable for planning/budgeting, not billing reconciliation.
- Provider prices can change outside the repo; the delivered estimate must state the date/source or configurable assumption used.
- The current README points to wiki documentation, but repo-local verification should not depend on private or remote wiki availability.
- Avoid introducing live pricing lookups, external dependencies, or paid calls just to document costs.

## Goals / Non-Goals

**Goals:**
- Add a reviewer-readable bonus section for AI cost estimation at 1k, 10k, and 100k requests.
- Model at least the current chat path and full-document analysis path, or a clearly documented request mix that includes both.
- Show formulas, units, pricing assumptions, average input/output token assumptions, total token projections, estimated cost per tier, and caveats.
- Tie the documentation back to existing budget controls so the cost estimate matches implementation constraints.
- Add deterministic verification that the cost-estimation content exists and remains internally coherent.

**Non-Goals:**
- Do not claim exact billing or guarantee future MiniMax pricing.
- Do not fetch provider prices at runtime or in tests.
- Do not add a new cost-tracking database table, usage ledger, telemetry pipeline, queue, worker, or billing dashboard.
- Do not implement token streaming, LLM tool/function calling, or new provider APIs.
- Do not broaden this change into AWS infrastructure cost modeling beyond a short pointer if existing deployment docs already cover it.

## Decisions

### 1. Use a static, dated pricing assumption instead of a live pricing lookup

The estimate should include explicit input/output price assumptions and the date/source used to produce them. Tests should validate that a source/date/assumption exists, not that a remote price remains stable.

Rationale: a live pricing call adds network flakiness and can fail unrelated builds. A static assumption is reviewable and reproducible.

Alternatives considered:
- Fetch provider pricing during verification: rejected because pricing pages/APIs are external, mutable, and not required for app behavior.
- Avoid prices and show only token totals: rejected because the bonus explicitly asks for cost estimation.

### 2. Document formulas and request tiers, not hidden spreadsheet math

The section should show the formula in plain text, then a table for 1k, 10k, and 100k requests. Required columns should include request tier, average input tokens/request, average output tokens/request, total input tokens, total output tokens, and estimated provider cost.

Rationale: reviewers can audit the assumptions without running code or opening a spreadsheet.

Alternatives considered:
- Commit a spreadsheet or image: rejected because it is harder to diff and test.
- Only mention `maxEstimatedCostUsd`: rejected because a budget cap is not a request-volume estimate.

### 3. Keep estimates scenario-based

The documentation should distinguish cheap RAG chat from more expensive full-document analysis, or define an explicit blended mix such as one analysis plus several chat questions. The chosen model must not imply all requests have the same token profile unless that is stated as a simplifying assumption.

Rationale: DocuLens has two materially different LLM paths, and combining them silently would mislead reviewers.

Alternatives considered:
- Use only the default max token caps: too pessimistic for normal chat and not representative of expected usage.
- Use only observed test fixture tokens: deterministic, but can understate production documents unless caveated.

### 4. Verify content shape and arithmetic deterministically

A focused test or verification script should parse the docs section and assert that the tiers, formula inputs, assumptions, units, and caveats are present. If arithmetic is kept in prose/table, either calculate it from constants in the test or assert a stable expected table.

Rationale: executable documentation prevents the bonus section from drifting or being deleted during future README/wiki edits.

Alternatives considered:
- Manual review only: rejected because the repo already uses contract tests for documentation and delivery claims.

## Risks / Trade-offs

- [Risk] Provider pricing changes after the estimate is written. → Mitigation: include the pricing date/source and label estimates as planning assumptions.
- [Risk] Token estimates differ from provider billing tokenization. → Mitigation: state that the repo heuristic is approximate and budget-oriented; prefer conservative averages.
- [Risk] A single blended estimate hides path differences. → Mitigation: show separate chat/analysis scenarios or explicitly disclose the mix.
- [Risk] The section becomes marketing copy instead of evidence. → Mitigation: verify tiers, formula, units, and assumptions with deterministic tests.
