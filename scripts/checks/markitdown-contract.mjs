#!/usr/bin/env node
import { access } from 'node:fs/promises';

await access(new URL('../../src/client/App.jsx', import.meta.url));
console.log('MarkItDown smoke command is reserved for the PR 9 conversion slice; foundation verified the command wiring without claiming PDF conversion.');
