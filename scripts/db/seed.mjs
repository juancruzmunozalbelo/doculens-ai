#!/usr/bin/env node
import { applySqlFiles } from './lib.mjs';

await applySqlFiles('db/seeds');
console.log('PostgreSQL demo seed applied.');
