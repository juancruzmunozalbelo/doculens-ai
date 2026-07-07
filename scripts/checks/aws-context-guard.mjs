#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function parseArgs(argv) {
  const options = { profile: null, region: null, expectedAccount: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--profile') options.profile = argv[++index];
    else if (arg === '--region') options.region = argv[++index];
    else if (arg === '--expected-account') options.expectedAccount = argv[++index];
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  return 'Usage: node scripts/checks/aws-context-guard.mjs --profile doculens-demo --region us-east-1 [--expected-account 123456789012]';
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function safeProfile(profile) {
  if (!profile || profile === 'default') {
    throw new Error('Unsafe AWS profile: use a named non-default demo profile such as doculens-demo.');
  }
  return profile;
}

function safeRegion(region) {
  if (!region || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) {
    throw new Error('AWS region is required, for example us-east-1.');
  }
  return region;
}

function readIdentity({ profile, region }) {
  const result = spawnSync('aws', ['sts', 'get-caller-identity', '--profile', profile, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    env: { ...process.env },
  });
  if (result.error) {
    throw new Error(`Unable to run AWS STS identity check: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error('AWS STS identity check failed for the selected profile/region.');
  }
  return JSON.parse(result.stdout);
}

export function validateAwsContext(options) {
  const profile = safeProfile(options.profile ?? process.env.AWS_PROFILE);
  const region = safeRegion(options.region ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION);
  const identity = readIdentity({ profile, region });
  const account = String(identity.Account ?? '');
  const arn = String(identity.Arn ?? '');
  if (options.expectedAccount && account !== String(options.expectedAccount)) {
    throw new Error('AWS account does not match the expected demo account.');
  }
  if (/^arn:aws:iam::\d{12}:root$/.test(arn)) {
    throw new Error('Unsafe AWS IAM root identity: create/use a named least-privilege deploy role or user profile.');
  }
  return { profile, region, account, arn };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const context = validateAwsContext(options);
      console.log(`AWS context accepted for profile ${context.profile} in ${context.region}.`);
    }
  } catch (error) {
    fail(error.message || String(error));
  }
}
