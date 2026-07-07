#!/usr/bin/env node
import { applySqlFiles } from './lib.mjs';

await applySqlFiles('db/migrations');
console.log('PostgreSQL migrations applied.');
