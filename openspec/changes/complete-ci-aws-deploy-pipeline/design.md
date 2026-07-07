## Context

The repository currently has GitHub Actions for CI, TDD guardrails, manual mutation runs, manual AWS deploy, and manual AWS rollback. The main CI workflow runs `npm run test:unit`, `npm run verify`, and `npm run test:aws`; repository scripts and docs also expose build, integration, E2E, eval, Docker, and MarkItDown checks that are not part of required CI. The AWS deploy workflow applies Terraform from a clean GitHub runner using a manually supplied `image_uri`; Terraform has no remote backend, and the documented image build/push and secret population steps remain operator-managed.

The implementation should convert this into a boring, auditable pipeline: required checks prove the deployable artifact, Actions build and publish the image, Terraform uses shared remote state, and deploy/rollback operations have explicit inputs and guardrails.

## Goals / Non-Goals

**Goals:**
- Make required CI cover the merge-blocking quality gates: dependency install, build, unit contracts, TDD/foundation verify, integration contracts, AWS/Terraform static validation, and an AWS container build smoke.
- Add separate optional/manual or scheduled coverage for slower suites: Playwright E2E, eval regressions, Docker Compose contract, full MarkItDown smoke, and mutation testing.
- Define the GitHub branch ruleset checks and `aws-demo` environment protections needed to make CI/deploy gates enforceable, not merely executable.
- Build `Dockerfile.aws` in GitHub Actions, push an immutable image digest to ECR, and bind the default deploy to that same release run and commit SHA.
- Feed the built image digest into Terraform so the deployed ECS task definition is tied to the reviewed commit.
- Use remote Terraform state with locking for the AWS demo stack.
- Validate AWS OIDC trust scope, account, region, cost bounds, Terraform format/validate, populated external Secrets Manager values, and ALB health during deploy.
- Make rollback target semantics exact and require service-stable plus health verification.

**Non-Goals:**
- Do not convert the demo AWS stack into production infrastructure.
- Do not add HTTPS, WAF, private subnet/NAT architecture, autoscaling, multi-AZ RDS, or full observability unless already required for the demo pipeline.
- Do not change application API behavior.
- Do not store secret payloads in Terraform state, repository files, workflow logs, or `.tfvars`.

## Decisions

1. **Treat GitHub protections as part of the deliverable.**
   - Decision: document and verify the exact `main` branch ruleset required check names, stale-status behavior, administrator policy, and `aws-demo` environment required reviewers before calling the pipeline complete.
   - Rationale: workflow jobs do not block merges or deploys unless repository protections reference them.
   - Alternative considered: only add workflow YAML. Rejected because checks can run while merges/deploys remain ungated.

2. **Split CI into named jobs instead of one serial `contracts` job.**
   - Decision: create explicit jobs for build, unit, verify, integration, AWS static validation, and AWS container build smoke; keep slower suites separate.
   - Rationale: separate checks make failures actionable and allow branch protection to require the right set.
   - Alternative considered: append every command to the existing job. Rejected because it hides which stage failed and couples fast checks to slower checks.

3. **Keep slow or environment-heavy suites non-blocking by default unless the repo already has required infrastructure.**
   - Decision: make full E2E, Docker Compose, eval, full MarkItDown, and mutation either path-based, scheduled, or manually dispatchable until runtime requirements are stable in CI.
   - Rationale: the immediate required tier should prove merge safety without making every PR depend on heavyweight suites.
   - Alternative considered: require all suites on every PR. Rejected because it risks noisy CI if Playwright, Docker Compose, MarkItDown, or eval prerequisites are not deterministic on GitHub-hosted runners.

4. **Publish AWS images from GitHub Actions using immutable digests bound to the release run.**
   - Decision: add an ECR login/build/push stage that tags by commit SHA, labels the OCI image with the source revision, captures the RepoDigest, and passes that digest to deploy via same-run output, `workflow_call`, or signed artifact.
   - Rationale: deploy must use the artifact built from the reviewed commit; mutable tags and local/manual digests break traceability.
   - Alternative considered: keep `image_uri` manual as the normal path. Rejected because it allows stale or locally built images to bypass CI provenance.

5. **Constrain AWS OIDC trust and environment approvals.**
   - Decision: require deploy and rollback roles with least-privilege policies and trust conditions for `aud=sts.amazonaws.com` plus repository/ref or protected environment subject constraints.
   - Rationale: short-lived credentials are not sufficient if any workflow/ref can assume the role.
   - Alternative considered: only configure `aws-actions/configure-aws-credentials`. Rejected because broad role trust still exposes AWS changes to unintended workflows.

6. **Use Terraform remote state and locking before treating Actions deploy as authoritative.**
   - Decision: configure an S3 backend with DynamoDB lock table, or an equivalent managed backend, and document/bootstrap required backend resources.
   - Rationale: GitHub runners are ephemeral; local state cannot support repeatable plan/apply/destroy.
   - Alternative considered: upload local state as an artifact. Rejected because it is fragile, unsafe for sensitive metadata, and lacks proper locking.

7. **Require pre-populated external secret ARNs for automated service deploy.**
   - Decision: automated deploy uses externally managed `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY` ARNs and verifies `GetSecretValue` succeeds for `AWSCURRENT` without printing payloads before service apply. Creating empty Terraform secret containers remains a manual/bootstrap mode, not the default automated deploy path.
   - Rationale: first-run Terraform-created empty containers cannot satisfy pre-apply secret readiness.
   - Alternative considered: accept existing ARNs or empty stack-created containers. Rejected because ARNs can exist without usable values and ECS would fail after apply.

8. **Rollback should target healthy ECS task definitions, not ambiguous image strings.**
   - Decision: make the rollback workflow accept task definition ARN/family:revision only unless image-based rollback registers a replacement task definition explicitly; rollback success requires ECS service stability and ALB health.
   - Rationale: `aws ecs update-service --task-definition` does not accept raw image URIs, and `describe-services` alone does not prove the rollback became healthy.
   - Alternative considered: keep the current input wording and describe-only verification. Rejected because it invites operator error and false-positive rollback success.

## Risks / Trade-offs

- [Risk] Remote backend resources may not exist in a fresh AWS account. → Mitigation: provide a bootstrap document or separate guarded bootstrap workflow; do not make the deploy workflow silently create backend resources with local state.
- [Risk] Adding all checks as required could slow PR feedback. → Mitigation: define a fast required tier and slower scheduled/manual tier; promote checks to required only after they are deterministic.
- [Risk] Secret readiness validation can leak values if implemented carelessly. → Mitigation: validate with `GetSecretValue` status only; never echo secret payloads.
- [Risk] A broad OIDC trust policy can let unintended workflows assume AWS roles. → Mitigation: bind trust to this repository plus approved refs/protected environment subjects and use separate least-privilege deploy/rollback roles.
- [Risk] ECR repository creation may be split between Terraform and workflow setup. → Mitigation: choose one owner; prefer Terraform/bootstrap for repository creation and Actions for login/build/push.
- [Risk] Applying Terraform from Actions can incur AWS cost. → Mitigation: keep environment approval, account guard, region guard, bounded capacity assertions, plan review, and explicit destroy/cleanup instructions.

## Migration Plan

1. Fix currently failing `npm run test:unit` so existing CI is green before expanding required checks.
2. Record operator prerequisites: AWS account id, region, ECR repository, Terraform backend bucket/table/key, deploy/rollback role ARNs, secret ARNs, branch ruleset owner, and `aws-demo` environment reviewer policy.
3. Add CI jobs for build, unit, verify, integration, AWS static validation, and AWS container build smoke; keep slower suites manual/scheduled first.
4. Add Terraform `fmt`/`validate` checks with pinned Terraform tooling before plan/apply.
5. Introduce Terraform remote backend configuration and document/backend bootstrap prerequisites.
6. Add or configure ECR repository and GitHub environment variables for account, region, roles, ECR repository, backend, and secret ARNs.
7. Add Actions image build/push and deploy using the same release run's image digest.
8. Split deploy into plan and apply stages: upload a redacted plan summary/binary plan, gate apply on protected environment approval, then apply the exact reviewed plan.
9. Add pre-apply `GetSecretValue` readiness checks and post-apply ALB health smoke.
10. Correct rollback workflow target semantics, wait for ECS service stability, and run health verification.
11. Update README and `infra/aws/README.md` to describe CI tiers, branch/environment protections, release/deploy flow, rollback, and cleanup.

## Operator Prerequisites

- Canonical `aws-demo` account id, region, ECR repository, Terraform backend bucket/table/key, deploy role ARN, rollback role ARN, and external populated secret ARNs must be supplied before implementing AWS deploy automation.
- Repository ruleset ownership must be identified so required check names can be enforced after workflow changes.
- `aws-demo` GitHub environment required reviewers and allowed deployment branches must be configured before deploy/rollback workflows are considered safe.
