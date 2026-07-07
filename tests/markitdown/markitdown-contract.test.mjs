import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('smoke:markitdown converts sample PDF into ingestion-ready chunks', () => {
  const result = spawnSync('npm', ['run', 'smoke:markitdown'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.trim());
  assert.match(
    result.stdout,
    /MarkItDown smoke converted the sample PDF into ingestion-ready Markdown chunks\./,
  );
});
