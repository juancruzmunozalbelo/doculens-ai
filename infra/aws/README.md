# DocuLens AI AWS demo infrastructure

This directory defines a tiny disposable AWS demo stack for the assessment account. It is demo-grade, not production-ready infrastructure.

## What it creates

- Public ALB on port 80 with `/health` target checks.
- One ECS Fargate service running one DocuLens app container built from `Dockerfile.aws`.
- RDS PostgreSQL 16 with `publicly_accessible = false`; database ingress allows port 5432 only from the app task security group.
- Secrets Manager containers for `DATABASE_URL`, `JWT_SECRET`, and `MINIMAX_API_KEY`, or bindings to externally supplied secret ARNs.
- CloudWatch log group for app logs.
- Bounded demo defaults: desired task count 1, CPU 512, memory 1024 MiB, 20 GiB single-AZ RDS, no NAT gateway, deletion protection disabled, final snapshot skipped.

## Build and push the app image

```bash
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .
# Tag and push to your demo registry/ECR, then pass the pushed image URI as -var image_uri=...
```

`Dockerfile.aws` builds the React UI, copies `dist/` into the Node runtime image, and starts the Node API with `DOCULENS_STATIC_DIR=/app/dist` so one container serves both the React app and `/api/*` routes.

## Secrets

Terraform intentionally does not manage secret values. Do not put JWT secrets, database passwords, MiniMax API keys, or DATABASE_URL values in `.tfvars`, plan files, committed files, or Terraform state.

The stack creates empty secret containers when external ARNs are not supplied. Populate them outside Terraform after reviewing RDS outputs and before expecting the ECS task to become healthy, for example with AWS CLI or the console. The RDS master password uses AWS-managed master user secrets; the app `DATABASE_URL` secret is an operator-managed value.

## Validate

```bash
terraform -chdir=infra/aws fmt -check
terraform -chdir=infra/aws init -backend=false
terraform -chdir=infra/aws validate
```

If Terraform is not installed on the workstation, install it or run these commands in a controlled tooling container. Keep `.terraform/` local and ignored.

## Plan review

```bash
terraform -chdir=infra/aws plan \
  -out=doculens-demo.tfplan \
  -var 'image_uri=<pushed-image-uri>'
```

Expected plan shape: VPC, two public subnets, public ALB, ECS cluster/task/service, RDS PostgreSQL, Secrets Manager secret containers or external secret ARNs, IAM task execution role/policy, CloudWatch log group, and security groups. The plan should not show plaintext secret values, `secret_string`, secret versions, NAT gateways, production backup settings, or managed secret payloads. Delete `doculens-demo.tfplan` after review.

## Optional apply in the demo account

Estimated cost is bounded but not free: ALB hourly cost, one Fargate task while running, RDS micro instance/storage, CloudWatch logs, and Secrets Manager containers. Destroy promptly after review.

```bash
terraform -chdir=infra/aws apply -var 'image_uri=<pushed-image-uri>'
terraform -chdir=infra/aws output app_url
terraform -chdir=infra/aws output health_url
curl -fsS "$(terraform -chdir=infra/aws output -raw health_url)"
```

The ALB health smoke should return the app `/health` JSON payload. If the task is unhealthy, confirm the three Secrets Manager values are populated and that `DATABASE_URL` points to the RDS endpoint on port 5432.

## Destroy and cleanup

```bash
terraform -chdir=infra/aws destroy -var 'image_uri=<pushed-image-uri>'
```

Cleanup verification:

- Confirm the ALB, ECS service/tasks, RDS instance, CloudWatch log group, and Secrets Manager containers are deleted or intentionally retained for audit.
- Remove local `doculens-demo.tfplan`, `.terraform/`, and any local state copies.
- Confirm no `*.tfstate`, `*.tfstate.*`, or `*.tfplan` files are staged or committed.

## Production gaps

This demo intentionally omits or simplifies production controls: HTTPS/TLS certificates, private subnet workloads, NAT gateway design, database backup retention, final snapshot retention, WAF, rate limit controls, remote state locking/encryption workflow, secret rotation, multi-AZ RDS, autoscaling, vulnerability scanning, least-privilege application task role hardening, custom domains, and observability beyond basic CloudWatch logs.

## Optional Lambda MarkItDown extension

PDF conversion is not part of the required AWS demo stack. A production path could upload PDFs to S3, trigger a Lambda function or Lambda container image that packages Microsoft MarkItDown, write converted Markdown back to S3, and send the Markdown to the ingestion API. Review timeout, package size, container image rebuilds, IAM permissions for only the required S3 prefixes and logs, object size limits, antivirus/content scanning, and log redaction so raw document text, API keys, prompts, and conversion errors do not leak into CloudWatch.
