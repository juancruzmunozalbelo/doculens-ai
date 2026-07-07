#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkDocument } from '../../apps/api/src/server/ingestion/chunking.mjs';
import { normalizeDocumentText } from '../../apps/api/src/server/ingestion/normalization.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const samplePdfPath = path.join(repoRoot, 'samples/markitdown/doculens-sample.pdf');
const conversionScriptPath = path.join(repoRoot, 'scripts/markitdown/convert-sample.mjs');
const expectedSampleText = [
  'DocuLens MarkItDown Sample',
  'non-sensitive fixture',
  'retrieval-ready Markdown',
];

async function fileExists(filePath) {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath);
}

async function assertSmokePrerequisites() {
  const missing = [];
  if (!(await fileExists(samplePdfPath))) {
    missing.push(`sample PDF fixture at ${relativePath(samplePdfPath)}`);
  }
  if (!(await fileExists(conversionScriptPath))) {
    missing.push(`conversion script at ${relativePath(conversionScriptPath)}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `MarkItDown smoke prerequisites missing: ${missing.join('; ')}. ` +
        'Add the tiny non-sensitive PDF fixture and conversion script before claiming PR 9 sample conversion support.',
    );
  }
}

function runConversion({ outputMarkdownPath }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      conversionScriptPath,
      '--input',
      samplePdfPath,
      '--output',
      outputMarkdownPath,
    ], {
      cwd: repoRoot,
      env: { ...process.env, DOCULENS_MARKITDOWN_SMOKE: 'true' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(
        `MarkItDown conversion failed with exit code ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`.trim(),
      ));
    });
  });
}

function assertConvertedMarkdownCreatesStableChunks(markdown) {
  const normalized = normalizeDocumentText(markdown);
  for (const expectedText of expectedSampleText) {
    assert.match(
      normalized,
      new RegExp(expectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `converted Markdown should preserve fixture text: ${expectedText}`,
    );
  }

  const firstChunks = chunkDocument({
    documentId: 'markitdown-sample',
    content: normalized,
    maxTokens: 80,
  });
  const repeatedChunks = chunkDocument({
    documentId: 'markitdown-sample',
    content: normalized,
    maxTokens: 80,
  });

  assert.ok(firstChunks.length > 0, 'converted Markdown should create one or more ingestion chunks');
  assert.deepEqual(
    firstChunks.map((chunk) => chunk.chunkIndex),
    firstChunks.map((_, index) => index),
    'chunk indexes should be stable and zero-based for converted Markdown',
  );
  assert.deepEqual(
    firstChunks.map((chunk) => chunk.chunkId),
    repeatedChunks.map((chunk) => chunk.chunkId),
    'chunk IDs should be stable for the same converted Markdown document',
  );
  assert.ok(
    firstChunks.every((chunk) => Array.isArray(chunk.headingPath) && chunk.headingPath.length > 0),
    'each converted Markdown chunk should carry heading metadata for retrieval citations',
  );
  assert.ok(
    firstChunks.every((chunk) => Number.isInteger(chunk.tokenEstimate) && chunk.tokenEstimate > 0),
    'each converted Markdown chunk should carry a positive token estimate',
  );
}

await assertSmokePrerequisites();
const tempDir = await mkdtemp(path.join(tmpdir(), 'doculens-markitdown-'));
try {
  const outputMarkdownPath = path.join(tempDir, 'doculens-sample.md');
  await runConversion({ outputMarkdownPath });
  const markdown = await readFile(outputMarkdownPath, 'utf8');
  assertConvertedMarkdownCreatesStableChunks(markdown);
  console.log('MarkItDown smoke converted the sample PDF into ingestion-ready Markdown chunks.');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
