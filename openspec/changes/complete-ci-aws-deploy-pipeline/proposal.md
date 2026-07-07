## Why

The current GitHub Actions setup does not prove the full documented test surface before merge, and the AWS deploy path still depends on manually built images plus ephemeral Terraform state. This change closes the CI/CD gap so the tested commit is the deployed artifact and AWS operations are reproducible from GitHub Actions.

## What Changes

- Expand required CI coverage from unit/verify/AWS static checks to a fast merge-blocking tier: build, unit contracts, verification contracts, integration contracts, AWS/Terraform static validation, and an AWS container build smoke; keep E2E, eval, Docker Compose, MarkItDown, and mutation as explicit extended manual/scheduled gates until promoted.
- Add an AWS image release path that builds `Dockerfile.aws` in GitHub Actions, pushes an immutable image digest to ECR, and feeds that digest into Terraform deploy.
- Add Terraform remote state and locking for the demo AWS stack so repeated deploys, updates, and cleanup use a shared source of truth instead of runner-local state.
- Make AWS deploy validate Terraform formatting/configuration, guard account/region/cost context, verify required Secrets Manager values or external ARNs before apply, apply the reviewed plan, and smoke-test the ALB health endpoint.
- Add GitHub branch ruleset and environment-protection requirements so new checks and deploy approvals are actually enforced outside workflow YAML.
- Correct rollback semantics so the workflow accepts a reviewed ECS task definition target, or explicitly registers a new task definition when image-based rollback is supported.
- Keep production gaps explicit; this remains a bounded demo deploy, not a production hardening effort.

## Capabilities

### New Capabilities
- `ci-quality-gates`: Required and optional GitHub Actions quality gates for build, tests, E2E, eval, Docker, mutation, and smoke checks.
- `aws-deployment-pipeline`: GitHub Actions AWS release/deploy/rollback behavior, including ECR image publication, Terraform state, secret readiness checks, environment approval, apply, smoke, and cleanup expectations.

### Modified Capabilities

## Impact

- `.github/workflows/ci.yml`, `.github/workflows/aws-deploy.yml`, `.github/workflows/aws-rollback.yml`, `.github/workflows/mutation.yml`, and any new workflow files needed for release/deploy separation.
- `infra/aws/versions.tf`, Terraform backend/bootstrap documentation, and variables passed by workflows.
- AWS GitHub environment variables/secrets for OIDC role ARNs, ECR repository, Terraform backend, secret ARNs, account guard, and region.
- README and `infra/aws/README.md` deployment instructions.
- No application API behavior changes are intended.
