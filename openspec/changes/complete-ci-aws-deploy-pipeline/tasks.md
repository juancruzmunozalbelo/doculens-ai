## 1. Restore Current CI Baseline

- [x] 1.1 Reproduce and fix the failing `npm run test:unit` MiniMax live-call budget contract.
- [x] 1.2 Confirm existing CI commands `npm run test:unit`, `npm run verify`, and `npm run test:aws` pass locally.
- [x] 1.3 Add or adjust focused tests for the unit failure before changing workflow coverage.

## 2. Required CI Quality Gates

- [x] 2.1 Split `.github/workflows/ci.yml` into named jobs for build, unit contracts, verification contracts, integration contracts, AWS static validation, and AWS container build smoke.
- [x] 2.2 Add a CI build gate that runs `npm run build` with `npm ci` dependencies.
- [x] 2.3 Add a CI integration gate that runs `npm run test:integration` and preserves explicit skip output for unavailable live PostgreSQL checks.
- [x] 2.4 Add pinned Terraform tooling and make `terraform fmt -check`, `terraform init -backend=false`, and `terraform validate` hard AWS static validation steps.
- [x] 2.5 Add a pull-request AWS container smoke that builds `Dockerfile.aws` without pushing and verifies minimal runtime packaging.
- [x] 2.6 Ensure all validation workflows that install Node dependencies use `npm ci` instead of `npm install`.
- [x] 2.7 Document and verify the `main` branch ruleset required check names, stale-check behavior, and administrator policy for every merge-blocking job.

## 3. Extended Quality Gates

- [x] 3.1 Add or update manual/scheduled workflow coverage for Playwright E2E with Chromium prerequisites.
- [x] 3.2 Add or update manual/scheduled workflow coverage for eval regressions.
- [x] 3.3 Add or update manual/scheduled workflow coverage for Docker Compose contract checks.
- [x] 3.4 Add or update manual/scheduled workflow coverage for full MarkItDown smoke checks.
- [x] 3.5 Update mutation workflow dependency installation to use `npm ci` and keep report upload behavior.

## 4. AWS Operator Prerequisites and OIDC

- [x] 4.1 Record the canonical `aws-demo` account id, region, ECR repository, Terraform backend bucket/table/key, deploy role ARN, rollback role ARN, and external populated secret ARNs.
- [x] 4.2 Document or validate GitHub `aws-demo` environment required reviewers and allowed deployment branches.
- [x] 4.3 Constrain AWS deploy and rollback role trust policies to `aud=sts.amazonaws.com` and the exact repository plus approved refs or protected environment subjects.
- [x] 4.4 Confirm deploy and rollback roles are separate least-privilege roles with only required permissions.

## 5. AWS Image Release

- [x] 5.1 Add an AWS release job or workflow that assumes the constrained AWS deploy role through GitHub OIDC.
- [x] 5.2 Add ECR login, `Dockerfile.aws` build, commit-SHA image tag, OCI source revision label, push, and digest capture steps.
- [x] 5.3 Wire the captured image digest into the default deploy path through same-run output, `workflow_call`, or signed artifact for the same commit SHA.
- [x] 5.4 Reject or isolate manual digest deployment as break-glass and validate repository ownership plus source-revision provenance when used.
- [x] 5.5 Fail release before Terraform planning if image build, push, or provenance validation fails.

## 6. Terraform State and Deploy Guardrails

- [x] 6.1 Add Terraform remote backend configuration or documented backend partial configuration for the AWS demo stack.
- [x] 6.2 Document required backend bootstrap resources and GitHub environment variables.
- [x] 6.3 Update deploy workflow Terraform init/plan/apply steps to use remote state and locking.
- [x] 6.4 Add deploy workflow checks for expected AWS account, region, role identity, and bounded demo capacity.
- [x] 6.5 Verify `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY` with `secretsmanager:GetSecretValue` against the final external ARNs without printing payloads.
- [x] 6.6 Split deploy into plan and apply stages that preserve the binary plan and redacted summary, gate apply on protected environment approval, and apply the exact reviewed plan.
- [x] 6.7 Run ALB `/health` smoke after apply and fail deploy on unhealthy service.

## 7. Rollback and Cleanup Operations

- [x] 7.1 Correct rollback workflow input description and validation to accept ECS task definition ARN or `family:revision` only.
- [x] 7.2 Reject raw image URI rollback inputs unless image-based rollback registration is implemented.
- [x] 7.3 Verify rollback waits for ECS service stability, checks completed rollout state and desired running count, and runs ALB health validation.
- [x] 7.4 Add or document a destroy path that uses the same remote Terraform state and AWS context guard.

## 8. Documentation and Verification

- [x] 8.1 Update README command and CI/CD sections to distinguish required, manual, and scheduled quality gates.
- [x] 8.2 Update `infra/aws/README.md` with GitHub Actions release/deploy, remote state, secret readiness, branch/environment protection, rollback, and cleanup instructions.
- [x] 8.3 Run the required CI commands locally after workflow changes where possible.
- [x] 8.4 Validate workflow syntax with `actionlint` or an equivalent GitHub Actions linter.
- [x] 8.5 Record any AWS-only verification that cannot be run locally, including required environment variables, ruleset evidence, environment protection evidence, and expected operator steps.
