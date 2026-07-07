#!/usr/bin/env node
import { runPsql, applySqlFiles, repoRoot } from './lib.mjs';
import path from 'node:path';

runPsql(path.join(repoRoot, 'db/reset.sql'));
await applySqlFiles('db/migrations');
console.log('PostgreSQL database reset and migrated.');
