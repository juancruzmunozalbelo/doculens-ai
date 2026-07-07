#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { startServer } from '../apps/api/src/server/index.mjs';

const args = new Set(process.argv.slice(2));
const apiOnly = args.has('--api-only') || process.env.DOCULENS_API_ONLY === 'true';

const server = startServer(process.env);

if (!apiOnly) {
  const vite = spawn('npm', ['run', 'dev', '--workspace', 'apps/web'], {
    stdio: 'inherit',
    env: process.env,
  });
  const stop = () => {
    vite.kill('SIGTERM');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  vite.on('exit', (code) => {
    server.close(() => process.exit(code ?? 0));
  });
}
