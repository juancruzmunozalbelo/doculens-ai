## ADDED Requirements

### Requirement: Terraform defines a tiny AWS demo stack
The system SHALL include Terraform configuration for a short-lived AWS demo stack that can validate and optionally apply in the challenge demo account.

#### Scenario: Terraform validates
- **WHEN** Terraform initialization and validation commands are run for the AWS infrastructure directory
- **THEN** formatting and validation complete successfully without requiring plaintext secrets in committed files

### Requirement: Demo stack runs a buildable app container behind a public load balancer
The Terraform stack SHALL define an ECR repository or explicit image URI contract, public Application Load Balancer, health check, and ECS Fargate service running one application container for the React/Node app.

#### Scenario: App URL is output after apply
- **WHEN** the Terraform stack is applied with required variables and a buildable image
- **THEN** Terraform outputs the public application URL for the load balancer

#### Scenario: Health endpoint supports ALB target checks
- **WHEN** the ECS service is deployed behind the ALB
- **THEN** the ALB target group uses a documented health endpoint exposed by the app container

### Requirement: Demo stack uses managed PostgreSQL storage
The Terraform stack SHALL define an RDS PostgreSQL database for the app and restrict database network access to the application service security group.

#### Scenario: Database is not publicly accessible
- **WHEN** the RDS instance is provisioned
- **THEN** it is not publicly accessible and its security group allows database traffic only from the app service security group

### Requirement: Demo stack stores secrets in AWS Secrets Manager
The Terraform stack SHALL model JWT, database, and MiniMax secret containers or external secret ARNs using AWS Secrets Manager or equivalent ECS secret injection without writing plaintext secret values into committed files, Terraform plan output, or Terraform state.

#### Scenario: ECS task receives secrets securely
- **WHEN** the ECS task definition is rendered
- **THEN** sensitive values are referenced through secret bindings rather than hard-coded in committed Terraform files, Terraform variables, plan output, or state

#### Scenario: Terraform does not manage secret string values
- **WHEN** Terraform creates or references secrets for JWT, database, and MiniMax configuration
- **THEN** it creates secret containers/ARN bindings or references externally populated secrets without `secret_string` values or plaintext secret material in Terraform state

#### Scenario: Terraform state artifacts are protected locally
- **WHEN** infrastructure documentation explains local Terraform usage
- **THEN** it requires state/plan files to be ignored, not committed, and checked for absence of JWT, database, and MiniMax secret values

### Requirement: Demo stack emits application logs to CloudWatch
The Terraform stack SHALL configure the application container to send logs to a CloudWatch log group.

#### Scenario: Log group exists for app service
- **WHEN** the Terraform stack is applied
- **THEN** a CloudWatch log group exists for application logs

### Requirement: Demo stack uses bounded cost and destroy-safe defaults
The Terraform stack SHALL default to a single low-cost demo deployment and avoid production-only cost drivers.

#### Scenario: Terraform defaults are cost bounded
- **WHEN** Terraform variables are left at demo defaults
- **THEN** the stack uses one ECS desired task, small Fargate CPU/memory, a single minimal RDS instance/storage allocation, no NAT gateway, deletion protection disabled, and final snapshot skipped for disposable demo teardown

#### Scenario: Plan review shows expected resource shape
- **WHEN** a reviewer runs or reads the Terraform plan output
- **THEN** the plan shows only the expected ALB, ECS, ECR or image URI wiring, RDS, Secrets Manager, CloudWatch, IAM, and security group resources for the tiny demo stack

### Requirement: Infrastructure documentation distinguishes demo from production
The README or infrastructure documentation SHALL state that the Terraform stack is demo-grade and list production gaps including HTTPS, private subnet/NAT design, backups/final snapshots, WAF/rate limits, remote state, and secret rotation.

#### Scenario: Reviewer sees cost, destroy, and production-gap guidance
- **WHEN** a reviewer reads the AWS infrastructure instructions
- **THEN** they see validation commands, optional apply commands, cost warning, estimated cost note, destroy guidance, cleanup verification, and production hardening gaps

### Requirement: Infrastructure docs describe optional Lambda PDF conversion extension
The infrastructure documentation SHALL describe how MarkItDown PDF conversion could move to AWS Lambda or a Lambda container image without making it part of the required demo stack.

#### Scenario: Reviewer sees Lambda conversion trade-offs
- **WHEN** a reviewer reads the AWS or ingestion documentation
- **THEN** they see the optional S3-to-Lambda conversion flow plus timeout, package size, IAM, object size, and log-redaction considerations
