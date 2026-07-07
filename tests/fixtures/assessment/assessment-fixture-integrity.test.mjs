import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureDir, '../../..');
const manifestPath = path.join(fixtureDir, 'manifest.json');
const goldenAssertionsPath = path.join(fixtureDir, 'golden-assertions.json');

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

test('assessment PDF and extracted text fixtures match manifest integrity contract', async () => {
  const manifest = await readJson(manifestPath);
  const pdfPath = path.join(repoRoot, manifest.files.pdf.path);
  const textPath = path.join(repoRoot, manifest.files.extractedText.path);
  const pdf = await readFile(pdfPath);
  const text = await readFile(textPath, 'utf8');

  assert.equal(sha256(pdf), manifest.files.pdf.sha256);
  assert.equal(pdf.length, manifest.files.pdf.sizeBytes);
  assert.equal(sha256(Buffer.from(text, 'utf8')), manifest.files.extractedText.sha256);
  assert.equal(Buffer.byteLength(text, 'utf8'), manifest.files.extractedText.sizeBytes);

  for (const marker of manifest.titleMarkers) {
    assert.ok(text.includes(marker), `missing fixture marker: ${marker}`);
  }

  for (const snippet of manifest.pageTextSnippets) {
    assert.ok(text.includes(snippet), `missing fixture snippet: ${snippet}`);
  }

  assert.equal(manifest.sourceMetadataExpectations.safeOriginalBasename, 'full-stack-ai-engineer-assessment.pdf');
  assert.equal(manifest.sourceMetadataExpectations.mimeType, 'application/pdf');
  assert.equal(manifest.sourceMetadataExpectations.sizeBytes, pdf.length);
});

test('assessment text fixture chunks into the expected golden-path coverage', async () => {
  const manifest = await readJson(manifestPath);
  const text = await readFile(path.join(repoRoot, manifest.files.extractedText.path), 'utf8');
  const { chunkDocument } = await import(new URL(path.join(repoRoot, 'apps/api/src/server/ingestion/chunking.mjs'), import.meta.url));
  const chunks = chunkDocument({ documentId: 'assessment-fixture-contract', content: text });

  assert.ok(
    chunks.length >= manifest.chunkingExpectations.minimumChunkCount,
    `expected at least ${manifest.chunkingExpectations.minimumChunkCount} chunks, received ${chunks.length}`,
  );

  const headingPaths = chunks.map((chunk) => chunk.headingPath.join(' > '));
  for (const expectedPath of manifest.chunkingExpectations.expectedHeadingPaths) {
    assert.ok(headingPaths.includes(expectedPath.join(' > ')), `missing chunk heading path ${expectedPath.join(' > ')}`);
  }
});

test('golden assessment assertions cover required reviewer questions safely', async () => {
  const golden = await readJson(goldenAssertionsPath);
  const requiredKeys = ['overview', 'backend', 'frontend', 'dataPrivacy', 'reliabilityEvaluation', 'deployment', 'deliverables'];

  for (const key of requiredKeys) {
    assert.ok(golden.chatGoldenQuestions[key], `missing golden question: ${key}`);
    assert.ok(golden.chatGoldenQuestions[key].question);
    assert.ok(golden.chatGoldenQuestions[key].mustMention.length > 0);
    assert.ok(golden.chatGoldenQuestions[key].mustNotMatch.includes('```json'));
  }

  assert.ok(golden.unsupportedQuestions.length >= 2);
  assert.ok(golden.unsupportedQuestions.every((entry) => entry.expectedDisplayStateKinds.includes('unsupported') || entry.expectedDisplayStateKinds.includes('insufficient_evidence')));
  assert.ok(golden.analysis.recommendedQuestions.length >= requiredKeys.length);
});
