import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configCandidates = [
  'stryker.config.mjs',
  'stryker.conf.mjs',
  'mutation.config.mjs',
  'scripts/checks/mutation-config.mjs',
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

async function readRequired(relativePath, purpose) {
  try {
    return await readFile(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') assert.fail(`${purpose} is missing at ${relativePath}`);
    throw error;
  }
}

async function readJson(relativePath, purpose) {
  return JSON.parse(await readRequired(relativePath, purpose));
}

async function mutationConfig() {
  for (const candidate of configCandidates) {
    if (await fileExists(candidate)) {
      return { relativePath: candidate, text: await readRequired(candidate, 'mutation testing config') };
    }
  }
  assert.fail(`mutation testing config is missing; expected one of ${configCandidates.join(', ')}`);
}

function assertScript(scripts, name, contract) {
  const value = scripts?.[name];
  assert.equal(typeof value, 'string', `${contract}: package.json scripts.${name} is required`);
  assert.match(value, /\S/, `${contract}: package.json scripts.${name} must not be empty`);
  assert.doesNotMatch(value, /\b(?:true|exit\s+0)\b|TODO|placeholder|not implemented/i, `${contract}: package.json scripts.${name} must not be a no-op`);
  return value;
}

function assertBounded(script, label) {
  assert.match(script, /--(?:mutate|files|scope|mode|smoke|incremental|since)|MUTATION_(?:MODE|SCOPE)=|SCOPE=|MODE=/i, `${label} must bound the mutation scope instead of mutating the entire repository implicitly`);
  assert.doesNotMatch(script, /--mutate\s+['\"]?(?:\.\/)?(?:\*\*\/\*|src\/\*\*|apps\/\*\*)['\"]?(?:\s|$)/i, `${label} must not use an unbounded all-source mutate glob`);
}

test('package scripts expose separate mutation entry points for unit, integration, E2E, smoke, and manual full runs', async () => {
  const packageJson = await readJson('package.json', 'root package manifest');
  const scripts = packageJson.scripts ?? {};

  const unit = assertScript(scripts, 'mutation:unit', 'unit mutation testing');
  const integration = assertScript(scripts, 'mutation:integration', 'integration mutation testing');
  const e2e = assertScript(scripts, 'mutation:e2e', 'E2E mutation testing');
  const smoke = assertScript(scripts, 'mutation:smoke', 'bounded mutation smoke testing');
  const full = assertScript(scripts, 'mutation:full', 'manual full mutation testing');

  assert.match(unit, /test:unit|unit-contract|tests\/(?:foundation|ingestion|retrieval|ai|chat-api)/i, 'mutation:unit must exercise unit-level contract tests');
  assert.match(integration, /test:integration|integration-contract|tests\/(?:auth|aws|eval|ingestion|retrieval)/i, 'mutation:integration must exercise integration-level contract tests');
  assert.match(e2e, /test:e2e|playwright|tests\/e2e/i, 'mutation:e2e must exercise browser E2E behavior');
  assertBounded(smoke, 'mutation:smoke');
  assert.match(full, /workflow_dispatch|manual|MUTATION_FULL|--full|mutation:unit.*mutation:integration.*mutation:e2e|stryker/i, 'mutation:full must be visibly reserved for explicit manual use');
});

test('mutation runner accepts inline flag arguments used by mutation package scripts without invoking Stryker', async () => {
  const packageJson = await readJson('package.json', 'root package manifest');
  const mutationScripts = Object.entries(packageJson.scripts ?? {}).filter(([name]) => name.startsWith('mutation:'));
  assert.notEqual(mutationScripts.length, 0, 'package.json must expose mutation scripts');

  const usesInlineFlagStyle = mutationScripts.some(([, script]) => /--(?:mode|scope|command)=/.test(script));
  if (!usesInlineFlagStyle) {
    for (const [name, script] of mutationScripts) {
      assert.match(script, /--(?:mode|scope|command)\s+\S+/, `${name} must pass mutation-runner flags as space-separated --flag value arguments when inline --flag=value style is not used`);
    }
    return;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), 'mutation-runner-'));
  try {
    const capturePath = path.join(tempDir, 'capture.json');
    const npxShimPath = path.join(tempDir, 'npx');
    await writeFile(
      npxShimPath,
      [
        '#!/usr/bin/env node',
        "const { writeFileSync } = require('node:fs');",
        'writeFileSync(process.env.MUTATION_RUNNER_CAPTURE, JSON.stringify({',
        '  argv: process.argv.slice(2),',
        '  env: {',
        '    MUTATION_MODE: process.env.MUTATION_MODE,',
        '    MUTATION_SCOPE: process.env.MUTATION_SCOPE,',
        '    MUTATION_TEST_COMMAND: process.env.MUTATION_TEST_COMMAND,',
        '  },',
        '}, null, 2));',
        '',
      ].join('\n'),
      'utf8',
    );
    await chmod(npxShimPath, 0o755);

    const scope = 'apps/api/src/server/security,apps/api/src/server/ingestion';
    const command = 'npm run test:unit';
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, 'scripts/checks/mutation-runner.mjs'),
        '--mode=unit',
        `--scope=${scope}`,
        `--command=${command}`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          MUTATION_RUNNER_CAPTURE: capturePath,
          PATH: `${tempDir}${path.delimiter}${process.env.PATH ?? ''}`,
        },
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, `mutation-runner must accept inline --flag=value arguments; stderr:\n${result.stderr}`);

    const capture = JSON.parse(await readFile(capturePath, 'utf8'));
    assert.deepEqual(capture.argv, ['stryker', 'run', 'stryker.config.mjs', '--mutate', scope], 'mutation-runner must forward the parsed inline scope to Stryker');
    assert.deepEqual(
      capture.env,
      {
        MUTATION_MODE: 'unit',
        MUTATION_SCOPE: scope,
        MUTATION_TEST_COMMAND: command,
      },
      'mutation-runner must translate inline --mode, --scope, and --command flags into the child Stryker environment',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('mutation config mutates application code while excluding tests, fixtures, build output, and generated infrastructure', async () => {
  const { relativePath, text } = await mutationConfig();

  assert.match(text, /mutate\s*[:=]/i, `${relativePath} must declare the mutation targets explicitly`);
  assert.match(text, /apps\/api\/src|apps\/web\/src/i, `${relativePath} must point at the moved app source roots`);
  for (const excluded of ['tests/**', '**/*.test.*', '**/*.spec.*', 'node_modules/**', 'dist/**', 'coverage/**', 'infra/aws/.terraform/**']) {
    assert.match(text, new RegExp(excluded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^,\n\]]*'), 'i'), `${relativePath} must exclude ${excluded} from mutation targets`);
  }
  assert.match(text, /thresholds\s*[:=]|coverageAnalysis\s*[:=]|timeoutMS\s*[:=]|concurrency\s*[:=]/i, `${relativePath} must define bounded mutation runtime or quality gates`);
});

test('mutation setup covers unit, integration, and E2E commands without live secrets or AWS mutation side effects', async () => {
  const { relativePath, text } = await mutationConfig();
  const packageJson = await readJson('package.json', 'root package manifest');
  const combined = `${text}\n${Object.values(packageJson.scripts ?? {}).join('\n')}`;

  for (const expected of [/test:unit|unit-contract/i, /test:integration|integration-contract/i, /test:e2e|playwright/i]) {
    assert.match(combined, expected, `${relativePath} and package scripts must wire mutation runs through unit, integration, and E2E test commands`);
  }
  assert.doesNotMatch(combined, /DOCULENS_LIVE_MINIMAX\s*=\s*(?:true|1)|MINIMAX_API_KEY\s*=\s*[^\s$]|aws\s+(?:deploy|ecs\s+update-service|cloudformation|terraform\s+apply)/i, 'mutation testing must not require live MiniMax secrets or mutating AWS operations');
  assert.match(combined, /smoke|manual|workflow_dispatch|MUTATION_MODE/i, 'mutation setup must distinguish bounded smoke mode from manual full mutation runs');
});
