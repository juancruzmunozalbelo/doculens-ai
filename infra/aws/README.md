# DocuLens AI AWS demo infrastructure

This directory defines a tiny disposable AWS demo stack for the assessment account. It is demo-grade, not production-ready infrastructure.

## What it creates

- Public ALB on port 80 with `/health` target checks.
- One ECS Fargate service running one DocuLens app container built from `Dockerfile.aws`.
- RDS PostgreSQL 16 with `publicly_accessible = false`; database ingress allows port 5432 only from the app task security group.
- Secrets Manager containers for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`, or bindings to externally supplied secret ARNs.
- CloudWatch log group for app logs.
- Bounded demo defaults: desired task count 1, CPU 512, memory 1024 MiB, 20 GiB single-AZ RDS, no NAT gateway, deletion protection disabled, final snapshot skipped.

## Canonical aws-demo configuration record

Do not commit live AWS account identifiers, ARNs, bucket names, or secret payloads. The canonical record for this repository is the protected GitHub `aws-demo` environment variable set below; operators must populate it in GitHub settings and retain screenshot/export evidence before treating deploy as enabled.

| Item | Canonical GitHub environment variable | Required shape |
| --- | --- | --- |
| AWS account id | `AWS_DEMO_ACCOUNT_ID` | 12-digit demo account id |
| AWS region | `AWS_REGION` | `us-east-1` unless the demo owner changes all dependent resources |
| ECR repository | `AWS_DEMO_ECR_REPOSITORY` | Repository name, for example `doculens-ai` |
| Terraform backend bucket | `AWS_DEMO_TF_STATE_BUCKET` | Existing encrypted S3 bucket name |
| Terraform backend lock table | `AWS_DEMO_TF_LOCK_TABLE` | Existing DynamoDB table with `LockID` string partition key |
| Terraform backend key | `AWS_DEMO_TF_STATE_KEY` | `doculens-demo/terraform.tfstate` or another reviewed key |
| Deploy role ARN | `AWS_DEMO_DEPLOY_ROLE_ARN` | IAM role assumed by AWS release/deploy jobs |
| Rollback role ARN | `AWS_DEMO_ROLLBACK_ROLE_ARN` | Separate IAM role assumed by rollback jobs |
| DATABASE_URL secret ARN | `AWS_DEMO_DATABASE_URL_SECRET_ARN` | Populated Secrets Manager ARN with `AWSCURRENT` string value |
| JWT_SECRET secret ARN | `AWS_DEMO_JWT_SECRET_ARN` | Populated Secrets Manager ARN with `AWSCURRENT` string value |
| MINIMAX_API_KEY secret ARN | `AWS_DEMO_MINIMAX_API_KEY_SECRET_ARN` | Populated Secrets Manager ARN with `AWSCURRENT` string value |
| Desired task count | `AWS_DEMO_DESIRED_COUNT` | `1` |
| DB instance class | `AWS_DEMO_DB_INSTANCE_CLASS` | `db.t4g.micro` |
| DB allocated storage | `AWS_DEMO_DB_ALLOCATED_STORAGE` | `20` |

The workflow fails before Terraform plan/apply when required variables are absent, when account/region/capacity guards do not match, or when secret readiness checks cannot read non-empty `AWSCURRENT` values.

Workflow dispatch inputs are copied from the protected environment record at run time; do not hard-code live values in this README:

| Workflow input | Source of truth | Required operator action |
| --- | --- | --- |
| Deploy `expected_account` | `AWS_DEMO_ACCOUNT_ID` | Paste the 12-digit value from the protected `aws-demo` environment variable and confirm the context guard passes. |
| Deploy `break_glass_image_digest` | Reviewed ECR digest, only for break-glass | Leave empty for the default same-run release; if used, provide only `repository@sha256:...` from the configured ECR repository for the reviewed commit. |
| Rollback `expected_account` | `AWS_DEMO_ACCOUNT_ID` | Paste the same protected environment value used by deploy. |
| Rollback `cluster`, `service`, `health_url` | Terraform outputs/AWS console for the deployed stack | Use the current demo ECS cluster/service and ALB `/health` URL; retain the source evidence with rollback notes. |

## GitHub environment protection

Configure the `aws-demo` GitHub environment before running deploy or rollback:

- Required reviewers: at least one repository owner or designated AWS demo operator who can review Terraform plan artifacts and AWS cost impact.
- Allowed deployment branches: `main` only for normal deploys; temporary release branches require explicit owner approval and matching IAM trust policy updates.
- Secrets policy: no long-lived AWS keys. Workflows use GitHub OIDC and the role ARNs above.
- Administrator bypass policy: disabled for normal operation, or explicitly documented with the repository owner, approver, timestamp, and emergency reason.
- Evidence to retain outside the repo: screenshot or exported settings showing required reviewers, allowed branches, wait/bypass settings, and administrator bypass policy.

## OIDC trust policy constraints

Both deploy and rollback roles must trust only GitHub's OIDC provider for this repository and approved subjects. Bind `aud` to `sts.amazonaws.com`; bind `sub` to the exact repository plus protected `aws-demo` environment or approved refs. Avoid wildcard repository, organization-wide, pull-request, or tag subjects unless a repository owner updates the environment branch policy and records why that subject is safe. Example trust condition shape:

```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": [
        "repo:<owner>/<repo>:environment:aws-demo",
        "repo:<owner>/<repo>:ref:refs/heads/main"
      ]
    }
  }
}
```

Use separate least-privilege roles:

- Deploy role: ECR push/read for the configured repository, S3/DynamoDB Terraform backend access for the configured bucket/table/key, Terraform-managed ECS/ALB/RDS/Secrets Manager/CloudWatch/IAM actions required by this stack, `secretsmanager:GetSecretValue` only for the three configured external secret ARNs, and STS identity read.
- Rollback role: ECS `UpdateService`, `DescribeServices`, and waiter-supporting read actions for the configured cluster/service, ALB health read/smoke support as needed, STS identity read, and no ECR push or Terraform apply permissions.

Operator evidence for the role split must show the deploy and rollback role ARNs are different, the deploy role is the only role allowed to push/read the configured ECR repository and run Terraform-managed changes, and the rollback role cannot push images, mutate Terraform state, or apply Terraform.

## Build and release the app image

Pull-request CI builds the image without pushing:

```bash
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .
```

The deploy workflow's default path builds and pushes the image in GitHub Actions after OIDC role assumption:

1. Build `Dockerfile.aws` for `GITHUB_SHA`.
2. Tag `AWS_ACCOUNT_ID.dkr.ecr.AWS_REGION.amazonaws.com/AWS_DEMO_ECR_REPOSITORY:GITHUB_SHA`.
3. Add OCI label `org.opencontainers.image.revision=$GITHUB_SHA`.
4. Push to ECR.
5. Capture the immutable `repository@sha256:...` digest from ECR.
6. Pass that same-run digest to Terraform as `image_uri`.

Break-glass manual digest deploys are isolated behind `break_glass_image_digest`. The workflow rejects mutable tags and validates that the digest belongs to the configured ECR repository and that the image label `org.opencontainers.image.revision` equals the reviewed commit SHA.

`Dockerfile.aws` builds the React UI, copies `dist/` into the Node runtime image, and starts the Node API with `DOCULENS_STATIC_DIR=/app/dist` so one container serves both the React app and `/api/*` routes.

## Remote Terraform backend bootstrap

`versions.tf` declares a partial S3 backend. The workflow supplies backend configuration from GitHub environment variables. Bootstrap these resources once before the first deploy:

```bash
aws s3api create-bucket --bucket <AWS_DEMO_TF_STATE_BUCKET> --region <AWS_REGION>
aws s3api put-bucket-encryption --bucket <AWS_DEMO_TF_STATE_BUCKET> --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket <AWS_DEMO_TF_STATE_BUCKET> --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name <AWS_DEMO_TF_LOCK_TABLE> --attribute-definitions AttributeName=LockID,AttributeType=S --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST
```

Bootstrap evidence must show the bucket and table names match `AWS_DEMO_TF_STATE_BUCKET` and `AWS_DEMO_TF_LOCK_TABLE`, the bucket is encrypted and versioned, the lock table uses a string `LockID` partition key, and the deploy/destroy workflows initialize Terraform with this backend instead of runner-local state.

Run local static validation without the backend when credentials are unavailable:

```bash
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
```

Deploy and destroy workflows must use the remote backend with locking:

```bash
terraform -chdir=infra/aws init \
  -backend-config="bucket=<AWS_DEMO_TF_STATE_BUCKET>" \
  -backend-config="key=<AWS_DEMO_TF_STATE_KEY>" \
  -backend-config="region=<AWS_REGION>" \
  -backend-config="dynamodb_table=<AWS_DEMO_TF_LOCK_TABLE>" \
  -backend-config="encrypt=true"
```

## Secrets

Terraform intentionally does not manage secret values. Do not put JWT secrets, database passwords, MiniMax API keys, or `DATABASE_URL` values in `.tfvars`, plan files, committed files, workflow logs, or Terraform state.

The automated deploy path requires external populated secret ARNs for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`. The workflow runs `secretsmanager:GetSecretValue` for each ARN, requires an `AWSCURRENT` non-empty string, and logs only presence/status. It must not print secret payloads.

The stack can create empty secret containers when external ARNs are not supplied for local/manual experiments, but that mode is not sufficient for automated deploy success.

## Plan, approval, apply, and health smoke

The GitHub Actions deploy path is:

1. Release image digest or validate break-glass digest.
2. Guard AWS account id, region, role identity, backend variables, and bounded demo capacity.
3. Verify external secret readiness without printing payloads.
4. Run `terraform -chdir=infra/aws fmt -check`.
5. Run remote-state `terraform -chdir=infra/aws init`.
6. Run `terraform -chdir=infra/aws validate`.
7. Run `terraform -chdir=infra/aws plan -out=doculens-demo.tfplan ...`.
8. Upload `doculens-demo.tfplan` plus a redacted `doculens-demo-plan.txt` summary for review.
9. Gate `terraform -chdir=infra/aws apply -input=false -auto-approve doculens-demo.tfplan` on the protected `aws-demo` environment.
10. Smoke the ALB `/health` endpoint with `curl -fsS` and fail the workflow if it does not become healthy.

Manual local plan review, if needed:

```bash
terraform -chdir=infra/aws plan \
  -out=doculens-demo.tfplan \
  -var 'image_uri=<pushed-image-digest>'
terraform -chdir=infra/aws show -no-color doculens-demo.tfplan
```

Expected plan shape: VPC, two public subnets, public ALB, ECS cluster/task/service, RDS PostgreSQL, Secrets Manager secret containers or external secret ARNs, IAM task execution role/policy, CloudWatch log group, and security groups. The plan should not show plaintext secret values, `secret_string`, secret versions, NAT gateways, production backup settings, or managed secret payloads. Delete `doculens-demo.tfplan` after review.

## Rollback

Use `.github/workflows/aws-rollback.yml` to restore a reviewed ECS task definition target only:

- Accepted `rollback_target`: ECS task definition ARN or `family:revision`.
- Rejected `rollback_target`: raw image URI, mutable image tag, or `repository@sha256:...` digest.
- Required inputs: `expected_account` copied from `AWS_DEMO_ACCOUNT_ID`, current ECS `cluster`, current ECS `service`, and the ALB `/health` URL for `health_url`.
- Required proof: `aws ecs wait services-stable`, completed primary rollout, running count equals desired count, and ALB `/health` returns success.
- Evidence to retain: workflow run URL, rollback target, ECS service deployment status/running count, and health smoke output. Do not paste secret values or AWS account identifiers into repository files.

Image-based rollback is not implemented. To roll back to an image, first register a reviewed ECS task definition revision that references that image, then pass the task definition ARN or `family:revision`.

## Destroy and cleanup

A guarded destroy path uses the same remote Terraform state and AWS context guard as deploy:

```bash
node scripts/checks/aws-context-guard.mjs --profile doculens-demo --region <AWS_REGION> --expected-account <AWS_DEMO_ACCOUNT_ID>
terraform -chdir=infra/aws init \
  -backend-config="bucket=<AWS_DEMO_TF_STATE_BUCKET>" \
  -backend-config="key=<AWS_DEMO_TF_STATE_KEY>" \
  -backend-config="region=<AWS_REGION>" \
  -backend-config="dynamodb_table=<AWS_DEMO_TF_LOCK_TABLE>" \
  -backend-config="encrypt=true"
terraform -chdir=infra/aws destroy -var 'image_uri=<pushed-image-digest>'
```

Cleanup verification:

- Confirm the ALB, ECS service/tasks, RDS instance, CloudWatch log group, and Secrets Manager containers are deleted or intentionally retained for audit.
- Confirm Terraform remote state now reflects the destroyed stack and DynamoDB has no stale lock.
- Remove local `doculens-demo.tfplan`, `doculens-demo-plan.txt`, `.terraform/`, and any local state copies.
- Confirm no `*.tfstate`, `*.tfstate.*`, or `*.tfplan` files are staged or committed.

AWS-only operator evidence checklist:

- `main` branch ruleset requires `CI / Build`, `CI / Unit Contracts`, `CI / Verification Contracts`, `CI / Integration Contracts`, `CI / AWS Static Validation`, `CI / AWS Container Build Smoke`, and `TDD Guardrails / TDD Guardrails`; stale or missing checks block merge; administrator enforcement or emergency bypass is documented.
- `aws-demo` environment has required reviewers, allowed branches, and bypass policy configured before release, plan, apply, or rollback jobs run.
- OIDC trust policies constrain `aud=sts.amazonaws.com` and repository/ref or protected-environment `sub` values for both deploy and rollback roles.
- Deploy and rollback IAM policies are separate and least-privilege for their documented operations.
- Remote state bootstrap, secret readiness, reviewed binary plan artifact, protected apply, ALB health smoke, rollback stability/health proof, and destroy/cleanup proof are retained outside the repo with secret payloads redacted.

## Cost and production gaps

Estimated cost is bounded but not free: ALB hourly cost, one Fargate task while running, RDS micro instance/storage, CloudWatch logs, Secrets Manager containers, S3 backend storage, DynamoDB lock table requests, and data transfer. Destroy promptly after review.

This demo intentionally omits or simplifies production controls: HTTPS/TLS certificates, private subnet workloads, NAT gateway design or VPC endpoints, database backup retention, final snapshot retention, WAF, rate limit controls, secret rotation, multi-AZ RDS, autoscaling, vulnerability scanning, least-privilege application task role hardening beyond the demo, custom domains, and observability beyond basic CloudWatch logs.

## Optional Lambda MarkItDown extension

PDF conversion is not part of the required AWS demo stack. A production path could upload PDFs to S3, trigger a Lambda function or Lambda container image that packages Microsoft MarkItDown, write converted Markdown back to S3, and send the Markdown to the ingestion API. Review timeout, package size, container image rebuilds, IAM permissions for only the required S3 prefixes and logs, object size limits, antivirus/content scanning, and log redaction so raw document text, API keys, prompts, and conversion errors do not leak into CloudWatch.
