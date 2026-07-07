## 1. Cost Model Contract

- [x] 1.1 Choose and document the MiniMax M3 pricing assumptions, currency, date/source, and input/output unit basis used by the estimate.
- [x] 1.2 Define representative request scenarios for chat, full-document analysis, or an explicit blended analysis/chat mix.
- [x] 1.3 Define the cost formula for input tokens, output tokens, total request tier volume, and estimated provider cost.
- [x] 1.4 Decide where the repo-local bonus section lives so verification does not depend on remote wiki availability.

## 2. Documentation Implementation

- [x] 2.1 Add the cost-estimation section with 1k, 10k, and 100k request tiers.
- [x] 2.2 Include average input tokens, average output tokens, total input tokens, total output tokens, and estimated cost for every tier.
- [x] 2.3 Include model, pricing date/source, formula, request-mix assumptions, and approximation caveats.
- [x] 2.4 Reference existing budget guardrails: live-call cap, input/output/context token caps, timeout/retry cap, concurrency cap, and max estimated-cost gate.
- [x] 2.5 State that over-budget requests fail closed before MiniMax transport invocation.

## 3. Verification

- [x] 3.1 Add a deterministic documentation contract test or verification check for required tiers, formulas, units, assumptions, caveats, and budget-guardrail references.
- [x] 3.2 Ensure the verification path does not call MiniMax, fetch live pricing, require cloud credentials, or depend on remote wiki content.
- [x] 3.3 Run the targeted documentation/verification test.
- [x] 3.4 Run any affected existing documentation, eval, or unit-contract command.

## 4. Handoff

- [x] 4.1 Summarize the implemented bonus coverage and explicitly note that streaming, tool/function calling, and queue/worker processing remain out of scope.
- [x] 4.2 Capture final verification commands and outputs for review.
