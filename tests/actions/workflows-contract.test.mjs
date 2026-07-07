import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowsDir = path.join(repoRoot, '.github/workflows');

async function loadWorkflows() {
  const entries = await readdir(workflowsDir, { withFileTypes: true });
  const workflows = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const fullPath = path.join(workflowsDir, entry.name);
    workflows.push({
      name: entry.name,
      relativePath: path.relative(repoRoot, fullPath),
      text: await readFile(fullPath, 'utf8'),
    });
  }
  assert.ok(workflows.length > 0, 'expected GitHub Actions workflows to exist');
  return workflows;
}

function workflowText(workflows, label, pattern) {
  const match = workflows.find((workflow) => pattern.test(workflow.name) || pattern.test(workflow.text));
  assert.ok(match, `${label} workflow is missing`);
  return match;
}

function assertContains(workflow, pattern, message) {
  assert.match(workflow.text, pattern, `${workflow.relativePath}: ${message}`);
}

function assertDoesNotContain(workflow, pattern, message) {
  assert.doesNotMatch(workflow.text, pattern, `${workflow.relativePath}: ${message}`);
}

function runCommandLines(workflow) {
  const lines = workflow.text.split(/\r?\n/);
  const commands = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*run:\s*\|\s*$/.test(line)) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const block = [];
      let cursor = index + 1;
      while (cursor < lines.length) {
        const next = lines[cursor];
        const nextIndent = next.match(/^(\s*)/)?.[1].length ?? 0;
        if (next.trim() !== '' && nextIndent <= indent) break;
        block.push(next);
        cursor += 1;
      }
      commands.push({ line: index + 1, text: block.join('\n') });
      continue;
    }
    const inline = line.match(/^\s*run:\s*(.+)$/);
    if (inline) {
      commands.push({ line: index + 1, text: inline[1] });
    }
  }
  return commands;
}

function assertNoWorkflowInputsInRunCommands(workflow) {
  const offenders = runCommandLines(workflow).filter((command) => /\$\{\{\s*inputs\./i.test(command.text));
  assert.deepEqual(offenders, [], `${workflow.relativePath}: workflow inputs must be copied through env before shell execution`);
}

function firstRunCommandLineMatching(workflow, pattern, label) {
  const match = runCommandLines(workflow).find((command) => pattern.test(command.text));
  assert.ok(match, `${workflow.relativePath}: missing ${label} command`);
  return match.line;
}

function assertLeastPrivilegeCommon(workflow) {
  assertContains(workflow, /permissions:\s*(?:\r?\n\s+contents:\s*read)/i, 'workflow must default to read-only repository contents');
  assertDoesNotContain(workflow, /contents:\s*write|pull-requests:\s*write|actions:\s*write/i, 'workflow must not request broad write permissions');
}

function assertManualOnly(workflow, label) {
  assertContains(workflow, /^\s+workflow_dispatch:\s*$/mi, `${label} must be manually dispatchable`);
  assertDoesNotContain(workflow, /^\s+pull_request(?:_target)?:\s*$/mi, `${label} must not run on pull requests`);
}

test('workflow files do not contain plaintext credentials or secret-looking values', async () => {
  const workflows = await loadWorkflows();
  const combined = workflows.map((workflow) => `\n# ${workflow.relativePath}\n${workflow.text}`).join('\n');

  assert.doesNotMatch(combined, /aws_secret_access_key\s*[:=]\s*(?!\$\{\{\s*secrets\.)\S+/i, 'workflows must not configure plaintext AWS secret access keys');
  assert.doesNotMatch(combined, /aws_access_key_id\s*[:=]\s*(?!\$\{\{\s*secrets\.)\S+/i, 'workflows must not configure plaintext AWS access key IDs');
  assert.doesNotMatch(combined, /(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, 'workflows must not contain API keys, JWTs, database URLs with passwords, or private keys');
  assert.doesNotMatch(combined, /echo\s+['"]?\$\{\{\s*secrets\.[^}]+\}\}/i, 'workflows must not echo GitHub secret values');
});

test('CI workflow exposes separate required quality gate jobs with npm ci installs', async () => {
  const workflows = await loadWorkflows();
  const ci = workflowText(workflows, 'CI workflow', /^ci\.ya?ml$/i);

  assertContains(ci, /^\s+(pull_request|pull_request_target):\s*$/mi, 'CI must run for pull requests');
  assertContains(ci, /^\s+push:\s*$/mi, 'CI must run for pushes to protected branches');
  assertLeastPrivilegeCommon(ci);
  assertDoesNotContain(ci, /id-token:\s*write/i, 'CI must not request OIDC credentials reserved for AWS deployment');
  assertContains(ci, /cancel-in-progress:\s*true/i, 'CI concurrency must cancel superseded runs');

  for (const gate of [
    'CI / Build',
    'CI / Unit Contracts',
    'CI / Verification Contracts',
    'CI / Integration Contracts',
    'CI / AWS Static Validation',
    'CI / AWS Container Build Smoke',
  ]) {
    assertContains(ci, new RegExp(`name:\\s*${gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), `required check job ${gate} must be named exactly for branch rulesets`);
  }

  assertContains(ci, /npm\s+ci[\s\S]*npm\s+run\s+build/i, 'build gate must install from lockfile and run npm run build');
  assertContains(ci, /npm\s+ci[\s\S]*npm\s+run\s+test:unit/i, 'unit gate must install from lockfile and run unit contracts');
  assertContains(ci, /npm\s+ci[\s\S]*npm\s+run\s+verify/i, 'verification gate must install from lockfile and run verification contracts');
  assertContains(ci, /npm\s+ci[\s\S]*npm\s+run\s+test:integration/i, 'integration gate must run deterministic integration coverage');
  assertContains(ci, /SKIP integration live PostgreSQL|npm\s+run\s+test:integration/i, 'integration gate must preserve explicit live database skip output from the repository command');
  assertContains(ci, /terraform_version:\s*\$\{\{\s*env\.TERRAFORM_VERSION\s*\}\}/i, 'Terraform tooling must be pinned through workflow env');
  assertContains(ci, /terraform\s+-chdir=infra\/aws\s+fmt\s+-check/i, 'AWS static validation must check Terraform formatting');
  assertContains(ci, /terraform\s+-chdir=infra\/aws\s+init\s+-backend=false/i, 'AWS static validation must initialize Terraform without backend');
  assertContains(ci, /terraform\s+-chdir=infra\/aws\s+validate/i, 'AWS static validation must validate Terraform');
  assertContains(ci, /docker\s+build\s+-f\s+Dockerfile\.aws[\s\S]*--label\s+org\.opencontainers\.image\.revision=\$\{\{\s*github\.sha\s*\}\}/i, 'AWS container smoke must build Dockerfile.aws without pushing and label source revision');
  assertContains(ci, /docker\s+run[\s\S]*\/app\/dist\/index\.html[\s\S]*\/app\/apps\/api\/src\/server\/index\.mjs/i, 'AWS container smoke must verify minimal runtime packaging');
});

test('extended quality workflow runs manual and scheduled heavyweight suites explicitly', async () => {
  const workflows = await loadWorkflows();
  const extended = workflowText(workflows, 'extended quality workflow', /extended-quality\.ya?ml$/i);

  assertContains(extended, /^\s+workflow_dispatch:\s*$/mi, 'extended suites must be manually dispatchable');
  assertContains(extended, /^\s+schedule:\s*$/mi, 'extended suites must run on a visible schedule');
  assertLeastPrivilegeCommon(extended);
  assertContains(extended, /npx\s+playwright\s+install\s+--with-deps\s+chromium[\s\S]*npm\s+run\s+test:e2e/i, 'Playwright suite must install Chromium prerequisites and run E2E');
  assertContains(extended, /npm\s+run\s+test:eval/i, 'eval regression suite must run repository eval tests');
  assertContains(extended, /npm\s+run\s+test:docker/i, 'Docker Compose contract suite must run repository Docker contracts');
  assertContains(extended, /npm\s+run\s+smoke:markitdown/i, 'MarkItDown suite must run the full smoke command');
  assertContains(extended, /actions\/upload-artifact@v4/i, 'extended suites must upload reports or artifacts when available');
});

test('AWS deploy workflow releases immutable images and applies reviewed remote-state Terraform plans', async () => {
  const workflows = await loadWorkflows();
  const deploy = workflowText(workflows, 'AWS deploy workflow', /aws-deploy\.ya?ml$/i);

  assertManualOnly(deploy, 'AWS deploy');
  assertLeastPrivilegeCommon(deploy);
  assertContains(deploy, /id-token:\s*write/i, 'AWS deploy must use GitHub OIDC instead of static AWS keys');
  assertContains(deploy, /environment:\s*(?:\r?\n\s+name:\s*)?aws-demo/i, 'AWS deploy must require a GitHub environment gate');
  assertContains(deploy, /aws-actions\/configure-aws-credentials/i, 'AWS deploy must configure AWS credentials through the official OIDC action');
  assertContains(deploy, /role-to-assume:\s*\$\{\{\s*vars\.AWS_DEMO_DEPLOY_ROLE_ARN\s*\}\}/i, 'AWS deploy must assume the configured environment deploy role');
  assertDoesNotContain(deploy, /aws-access-key-id:|aws-secret-access-key:/i, 'AWS deploy must not use long-lived AWS access keys');
  assertNoWorkflowInputsInRunCommands(deploy);

  assertContains(deploy, /amazon-ecr-login@v2/i, 'release must log in to ECR');
  assertContains(deploy, /docker\s+build\s+-f\s+Dockerfile\.aws[\s\S]*org\.opencontainers\.image\.revision=\$GITHUB_SHA[\s\S]*docker\s+push/i, 'release must build Dockerfile.aws, tag by commit SHA, label source revision, and push');
  assertContains(deploy, /describe-images[\s\S]*imageTag="\$GITHUB_SHA"[\s\S]*image_uri=/i, 'release must capture the pushed immutable digest');
  assertContains(deploy, /BREAK_GLASS_IMAGE_DIGEST[\s\S]*docker\s+inspect[\s\S]*org\.opencontainers\.image\.revision[\s\S]*test\s+"\$SOURCE_REVISION"\s+=\s+"\$GITHUB_SHA"/i, 'break-glass digest must validate repository ownership and source revision');

  const terraformInitLine = firstRunCommandLineMatching(deploy, /terraform\s+-chdir=infra\/aws\s+init[\s\S]*backend-config=[\s\S]*dynamodb_table/i, 'Terraform remote backend init');
  const terraformPlanLine = firstRunCommandLineMatching(deploy, /terraform\s+-chdir=infra\/aws\s+plan\b/i, 'Terraform plan');
  const terraformApplyLine = firstRunCommandLineMatching(deploy, /terraform\s+-chdir=infra\/aws\s+apply\s+-input=false\s+-auto-approve\s+doculens-demo\.tfplan/i, 'Terraform apply exact plan');
  assert.ok(terraformInitLine < terraformPlanLine, `${deploy.relativePath}: Terraform init must run before Terraform plan`);
  assert.ok(terraformPlanLine < terraformApplyLine, `${deploy.relativePath}: Terraform plan must be preserved before apply`);
  assertContains(deploy, /actions\/upload-artifact@v4[\s\S]*doculens-demo\.tfplan[\s\S]*doculens-demo-plan\.txt/i, 'deploy must preserve binary plan and redacted summary for review');
  assertContains(deploy, /secretsmanager\s+get-secret-value[\s\S]*DATABASE_URL_SECRET_ARN[\s\S]*JWT_SECRET_ARN[\s\S]*MINIMAX_API_KEY_SECRET_ARN/i, 'deploy must verify required external secrets without printing payloads');
  assertContains(deploy, /desired[_-]?count|db_instance_class|db\.t4g\.micro|allocated_storage/i, 'AWS deploy must pin or validate tiny demo capacity before applying');
  assertContains(deploy, /curl\s+-fsS\s+"\$HEALTH_URL"/i, 'deploy must run ALB /health smoke after apply');
  assertContains(deploy, /timeout-minutes:\s*(?:[1-9]|[1-2][0-9]|30)\b/i, 'AWS deploy jobs must have a small timeout to bound demo spend');
});

test('AWS rollback workflow accepts only task definition targets and proves stable healthy rollout', async () => {
  const workflows = await loadWorkflows();
  const rollback = workflowText(workflows, 'AWS rollback workflow', /aws-rollback\.ya?ml$/i);

  assertManualOnly(rollback, 'AWS rollback');
  assertLeastPrivilegeCommon(rollback);
  assertContains(rollback, /id-token:\s*write/i, 'AWS rollback must use GitHub OIDC instead of static AWS keys');
  assertContains(rollback, /environment:\s*(?:\r?\n\s+name:\s*)?aws-demo/i, 'AWS rollback must require the same GitHub environment gate as deploy');
  assertContains(rollback, /ECS task definition ARN or family:revision/i, 'rollback input description must match task-definition behavior');
  assertContains(rollback, /raw image URI rollback inputs are rejected/i, 'rollback workflow must explicitly reject raw image URI targets');
  assertContains(rollback, /\.dkr\.ecr\.|@sha256:/i, 'rollback workflow must reject raw image digest inputs before update-service');
  assertContains(rollback, /aws\s+ecs\s+update-service[\s\S]*--task-definition\s+"\$ROLLBACK_TARGET"/i, 'rollback must update ECS service to reviewed task definition');
  assertContains(rollback, /aws\s+ecs\s+wait\s+services-stable/i, 'rollback must wait for ECS service stability');
  assertContains(rollback, /rolloutState[\s\S]*COMPLETED/i, 'rollback must verify completed primary rollout');
  assertContains(rollback, /runningCount[\s\S]*desiredCount|desiredCount[\s\S]*runningCount/i, 'rollback must verify desired running count');
  assertContains(rollback, /curl\s+-fsS\s+"\$HEALTH_URL"/i, 'rollback must run ALB health validation');
  assertNoWorkflowInputsInRunCommands(rollback);
  assertContains(rollback, /timeout-minutes:\s*(?:[1-9]|[1-2][0-9]|30)\b/i, 'AWS rollback jobs must have a small timeout to bound spend');
});

test('mutation workflow uses lockfile installs while keeping bounded report upload behavior', async () => {
  const workflows = await loadWorkflows();
  const mutation = workflowText(workflows, 'mutation workflow', /mutation\.ya?ml$/i);

  assertManualOnly(mutation, 'mutation testing');
  assertLeastPrivilegeCommon(mutation);
  assertContains(mutation, /workflow_dispatch:[\s\S]*inputs:[\s\S]*(?:mode|scope|suite):/i, 'mutation workflow must expose an explicit mode or suite input');
  assertContains(mutation, /(?:smoke|unit|integration|e2e)/i, 'mutation workflow must name bounded mutation scopes');
  assertContains(mutation, /npm\s+ci/i, 'mutation workflow must install dependencies from the lockfile');
  assertContains(mutation, /timeout-minutes:\s*(?:[1-9]|[1-5][0-9]|60)\b/i, 'mutation workflow must bound runtime');
  assertDoesNotContain(mutation, /^\s+schedule:\s*$/mi, 'mutation workflow must not run expensive mutation tests on a schedule');
  assertContains(mutation, /npm\s+run\s+mutation:(?:smoke|unit|integration|e2e)/i, 'mutation workflow must invoke the repository mutation command');
  assertContains(mutation, /actions\/upload-artifact@v4[\s\S]*reports\/mutation/i, 'mutation workflow must keep report upload behavior');
});
