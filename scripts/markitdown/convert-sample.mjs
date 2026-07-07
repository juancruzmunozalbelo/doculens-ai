#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error('Usage: node scripts/markitdown/convert-sample.mjs --input <pdf> --output <markdown>');
    }
    args.set(key, value);
  }
  return args;
}

function runMarkItDownCli({ input, output }) {
  return new Promise((resolve) => {
    const child = spawn('markitdown', [input, '-o', output], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ ok: false, reason: error.code === 'ENOENT' ? 'markitdown CLI not installed' : error.message });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, reason: code === 0 ? 'markitdown CLI' : stderr.trim() || `markitdown exited ${code}` });
    });
  });
}

function decodePdfLiteral(value) {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

async function convertKnownTextPdf(input) {
  const pdf = await readFile(input, 'latin1');
  const strings = [...pdf.matchAll(/\((?:\\.|[^()\\])*\)\s*Tj/g)]
    .map((match) => decodePdfLiteral(match[0].replace(/\)\s*Tj$/, '').slice(1)))
    .map((line) => line.trim())
    .filter(Boolean);
  if (strings.length === 0) {
    throw new Error('MarkItDown CLI is unavailable and the fallback converter could not extract text from the sample PDF. Install Microsoft MarkItDown with `pip install markitdown[pdf]`.');
  }
  return `# ${strings[0]}\n\n${strings.slice(1).join('\n\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const input = args.get('--input');
const output = args.get('--output');
if (!input || !output) {
  throw new Error('Both --input and --output are required.');
}

await mkdir(path.dirname(output), { recursive: true });
const cliResult = await runMarkItDownCli({ input, output });
if (!cliResult.ok) {
  const markdown = await convertKnownTextPdf(input);
  await writeFile(output, markdown, 'utf8');
  console.error(`Microsoft MarkItDown CLI unavailable (${cliResult.reason}); used deterministic fallback for the committed non-sensitive sample PDF.`);
}
