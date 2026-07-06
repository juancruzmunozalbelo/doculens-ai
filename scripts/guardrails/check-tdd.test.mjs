import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const guardrailScript = fileURLToPath(new URL('./check-tdd.mjs', import.meta.url));

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function resultOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function mustRun(command, args, cwd) {
  const result = run(command, args, cwd);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed with status ${result.status}\n${resultOutput(result)}`,
  );
  return result;
}

function mustGit(repo, args) {
  return mustRun('git', args, repo);
}

function createRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), 'check-tdd-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));

  mustGit(repo, ['init']);
  mustGit(repo, ['config', 'user.email', 'guardrail-tests@example.invalid']);
  mustGit(repo, ['config', 'user.name', 'Guardrail Tests']);
  mustGit(repo, ['config', 'core.autocrlf', 'false']);
  mustGit(repo, ['commit', '--allow-empty', '-m', 'baseline']);

  return repo;
}

function writeRepoFile(repo, relativePath, contents = '') {
  const absolutePath = join(repo, relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
}

function commitAll(repo, message) {
  mustGit(repo, ['add', '.']);
  mustGit(repo, ['commit', '-m', message]);
}

function head(repo) {
  return mustGit(repo, ['rev-parse', 'HEAD']).stdout.trim();
}

function runGuardrail(repo, args) {
  return run(process.execPath, [guardrailScript, ...args], repo);
}

function assertPasses(result) {
  assert.equal(result.status, 0, `expected guardrail to pass\n${resultOutput(result)}`);
}

function assertFailsForUntestedImplementation(result, changedPath) {
  assert.notEqual(result.status, 0, 'expected guardrail to fail for untested implementation change');

  const output = resultOutput(result);
  assert.match(output, new RegExp(escapeRegExp(changedPath)), `expected output to name ${changedPath}\n${output}`);
  assert.match(
    output,
    /test|eval|e2e|smoke/i,
    `expected output to ask for a test, eval, E2E, or smoke companion\n${output}`,
  );
}

function assertFailsForTerraformWithoutValidation(result, changedPath) {
  assert.notEqual(result.status, 0, 'expected guardrail to fail for Terraform without validation');

  const output = resultOutput(result);
  assert.match(output, new RegExp(escapeRegExp(changedPath)), `expected output to name ${changedPath}\n${output}`);
  assert.match(output, /terraform|infra/i, `expected output to identify infrastructure/Terraform change\n${output}`);
  assert.match(output, /validation|test|tftest/i, `expected output to ask for validation or test companion\n${output}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('docs and OpenSpec-only changes pass without tests', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'docs/architecture.md', '# Architecture\n\nDecision record.\n');
  writeRepoFile(repo, 'openspec/changes/add-widget/proposal.md', '# Proposal\n\nDescribe the change.\n');
  writeRepoFile(repo, 'openspec/changes/add-widget/specs/widget/spec.md', '## ADDED Requirements\n\n### Requirement: Widget\n');
  commitAll(repo, 'docs and openspec only');

  assertPasses(runGuardrail(repo, ['--range', `${base}..HEAD`]));
});

test('src implementation change without a test, eval, E2E, or smoke companion fails', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'src/calculator.mjs', 'export function add(a, b) { return a + b; }\n');
  commitAll(repo, 'add calculator implementation');

  assertFailsForUntestedImplementation(runGuardrail(repo, ['--range', `${base}..HEAD`]), 'src/calculator.mjs');
});

test('src implementation change with a matching test file passes', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'src/calculator.mjs', 'export function add(a, b) { return a + b; }\n');
  writeRepoFile(
    repo,
    'src/calculator.test.mjs',
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from './calculator.mjs';\n\ntest('adds signed numbers', () => {\n  assert.equal(add(-2, 5), 3);\n});\n",
  );
  commitAll(repo, 'add calculator with test');

  assertPasses(runGuardrail(repo, ['--range', `${base}..HEAD`]));
});

test('frontend implementation change with a Playwright E2E file passes', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'src/components/UploadButton.tsx', 'export function UploadButton() { return <button>Upload</button>; }\n');
  writeRepoFile(
    repo,
    'e2e/upload-button.spec.ts',
    "import { test, expect } from '@playwright/test';\n\ntest('uploads a document from the primary action', async ({ page }) => {\n  await page.goto('/');\n  await expect(page.getByRole('button', { name: 'Upload' })).toBeVisible();\n});\n",
  );
  commitAll(repo, 'add upload button with e2e coverage');

  assertPasses(runGuardrail(repo, ['--range', `${base}..HEAD`]));
});

test('Terraform change without an infrastructure validation or test file fails', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'infra/main.tf', 'resource "aws_s3_bucket" "documents" {\n  bucket = "doculens-documents"\n}\n');
  commitAll(repo, 'add terraform bucket');

  assertFailsForTerraformWithoutValidation(runGuardrail(repo, ['--range', `${base}..HEAD`]), 'infra/main.tf');
});

test('Terraform change with an infra validation companion passes', (t) => {
  const repo = createRepo(t);
  const base = head(repo);

  writeRepoFile(repo, 'infra/main.tf', 'resource "aws_s3_bucket" "documents" {\n  bucket = "doculens-documents"\n}\n');
  writeRepoFile(
    repo,
    'infra/main.tftest.hcl',
    'run "bucket_name_is_configured" {\n  assert {\n    condition = aws_s3_bucket.documents.bucket == "doculens-documents"\n    error_message = "bucket name changed"\n  }\n}\n',
  );
  commitAll(repo, 'add terraform bucket with validation');

  assertPasses(runGuardrail(repo, ['--range', `${base}..HEAD`]));
});

test('--range compares the supplied base commit to HEAD instead of scanning unrelated history', (t) => {
  const repo = createRepo(t);

  writeRepoFile(repo, 'src/legacy-untested.mjs', 'export const legacy = true;\n');
  commitAll(repo, 'pre-existing untested implementation');
  const base = head(repo);

  writeRepoFile(repo, 'openspec/changes/update-docs/proposal.md', '# Proposal\n\nDocs-only change after base.\n');
  commitAll(repo, 'docs after base');

  assertPasses(runGuardrail(repo, ['--range', `${base}..HEAD`]));
});

test('--staged inspects staged files that are not committed yet', (t) => {
  const repo = createRepo(t);

  writeRepoFile(repo, 'src/staged-only.mjs', 'export const stagedOnly = true;\n');
  mustGit(repo, ['add', 'src/staged-only.mjs']);

  assertFailsForUntestedImplementation(runGuardrail(repo, ['--staged']), 'src/staged-only.mjs');
});
