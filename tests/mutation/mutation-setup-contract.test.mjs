import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
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
