## ADDED Requirements

### Requirement: Immutable AWS image release
The system SHALL build the AWS application container in GitHub Actions, publish it to the configured AWS container registry, and deploy an immutable image digest produced for the reviewed commit by the release workflow.

#### Scenario: Release workflow runs
- **WHEN** an authorized release workflow runs for a commit
- **THEN** GitHub Actions MUST build `Dockerfile.aws`, tag the image with the commit SHA, label the image with the source revision, push it to the configured registry, and capture the pushed image digest

#### Scenario: Default deploy consumes release artifact
- **WHEN** the default deploy workflow plans or applies an AWS deployment
- **THEN** the `image_uri` variable MUST come from the same release run's captured digest or a signed release artifact for the same commit SHA

#### Scenario: Manual digest override is used
- **WHEN** an operator uses a break-glass manual digest path
- **THEN** the workflow MUST validate that the digest belongs to the configured ECR repository and has source-revision evidence for the reviewed commit before deploy can proceed

#### Scenario: Image build fails
- **WHEN** the AWS container image cannot be built or pushed
- **THEN** the deployment MUST stop before Terraform plan or apply starts

### Requirement: AWS OIDC and environment approval
The system SHALL use least-privilege GitHub OIDC roles and protected GitHub environments for AWS deploy and rollback operations.

#### Scenario: Deploy workflow assumes AWS role
- **WHEN** a deploy workflow needs AWS credentials
- **THEN** it MUST assume the configured deploy role through GitHub OIDC and MUST NOT require long-lived AWS access keys in repository secrets

#### Scenario: OIDC trust is evaluated
- **WHEN** AWS IAM role trust is configured for GitHub Actions
- **THEN** the trust policy MUST bind `aud` to `sts.amazonaws.com` and `sub` to the exact repository plus approved refs or protected `aws-demo` environment subjects

#### Scenario: Protected deployment starts
- **WHEN** a workflow targets the `aws-demo` environment
- **THEN** GitHub environment protection MUST require approved reviewers and restrict allowed deployment branches before AWS resources are changed

#### Scenario: AWS context is unsafe
- **WHEN** the resolved AWS account, region, role, or caller identity does not match the expected demo context
- **THEN** the workflow MUST fail before Terraform apply or ECS rollback commands run

### Requirement: Terraform remote state and validation
The system SHALL use shared Terraform state with locking for AWS demo deploys and SHALL validate Terraform before applying changes.

#### Scenario: Deploy initializes Terraform
- **WHEN** the deploy workflow initializes Terraform
- **THEN** Terraform MUST use a configured remote backend with locking rather than runner-local state as the source of truth

#### Scenario: Terraform syntax or formatting is invalid
- **WHEN** Terraform `fmt -check` or `validate` fails
- **THEN** the deploy workflow MUST stop before plan or apply

#### Scenario: Repeated deploy runs
- **WHEN** the deploy workflow runs after a prior successful deployment
- **THEN** Terraform MUST read the existing remote state and plan an update or no-op instead of attempting to recreate already-managed resources from empty local state

### Requirement: Secret readiness without Terraform-managed secret payloads
The system SHALL keep application secret payloads out of Terraform state while proving required ECS secrets are populated before health validation.

#### Scenario: External secret ARNs are configured
- **WHEN** deploy uses externally managed Secrets Manager ARNs for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`
- **THEN** Terraform MUST bind ECS secrets to those ARNs without writing secret values into Terraform state

#### Scenario: Required secret value is missing or empty
- **WHEN** `secretsmanager:GetSecretValue` fails, returns no `AWSCURRENT` value, or resolves an empty value for any required secret ARN
- **THEN** the workflow MUST fail before applying service changes or before declaring deploy success

#### Scenario: Workflow logs secret readiness
- **WHEN** the workflow validates secret readiness
- **THEN** logs MUST report only presence/status and MUST NOT print secret payloads

### Requirement: Reviewed Terraform plan apply and health smoke
The system SHALL separate Terraform plan review from apply, apply only the reviewed plan, and verify the deployed ALB health endpoint after apply.

#### Scenario: Deploy plan succeeds
- **WHEN** Terraform creates a plan for AWS demo deploy
- **THEN** the workflow MUST preserve the exact binary plan and a redacted human-readable plan summary for review

#### Scenario: Apply starts
- **WHEN** Terraform apply runs
- **THEN** it MUST run after protected environment approval and apply the exact reviewed plan file rather than re-planning implicitly

#### Scenario: Health smoke fails
- **WHEN** the ALB `/health` endpoint does not return success after apply within the configured timeout
- **THEN** the deploy workflow MUST fail and surface enough resource identifiers for operator investigation without exposing secrets

### Requirement: Exact rollback target semantics
The system SHALL make rollback inputs match the actual ECS rollback behavior and SHALL prove rollback health before reporting success.

#### Scenario: Rollback uses task definition target
- **WHEN** an operator triggers rollback with an ECS task definition ARN or `family:revision`
- **THEN** the workflow MUST update the ECS service to that task definition, wait for service stability, verify the primary deployment completed, and run ALB health validation

#### Scenario: Operator supplies raw image URI to task-definition rollback
- **WHEN** rollback mode only supports task definitions and the operator supplies a raw image URI
- **THEN** the workflow MUST reject the input before calling `aws ecs update-service`

#### Scenario: Image-based rollback is supported
- **WHEN** a rollback workflow advertises support for image URI rollback
- **THEN** it MUST register a reviewed task definition revision using that image before updating the ECS service and before running service-stable plus health validation

### Requirement: AWS cleanup path
The system SHALL document and, where practical, automate safe cleanup for demo AWS resources that were created by the deploy pipeline.

#### Scenario: Demo resources need removal
- **WHEN** an operator wants to tear down the AWS demo stack
- **THEN** the repository MUST provide a documented or workflow-backed destroy path that uses the same remote Terraform state and account guard as deploy

#### Scenario: Destroy completes
- **WHEN** Terraform destroy succeeds
- **THEN** cleanup instructions MUST require verification that ALB, ECS, RDS, CloudWatch log group, Secrets Manager containers, and local/CI plan artifacts are deleted or intentionally retained
