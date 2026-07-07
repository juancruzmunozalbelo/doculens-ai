#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { loadServerConfig } from '../../src/server/config/env.mjs';

const migrations = (await readdir(new URL('../../db/migrations/', import.meta.url))).filter((name) => name.endsWith('.sql'));
if (migrations.length === 0) {
  throw new Error('Expected at least one PostgreSQL migration file.');
}

if (process.env.DOCULENS_REQUIRE_DATABASE_FOR_CHECKS === 'true') {
  loadServerConfig(process.env);
  console.log('Integration contract has PostgreSQL runtime configuration.');
} else {
  console.log('Integration contract verified migration wiring; set DOCULENS_REQUIRE_DATABASE_FOR_CHECKS=true to require live PostgreSQL configuration.');
}
