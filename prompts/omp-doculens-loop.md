# OMP Loop Prompt - DocuLens AI

Use this prompt from the repository root to start the implementation loop for `build-doculens-ai-assessment`.

```txt
You are implementing the OpenSpec change `build-doculens-ai-assessment` in the public GitHub repo `juancruzmunozalbelo/doculens-ai`.

Hard constraints:
- This repo is public. Never commit secrets, `.env`, Terraform state/plans, API keys, JWT secrets, DB passwords, AWS credentials, raw sensitive documents, or local harness folders.
- Follow the OpenSpec artifacts exactly: `proposal.md`, `design.md`, `tasks.md`, and all specs under `openspec/changes/build-doculens-ai-assessment/specs/`.
- Keep RAG-first chat. Normal chat answers must be grounded in retrieved chunks and cite valid retrieved chunk IDs.
- Use MiniMax M3 through `MiniMaxProvider` for live AI proof. Do not replace the live provider with a mock as final proof.
- Use PostgreSQL as the canonical persistence target for local dev, tests/evals, and AWS RDS. Do not introduce SQLite drift.
- Use pgvector or hybrid retrieval as the preferred target. Use `lexical_fallback` only if embeddings/provider credentials block implementation, and label it explicitly in metadata/eval/README.
- Keep AWS tiny: ECS Fargate + ALB + RDS PostgreSQL + Secrets Manager + CloudWatch with bounded demo defaults. Do not build production theater.
- Do not claim unimplemented behavior in README or PR descriptions.

Repository guardrails:
- `main` is protected and requires the `guardrails` status check.
- Local hook path should be `.githooks`.
- Run `git config core.hooksPath .githooks` if the local clone has not enabled hooks.
- The TDD guardrail blocks implementation changes without unit/integration/eval/E2E/smoke companions.

Required startup checks:
1. Run `git status -sb` and confirm the workspace is clean.
2. Run `openspec validate --changes build-doculens-ai-assessment`.
3. Run `node --test scripts/guardrails/check-tdd.test.mjs`.
4. Read:
   - `README.md`
   - `openspec/changes/build-doculens-ai-assessment/proposal.md`
   - `openspec/changes/build-doculens-ai-assessment/design.md`
   - `openspec/changes/build-doculens-ai-assessment/tasks.md`
   - all specs under `openspec/changes/build-doculens-ai-assessment/specs/`

Delivery model:
- Work PR by PR using the PR sequence in `design.md` decision 14 and `tasks.md` section 11.
- Do not implement the whole project on one branch.
- Do not skip PRs silently.
- Do not open schema-only, interface-only, type-only, UI skeleton-only, Terraform-variable-only, or README-claim-only PRs unless the PR also includes behavior and verification.

PR sequence:
0. Done: `main` - TDD guardrails, CI, branch protection.
1. `feat/doculens-foundation` - app scaffold, PostgreSQL contract, env/secrets contract, schema, migrations, seed, test scripts.
2. `feat/doculens-auth` - auth, JWT middleware, owner-scoped documents, child-resource authz, seeded users/documents.
3. `feat/doculens-ingestion` - Markdown normalization, section-aware chunking, chunk persistence, PostgreSQL integrity.
4. `feat/doculens-retrieval` - `RetrievalProvider`, pgvector/hybrid preferred retrieval, labeled lexical fallback only if blocked, coverage/fallback metadata.
5. `feat/doculens-minimax` - `AIProvider`, `MiniMaxProvider`, prompt versions, prompt safety, redaction, live-call budget gates.
6. `feat/doculens-chat-api` - full-document analysis, RAG chat, citations, unsupported answers, fallback path, prompt-injection resistance.
7. `feat/doculens-ui` - login, document input, analysis/chat views, citations, retrieved chunks, AI metadata, Playwright `data-testid` flow.
8. `feat/doculens-eval` - eval runner and security/reliability proof gaps.
9. `feat/doculens-markitdown` - MarkItDown sample conversion script and smoke check.
10. `feat/doculens-aws-demo` - Docker/container path, ALB health, Terraform ECS/RDS/Secrets/CloudWatch, bounded defaults, destroy guidance.
11. `docs/doculens-final-readme` - final README, verification evidence, production gaps, data/cost/rate/AWS/MiniMax disclosures.

TDD loop for every behavior:
1. Ask a Tester subagent to write or update the smallest high-signal failing test/eval/E2E/smoke check for the next behavior.
2. Run the targeted check and observe red. Keep the output as evidence.
3. Implement the smallest code/config/schema needed to pass.
4. Run the targeted check and observe green.
5. Refactor only while keeping the check green.
6. Run the PR's relevant wider check.
7. Commit test + implementation together as a coherent green behavior.

Commit rules:
- One commit = one behavior or one proof.
- Commit only green slices.
- Test-only commits are allowed.
- Implementation-only commits are not allowed.
- No WIP commits.
- No unrelated formatting.
- No skipped tests to make the PR green.

Subagent strategy:
- Use a dedicated Tester agent for tests. Tester writes tests/evals/E2E/smoke checks before implementation.
- Use implementation agents by subsystem only after contracts are clear.
- Use reviewer/security/infra agents for targeted review before PR finalization.
- Agents must skip project-wide formatters and full test suites; run targeted checks only. The main loop runs final relevant checks once.
- Agents must not all touch the same files at the same time. Coordinate through IRC before editing shared files.

Git worktree strategy for subagents:
- Use git worktrees for parallel subagent implementation, not multiple agents mutating the same checkout.
- Keep the main checkout clean and reserved for orchestration, PR creation, validation, and final merge.
- Create one worktree per active PR branch or isolated subsystem spike.
- Suggested layout from the parent directory:
  - `../doculens-main` or the current repo checkout: orchestration only.
  - `../doculens-foundation`: `feat/doculens-foundation`.
  - `../doculens-auth`: `feat/doculens-auth` only after foundation contracts are stable.
  - `../doculens-ingestion`: `feat/doculens-ingestion` only after schema/document contracts are stable.
- Before assigning a writing subagent, give it an exact worktree path and branch. The subagent must run `git status -sb` inside that worktree before editing.
- A subagent must not edit files outside its assigned worktree.
- Do not run two worktrees that modify the same shared contract files unless the agents coordinate first and one branch explicitly rebases onto the other.
- After a PR merges, remove its worktree with `git worktree remove <path>` and prune stale metadata with `git worktree prune`.

Recommended agents by PR:
- PR 1 Foundation: Foundation Agent + Tester.
- PR 2 Auth: Auth/Data Agent + Tester + Security Reviewer.
- PR 3 Ingestion: Ingestion/DB Agent + Tester.
- PR 4 Retrieval: RAG/Retrieval Agent + Tester.
- PR 5 MiniMax: MiniMax/Safety Agent + Tester + Security Reviewer.
- PR 6 Chat API: Chat/Citation Agent + Tester + Security Reviewer.
- PR 7 Frontend: Frontend/E2E Agent + Tester.
- PR 8 Eval: Eval/Reliability Agent + Tester + Security Reviewer.
- PR 9 MarkItDown: MarkItDown Agent + Tester.
- PR 10 AWS: Infra Agent + Security Reviewer.
- PR 11 Final README: Docs/Verification Agent + Reviewer.

Shared-file collision rules:
- Only one agent edits package scripts at a time.
- Only one agent edits DB schema/migrations at a time.
- Only one agent edits auth middleware/current-user context at a time.
- Only one agent edits chat endpoint/provider contracts at a time.
- Only one agent edits final README at a time.
- If two agents overlap, pause one and coordinate via IRC.

Per-PR completion gate:
- `openspec validate --changes build-doculens-ai-assessment` passes.
- `node --test scripts/guardrails/check-tdd.test.mjs` passes.
- `.githooks/pre-commit` passes after staging.
- Targeted tests for the PR pass.
- Relevant wider checks for the PR pass.
- No secrets in diff.
- README/docs only claim observed behavior.
- PR description includes what changed, why, how to test, risks/trade-offs, and exact verification output.

PR workflow:
1. Start from clean `main` in the orchestration checkout.
2. Pull latest `main` with `git pull --ff-only`.
3. Create a worktree for the next PR branch, for example `git worktree add ../doculens-foundation -b feat/doculens-foundation main`.
4. Assign subagents to the PR worktree path, not to the orchestration checkout.
5. Implement only that PR's scope inside the worktree.
6. Run targeted checks in the worktree.
7. Stage and run `.githooks/pre-commit` in the worktree.
8. Commit coherent green slices in the worktree.
9. Push the PR branch from the worktree.
10. Open PR with verification evidence from that worktree.
11. Wait for `guardrails` status check.
12. Do not merge until checks pass and review findings are addressed.
13. Merge with a coherent commit history or squash if the branch history contains local TDD noise.
14. Return to the orchestration checkout, pull latest `main`, remove the merged worktree, and prune worktree metadata.

Do not optimize away these scoring areas:
- owner-scoped authorization
- child-resource authorization
- retrieval backend metadata
- citation validation
- unsupported-answer behavior
- prompt-injection eval
- MiniMax budget/rate gates
- redaction canaries
- PostgreSQL integrity tests
- Playwright canonical `data-testid` flow
- Terraform validation and destroy guidance

First action:
Start PR 1 on `feat/doculens-foundation`. Use Tester first. Build the smallest foundation slice that proves local commands, PostgreSQL contract, env/secrets contract, schema/migration/seed, and test scripts without implementing auth/RAG/MiniMax/UI/AWS yet.
```

## Minimal first command sequence

```bash
git checkout main
git pull --ff-only
git config core.hooksPath .githooks
openspec validate --changes build-doculens-ai-assessment
node --test scripts/guardrails/check-tdd.test.mjs
git worktree add ../doculens-foundation -b feat/doculens-foundation main
cd ../doculens-foundation
git config core.hooksPath .githooks
```

Then paste the loop prompt above into OMP and start PR 1.
