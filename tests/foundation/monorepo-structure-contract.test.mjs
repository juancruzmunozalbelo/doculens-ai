import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function pathExists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(relativePath, purpose) {
  try {
    return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

function workspacePatterns(packageJson) {
  const workspaces = packageJson.workspaces;
  if (Array.isArray(workspaces)) return workspaces;
  if (Array.isArray(workspaces?.packages)) return workspaces.packages;
  return [];
}

function workspaceCovers(patterns, workspacePath) {
  return patterns.some((pattern) => {
    if (pattern === workspacePath) return true;
    if (pattern.endsWith('/*')) return workspacePath.startsWith(pattern.slice(0, -1));
    return false;
  });
}

function assertRealScript(scripts, name, contract) {
  const value = scripts?.[name];
  assert.equal(typeof value, 'string', `${contract}: package.json scripts.${name} is required`);
  assert.match(value, /\S/, `${contract}: package.json scripts.${name} must not be empty`);
  assert.doesNotMatch(value, /\b(?:true|exit\s+0)\b|TODO|placeholder|not implemented/i, `${contract}: package.json scripts.${name} must be wired to a real command`);
  return value;
}

function assertScriptTargetsWorkspace(script, workspacePath, label) {
  const escapedWorkspace = workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(
    script,
    new RegExp(`(?:--workspace(?:=|\\s+)|-w\\s+)${escapedWorkspace}|${escapedWorkspace}|--workspaces\\b`),
    `${label} must explicitly include ${workspacePath} or run all npm workspaces`,
  );
}

test('repository exposes the API and web app source roots as npm workspaces', async () => {
  const rootPackage = await readJson('package.json', 'root package manifest');
  const patterns = workspacePatterns(rootPackage);

  assert.equal(workspaceCovers(patterns, 'apps/api'), true, 'root package.json workspaces must include apps/api');
  assert.equal(workspaceCovers(patterns, 'apps/web'), true, 'root package.json workspaces must include apps/web');
  assert.equal(await pathExists('apps/api/src/server'), true, 'API server source root must live under apps/api/src/server');
  assert.equal(await pathExists('apps/web/src'), true, 'web app source root must live under apps/web/src');

  const apiPackage = await readJson('apps/api/package.json', 'API workspace package manifest');
  const webPackage = await readJson('apps/web/package.json', 'web workspace package manifest');
  assert.match(apiPackage.name ?? '', /api|server/i, 'apps/api/package.json name must identify the API workspace');
  assert.match(webPackage.name ?? '', /web|client|frontend/i, 'apps/web/package.json name must identify the web workspace');
});

test('root orchestration scripts still drive both app workspaces after the source move', async () => {
  const rootPackage = await readJson('package.json', 'root package manifest');
  const scripts = rootPackage.scripts ?? {};

  const dev = assertRealScript(scripts, 'dev', 'local development orchestration');
  const build = assertRealScript(scripts, 'build', 'production build orchestration');
  const unit = assertRealScript(scripts, 'test:unit', 'unit contract orchestration');
  const integration = assertRealScript(scripts, 'test:integration', 'integration contract orchestration');
  const e2e = assertRealScript(scripts, 'test:e2e', 'E2E contract orchestration');
  assertRealScript(scripts, 'verify', 'combined verification orchestration');

  for (const [scriptName, script] of [['dev', dev], ['build', build]]) {
    assertScriptTargetsWorkspace(script, 'apps/api', `scripts.${scriptName}`);
    assertScriptTargetsWorkspace(script, 'apps/web', `scripts.${scriptName}`);
  }

  assert.doesNotMatch(`${dev}\n${build}\n${unit}\n${integration}\n${e2e}`, /\bsrc\/(?:server|client)\b/, 'root scripts must not keep direct references to the old src/server or src/client roots');
  assert.match(unit, /node\s+scripts\/checks\/unit-contract\.mjs|node\s+--test|npm\s+run/i, 'scripts.test:unit must still execute unit contracts');
  assert.match(integration, /node\s+scripts\/checks\/integration-contract\.mjs|node\s+--test|npm\s+run/i, 'scripts.test:integration must still execute integration contracts');
  assert.match(e2e, /playwright\s+test|node\s+scripts\/checks\/e2e-contract\.mjs|npm\s+run/i, 'scripts.test:e2e must still execute the browser E2E contract');
});

test('legacy root src app entry points are removed after callers migrate to apps/*', async () => {
  assert.equal(await pathExists('src/server/index.mjs'), false, 'server entry point must not remain at the legacy src/server root');
  assert.equal(await pathExists('src/client/App.jsx'), false, 'web app entry point must not remain at the legacy src/client root');
});
