#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { redactSecrets } from '../../src/server/security/redact.mjs';

const migration = await readFile(new URL('../../db/migrations/001_foundation_schema.sql', import.meta.url), 'utf8');
for (const token of ['documents', 'document_chunks', 'chat_messages', 'message_citations', 'ai_prompts']) {
  if (!migration.includes(token)) {
    throw new Error(`Foundation eval expected migration token: ${token}`);
  }
}

const canary = 'foundation_eval_secret_canary';
if (redactSecrets(`secret=${canary}`, [canary]).includes(canary)) {
  throw new Error('Foundation eval redaction canary leaked.');
}

console.log('Foundation eval verified migration metadata and redaction canary. Live MiniMax eval remains scoped to the later eval slice.');
