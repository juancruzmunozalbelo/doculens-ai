# DocuLens AI

DocuLens AI is a source-first AI document reviewer for the Full Stack AI Engineer assessment. It lets an authenticated reviewer choose one active source, generate a concise review briefing, ask grounded questions, inspect inline citations, and keep technical AI internals out of the primary reviewer path.

This repository is public. Do not commit real secrets, `.env` files, Terraform state/plans, AWS credentials, MiniMax keys, JWT secrets, database passwords, raw sensitive document samples, or local harness folders.

## Documentation

The delivery documentation lives in the GitHub Wiki:

- [Wiki Home](https://github.com/juancruzmunozalbelo/doculens-ai/wiki)
- [Challenger Assessment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Challenger-Assessment)
- [Demo Script](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Demo-Script)
- [Reviewer Q&A](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Q-and-A)
- [Architecture](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Architecture)
- [Decisions and Tradeoffs](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Decisions-and-Tradeoffs)
- [Local Demo](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Local-Demo)
- [AWS Deployment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/AWS-Deployment)
- [Security and Secrets](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Security-and-Secrets)
- [Troubleshooting](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Troubleshooting)

## What is implemented

- React + Node source-first reviewer flow.
- JWT authentication, hashed passwords, expiring tokens, and owner-scoped document APIs.
- Child-resource authorization for analysis, messages, chunks, citations, and cascade delete paths.
- PostgreSQL schema, reset/migration/seed scripts, and integrity contracts.
- Markdown/text normalization, section-aware chunking, stable chunk IDs, token estimates, and chunk persistence.
- Retrieval provider with deterministic fallback/unsupported policy and citation-ready metadata.
- MiniMax M3 provider behind an `AIProvider` abstraction with live-call budgets and fail-closed live smoke gates.
- Full-document analysis and RAG-first chat with citation validation.
- Prompt safety wrappers, delimiter escaping, prompt-injection resistance, and centralized redaction.
- Authenticated PDF upload readiness for small text-based PDFs through MarkItDown-compatible conversion.
- Local Docker Compose path and single-container AWS image path.
- Terraform demo stack for ECS Fargate, ALB, RDS PostgreSQL, Secrets Manager, CloudWatch, IAM, and security groups.
- GitHub Actions required CI gates, AWS static validation, AWS container build smoke, release/deploy workflow, and rollback workflow.

## Local quick start

Prerequisites:

- Node.js 22+
- npm
- PostgreSQL 16+ for full persistence

Install:

```bash
npm ci
```

Configure private environment through shell exports or a local-only sourced `.env`:

```bash
DATABASE_URL=postgresql://doculens:doculens@127.0.0.1:5432/doculens
JWT_SECRET=<strong-local-secret>
AI_PROVIDER=minimax
MINIMAX_API_KEY=<real-key-or-local-placeholder-for-non-live-paths>
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODEL=MiniMax-M3
```

Reset, migrate, and seed:

```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```

Run the app:

```bash
npm run dev --workspace apps/api
npm run dev --workspace apps/web
```

Default ports:

- React UI: `http://127.0.0.1:5173`
- Node API: `http://127.0.0.1:3000`

## Common commands

```bash
npm run build
npm run test:unit
npm run verify
npm run test:integration
npm run test:aws
npm run smoke:markitdown
npx playwright test tests/e2e/doculens-ui.spec.mjs --reporter=list
```

Docker Compose:

```bash
POSTGRES_PASSWORD=local-postgres \
JWT_SECRET=DocuLensLocalJwtSecret1234567890Aa \
MINIMAX_API_KEY=minimax-local-placeholder \
docker-compose up --build
```

AWS image smoke:

```bash
docker build -f Dockerfile.aws -t doculens-ai:aws-demo .
```

## AWS demo

Terraform lives in `infra/aws`. The stack is disposable demo-grade infrastructure: public ALB, one ECS Fargate service, RDS PostgreSQL, Secrets Manager bindings, CloudWatch logs, IAM, and remote S3/DynamoDB Terraform state.

See [AWS Deployment](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/AWS-Deployment) for release/deploy, rollback, destroy, cost, and production-gap notes.

## Security

Secrets are not stored in the repository. GitHub Actions uses OIDC for AWS access, and runtime secret payloads live outside the repo in AWS Secrets Manager or private local environment variables. Logs and model prompts are covered by centralized redaction contracts.

See [Security and Secrets](https://github.com/juancruzmunozalbelo/doculens-ai/wiki/Security-and-Secrets) for details.

## Current limitations

- Live MiniMax proof requires a real `MINIMAX_API_KEY` and explicit opt-in.
- AWS `terraform apply` requires protected `aws-demo` environment approval, a pushed image digest, and populated external secret ARNs.
- The AWS stack is demo-grade, not production-ready.

## OpenSpec

Change artifacts live under `openspec/changes/`. Validate OpenSpec changes with:

```bash
openspec validate --changes <change-name>
```
