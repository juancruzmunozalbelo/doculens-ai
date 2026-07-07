## Why

The assessment bonus asks for cost estimation at 1k, 10k, and 100k requests, and the repo already has the raw ingredients: MiniMax token estimates, live-call budgets, concurrency limits, and budget-gate tests. This change turns those controls into reviewer-readable cost evidence without claiming exact billing or adding new provider behavior.

## What Changes

- Add a documented AI usage and cost-estimation section that models 1k, 10k, and 100k request volumes for the current DocuLens analysis/chat paths.
- Define explicit assumptions for provider pricing, average input/output tokens, request mix, retries, cache/miss behavior if any, and per-run budget limits.
- Reuse the existing token-estimation and budget-gate concepts rather than adding a second cost model beside the implementation.
- Add deterministic verification that the cost-estimation artifact includes all required request tiers, formulas, units, assumptions, and caveats.
- Keep the scope to cost estimation and docs/tests; do not implement token streaming, LLM tool/function calling, queues/workers, or provider-side pricing fetches.

## Capabilities

### New Capabilities
- `ai-usage-cost-estimation`: Covers reviewer-readable AI request-volume cost estimates, model/pricing assumptions, token/request formulas, budget guardrail alignment, and verification for 1k/10k/100k request tiers.

### Modified Capabilities
- None. There are no mainline `openspec/specs` capabilities yet; this proposal introduces a repo-local capability spec for the bonus section.

## Impact

- Affected docs: README or linked delivery documentation that summarizes bonus coverage and includes the 1k/10k/100k estimate table.
- Affected scripts/tests: existing verification/eval coverage may gain a focused contract that validates the cost-estimation section shape and assumptions.
- Affected implementation references: `apps/api/src/server/ai/minimax-provider.mjs` token/budget fields and `apps/api/src/server/index.mjs` default MiniMax budget are source inputs for the documentation, not rewritten unless a small export/helper is needed for testability.
- Non-goals: no live pricing API lookup, no new paid provider calls, no background queue, no streaming response transport, and no tool/function-calling implementation.
