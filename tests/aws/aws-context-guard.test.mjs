import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const guardCandidates = [
  'scripts/checks/aws-context-guard.mjs',
  'scripts/aws/context-guard.mjs',
  'scripts/aws/check-context.mjs',
];

async function fileExists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function guardScriptPath() {
  for (const candidate of guardCandidates) {
    if (await fileExists(candidate)) return path.join(repoRoot, candidate);
  }
  assert.fail(`AWS CLI context guard script is missing; expected one of ${guardCandidates.join(', ')}`);
}

async function installFakeAws(t, identity) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'doculens-aws-guard-'));
  t.after(async () => rm(tempDir, { recursive: true, force: true }));
  const callsPath = path.join(tempDir, 'aws-calls.json');
  const awsPath = path.join(tempDir, 'aws');
  await writeFile(
    awsPath,
    `#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const callsPath = ${JSON.stringify(callsPath)};
const calls = existsSync(callsPath) ? JSON.parse(readFileSync(callsPath, 'utf8')) : [];
calls.push(process.argv.slice(2));
writeFileSync(callsPath, JSON.stringify(calls), 'utf8');
if (process.argv.includes('sts') && process.argv.includes('get-caller-identity')) {
  process.stdout.write(JSON.stringify(${JSON.stringify(identity)}));
  process.exit(0);
}
process.stderr.write('unexpected fake aws command: ' + process.argv.slice(2).join(' ') + '\\n');
process.exit(64);
`,
    { mode: 0o755 },
  );

  return {
    pathPrefix: tempDir,
    async calls() {
      try {
        return JSON.parse(await readFile(callsPath, 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw error;
      }
    },
  };
}

function runGuard(scriptPath, args, { pathPrefix, env = {} } = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
      PATH: pathPrefix ? `${pathPrefix}${path.delimiter}${process.env.PATH ?? ''}` : process.env.PATH,
      AWS_ACCESS_KEY_ID: 'AKIA_CONTEXT_GUARD_CANARY',
      AWS_SECRET_ACCESS_KEY: 'aws_secret_context_guard_canary_must_not_print',
      AWS_SESSION_TOKEN: 'aws_session_context_guard_canary_must_not_print',
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

function output(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function assertNoSecretOutput(result) {
  const text = output(result);
  for (const canary of [
    'AKIA_CONTEXT_GUARD_CANARY',
    'aws_secret_context_guard_canary_must_not_print',
    'aws_session_context_guard_canary_must_not_print',
  ]) {
    assert.equal(text.includes(canary), false, `AWS context guard leaked credential canary ${canary}`);
  }
}

test('AWS context guard rejects default profile before any AWS mutation can run', async (t) => {
  const scriptPath = await guardScriptPath();
  const fakeAws = await installFakeAws(t, {
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:user/demo-deployer',
    UserId: 'AIDADEFAULTPROFILE',
  });

  const result = runGuard(scriptPath, ['--profile', 'default', '--region', 'us-east-1', '--expected-account', '123456789012'], {
    pathPrefix: fakeAws.pathPrefix,
    env: { AWS_PROFILE: 'default', AWS_REGION: 'us-east-1' },
  });

  assert.notEqual(result.status, 0, `default AWS profile must be rejected\n${output(result)}`);
  assert.match(output(result), /default|profile/i, 'failure output must explain that the default AWS profile is unsafe');
  assertNoSecretOutput(result);
});

test('AWS context guard rejects root account identity returned by sts get-caller-identity', async (t) => {
  const scriptPath = await guardScriptPath();
  const fakeAws = await installFakeAws(t, {
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:root',
    UserId: '123456789012',
  });

  const result = runGuard(scriptPath, ['--profile', 'doculens-demo', '--region', 'us-east-1', '--expected-account', '123456789012'], {
    pathPrefix: fakeAws.pathPrefix,
    env: { AWS_PROFILE: 'doculens-demo', AWS_REGION: 'us-east-1' },
  });

  assert.notEqual(result.status, 0, `root AWS identity must be rejected\n${output(result)}`);
  assert.match(output(result), /root|iam/i, 'failure output must explain that root AWS identity is unsafe');
  assertNoSecretOutput(result);
  assert.deepEqual(await fakeAws.calls(), [['sts', 'get-caller-identity', '--profile', 'doculens-demo', '--region', 'us-east-1', '--output', 'json']], 'guard must verify caller identity with the selected profile and region only');
});

test('AWS context guard accepts the named demo profile and region without printing secret values', async (t) => {
  const scriptPath = await guardScriptPath();
  const fakeAws = await installFakeAws(t, {
    Account: '123456789012',
    Arn: 'arn:aws:iam::123456789012:role/doculens-demo-deployer',
    UserId: 'AROAINTEGRATION:doculens-demo',
  });

  const result = runGuard(scriptPath, ['--profile', 'doculens-demo', '--region', 'us-east-1', '--expected-account', '123456789012'], {
    pathPrefix: fakeAws.pathPrefix,
    env: { AWS_PROFILE: 'doculens-demo', AWS_REGION: 'us-east-1' },
  });

  assert.equal(result.status, 0, `named demo AWS context should pass\n${output(result)}`);
  assert.match(output(result), /doculens-demo/i, 'success output must identify the accepted demo profile');
  assert.match(output(result), /us-east-1/i, 'success output must identify the accepted demo region');
  assertNoSecretOutput(result);
  assert.deepEqual(await fakeAws.calls(), [['sts', 'get-caller-identity', '--profile', 'doculens-demo', '--region', 'us-east-1', '--output', 'json']], 'guard must check AWS STS using the requested profile and region');
});
