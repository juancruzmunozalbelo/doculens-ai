#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const mode = parseArgs(args);

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === '--staged') {
    return { kind: 'staged' };
  }

  if (argv.length === 2 && argv[0] === '--range') {
    return { kind: 'range', range: argv[1] };
  }

  usage();
  process.exit(2);
}

function usage() {
  console.error('Usage: node scripts/guardrails/check-tdd.mjs --staged');
  console.error('   or: node scripts/guardrails/check-tdd.mjs --range <base..head>');
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
  });

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`git ${args.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }

  return result.stdout.trim();
}

function changedFiles() {
  const output = mode.kind === 'staged'
    ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    : git(['diff', '--name-only', '--diff-filter=ACMR', mode.range]);

  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isOpenSpecOrDocs(path) {
  return path.startsWith('openspec/')
    || path.startsWith('docs/')
    || path === 'README.md'
    || path.endsWith('.md')
    || path === '.gitignore';
}

function isTestLike(path) {
  const lower = path.toLowerCase();
  return lower.includes('/test/')
    || lower.includes('/tests/')
    || lower.startsWith('test/')
    || lower.startsWith('tests/')
    || lower.startsWith('e2e/')
    || lower.includes('/e2e/')
    || lower.includes('/eval/')
    || lower.startsWith('eval/')
    || lower.includes('/smoke/')
    || lower.startsWith('smoke/')
    || lower.includes('.test.')
    || lower.includes('.spec.')
    || lower.endsWith('.tftest.hcl')
    || lower.includes('playwright');
}

function isTerraformImplementation(path) {
  const lower = path.toLowerCase();
  return (lower.startsWith('infra/') || lower.includes('/infra/'))
    && lower.endsWith('.tf')
    && !lower.endsWith('.tftest.hcl');
}

function isTerraformValidation(path) {
  const lower = path.toLowerCase();
  return lower.endsWith('.tftest.hcl')
    || lower.includes('terraform') && (lower.includes('test') || lower.includes('validate') || lower.includes('validation'));
}

function isImplementation(path) {
  const lower = path.toLowerCase();

  if (isOpenSpecOrDocs(path) || isTestLike(path) || isTerraformImplementation(path)) {
    return false;
  }

  return lower.startsWith('src/')
    || lower.startsWith('app/')
    || lower.startsWith('server/')
    || lower.startsWith('client/')
    || lower.startsWith('api/')
    || lower.startsWith('packages/')
    || lower.startsWith('scripts/')
    || lower.endsWith('.js')
    || lower.endsWith('.mjs')
    || lower.endsWith('.cjs')
    || lower.endsWith('.ts')
    || lower.endsWith('.tsx')
    || lower.endsWith('.jsx')
    || lower.endsWith('.py');
}

function hasAnyTestCompanion(files) {
  return files.some(isTestLike);
}

function hasTerraformValidation(files) {
  return files.some(isTerraformValidation);
}

function main() {
  let files;
  try {
    files = changedFiles();
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  if (files.length === 0) {
    console.log('TDD guardrail: no changed files.');
    return;
  }

  const terraformChanges = files.filter(isTerraformImplementation);
  const implementationChanges = files.filter(isImplementation);
  const failures = [];

  if (terraformChanges.length > 0 && !hasTerraformValidation(files)) {
    failures.push([
      'Terraform/infra changes require a validation or test companion, e.g. an .tftest.hcl file or documented validation script.',
      ...terraformChanges.map((file) => `  - ${file}`),
    ].join('\n'));
  }

  if (implementationChanges.length > 0 && !hasAnyTestCompanion(files)) {
    failures.push([
      'Implementation changes require a test, eval, E2E, or smoke companion in the same commit/PR.',
      ...implementationChanges.map((file) => `  - ${file}`),
    ].join('\n'));
  }

  if (failures.length > 0) {
    console.error('TDD guardrail failed.');
    console.error(failures.join('\n\n'));
    process.exit(1);
  }

  console.log('TDD guardrail passed.');
}

main();
