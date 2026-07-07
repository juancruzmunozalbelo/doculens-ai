import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowsDir = path.join(repoRoot, '.github/workflows');

async function loadWorkflows() {
  let entries;
  try {
    entries = await readdir(workflowsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') assert.fail('GitHub Actions workflows directory is missing at .github/workflows');
    throw error;
  }

  const workflows = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
    const relativePath = `.github/workflows/${entry.name}`;
    const text = await readFile(path.join(workflowsDir, entry.name), 'utf8');
    workflows.push({ relativePath, name: entry.name, text, lowerText: text.toLowerCase() });
  }
  assert.notEqual(workflows.length, 0, '.github/workflows must contain YAML workflow files');
  return workflows;
}

function workflowText(workflows, label, pattern) {
  const matches = workflows.filter((workflow) => pattern.test(workflow.name) || pattern.test(workflow.text));
  assert.equal(matches.length, 1, `${label} must be defined by exactly one workflow file; matched ${matches.map((workflow) => workflow.relativePath).join(', ') || 'none'}`);
  return matches[0];
}

function assertContains(workflow, pattern, message) {
  assert.match(workflow.text, pattern, `${workflow.relativePath}: ${message}`);
}

function assertDoesNotContain(workflow, pattern, message) {
  assert.doesNotMatch(workflow.text, pattern, `${workflow.relativePath}: ${message}`);
}

function assertLeastPrivilegeCommon(workflow) {
  assertContains(workflow, /permissions:\s*(?:\r?\n\s+[a-z-]+:\s+\w+)+/i, 'must declare explicit top-level permissions');
  assertContains(workflow, /contents:\s*read\b/i, 'permissions must keep repository contents read-only by default');
  assertContains(workflow, /concurrency:\s*(?:\r?\n\s+[^\n]+)+/i, 'must use concurrency to avoid overlapping runs');
}

function assertManualOnly(workflow, label) {
  assertContains(workflow, /workflow_dispatch:/i, `${label} must be manually dispatchable`);
  assertDoesNotContain(workflow, /^\s+push:\s*$/mi, `${label} must not run from push events`);
  assertDoesNotContain(workflow, /^\s+pull_request:\s*$/mi, `${label} must not run from pull_request events`);
  assertDoesNotContain(workflow, /^\s+schedule:\s*$/mi, `${label} must not run on a schedule`);
}

test('workflow files do not contain plaintext credentials or secret-looking values', async () => {
  const workflows = await loadWorkflows();
  const combined = workflows.map((workflow) => `\n# ${workflow.relativePath}\n${workflow.text}`).join('\n');

  assert.doesNotMatch(combined, /aws_secret_access_key\s*[:=]\s*(?!\$\{\{\s*secrets\.)\S+/i, 'workflows must not configure plaintext AWS secret access keys');
  assert.doesNotMatch(combined, /aws_access_key_id\s*[:=]\s*(?!\$\{\{\s*secrets\.)\S+/i, 'workflows must not configure plaintext AWS access key IDs');
  assert.doesNotMatch(combined, /(?:sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, 'workflows must not contain API keys, JWTs, database URLs with passwords, or private keys');
  assert.doesNotMatch(combined, /echo\s+['\"]?\$\{\{\s*secrets\.[^}]+\}\}/i, 'workflows must not echo GitHub secret values');
});

test('CI workflow runs safe pull request checks with least privilege and cancellation', async () => {
  const workflows = await loadWorkflows();
  const ci = workflowText(workflows, 'CI workflow', /\bci\b|continuous integration/i);

  assertContains(ci, /^\s+(pull_request|pull_request_target):\s*$/mi, 'CI must run for pull requests');
  assertContains(ci, /^\s+push:\s*$/mi, 'CI must run for pushes to protected branches');
  assertLeastPrivilegeCommon(ci);
  assertDoesNotContain(ci, /id-token:\s*write/i, 'CI must not request OIDC credentials reserved for AWS deployment');
  assertContains(ci, /cancel-in-progress:\s*true/i, 'CI concurrency must cancel superseded runs');
  assertContains(ci, /npm\s+(?:ci|install)/i, 'CI must install dependencies reproducibly before checks');
  assertContains(ci, /npm\s+run\s+(?:test:unit|verify)|node\s+scripts\/checks\/unit-contract\.mjs/i, 'CI must execute unit or verification contracts');
});

test('AWS deploy workflow is manual, environment-gated, OIDC-based, and budget-safe', async () => {
  const workflows = await loadWorkflows();
  const deploy = workflowText(workflows, 'AWS deploy workflow', /\bdeploy\b|aws.*deploy|deploy.*aws/i);

  assertManualOnly(deploy, 'AWS deploy');
  assertLeastPrivilegeCommon(deploy);
  assertContains(deploy, /id-token:\s*write/i, 'AWS deploy must use GitHub OIDC instead of static AWS keys');
  assertContains(deploy, /environment:\s*(?:\r?\n\s+name:\s*)?(?:aws-demo|demo|production)/i, 'AWS deploy must require a GitHub environment gate');
  assertContains(deploy, /aws-actions\/configure-aws-credentials/i, 'AWS deploy must configure AWS credentials through the official OIDC action');
  assertContains(deploy, /role-to-assume:\s*\$\{\{\s*(?:secrets|vars)\.[A-Z0-9_]+\s*\}\}/i, 'AWS deploy must assume an environment-protected AWS role');
  assertDoesNotContain(deploy, /aws-access-key-id:|aws-secret-access-key:/i, 'AWS deploy must not use long-lived AWS access keys');
  assertContains(deploy, /terraform\s+-chdir=infra\/aws\s+plan/i, 'AWS deploy must produce a Terraform plan before apply');
  assertContains(deploy, /terraform\s+-chdir=infra\/aws\s+apply/i, 'AWS deploy must apply the reviewed Terraform plan explicitly');
  assertContains(deploy, /timeout-minutes:\s*(?:[1-9]|[1-2][0-9]|30)\b/i, 'AWS deploy jobs must have a small timeout to bound demo spend');
  assertContains(deploy, /desired[_-]?count|db_instance_class|t4g\.micro|t3\.micro|allocated_storage|budget/i, 'AWS deploy must pin or validate tiny demo capacity before applying');
});

test('AWS rollback workflow is manual, environment-gated, and cannot deploy arbitrary unreviewed state', async () => {
  const workflows = await loadWorkflows();
  const rollback = workflowText(workflows, 'AWS rollback workflow', /\brollback\b|aws.*rollback|rollback.*aws/i);

  assertManualOnly(rollback, 'AWS rollback');
  assertLeastPrivilegeCommon(rollback);
  assertContains(rollback, /id-token:\s*write/i, 'AWS rollback must use GitHub OIDC instead of static AWS keys');
  assertContains(rollback, /environment:\s*(?:\r?\n\s+name:\s*)?(?:aws-demo|demo|production)/i, 'AWS rollback must require the same GitHub environment gate as deploy');
  assertContains(rollback, /workflow_dispatch:[\s\S]*inputs:[\s\S]*(?:image_uri|task_definition|revision|rollback_target|deployment_id)/i, 'AWS rollback must require an explicit reviewed rollback target input');
  assertContains(rollback, /aws\s+ecs\s+(?:update-service|describe-services)|terraform\s+-chdir=infra\/aws\s+apply/i, 'AWS rollback must execute an ECS or Terraform rollback operation');
  assertContains(rollback, /timeout-minutes:\s*(?:[1-9]|[1-2][0-9]|30)\b/i, 'AWS rollback jobs must have a small timeout to bound spend');
});

test('mutation workflow is manual or smoke-bounded and never runs the expensive full suite by accident', async () => {
  const workflows = await loadWorkflows();
  const mutation = workflowText(workflows, 'mutation workflow', /\bmutation\b|stryker/i);

  assertManualOnly(mutation, 'mutation testing');
  assertLeastPrivilegeCommon(mutation);
  assertContains(mutation, /workflow_dispatch:[\s\S]*inputs:[\s\S]*(?:mode|scope|suite):/i, 'mutation workflow must expose an explicit mode or suite input');
  assertContains(mutation, /(?:smoke|unit|integration|e2e)/i, 'mutation workflow must name bounded mutation scopes');
  assertContains(mutation, /timeout-minutes:\s*(?:[1-9]|[1-5][0-9]|60)\b/i, 'mutation workflow must bound runtime');
  assertDoesNotContain(mutation, /^\s+schedule:\s*$/mi, 'mutation workflow must not run expensive mutation tests on a schedule');
  assertContains(mutation, /npm\s+run\s+mutation:(?:smoke|unit|integration|e2e)|npx\s+stryker/i, 'mutation workflow must invoke the repository mutation command');
});
