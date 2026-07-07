#!/usr/bin/env node
import { access } from 'node:fs/promises';

await access(new URL('../../index.html', import.meta.url));
await access(new URL('../../src/client/App.jsx', import.meta.url));
await access(new URL('../../src/client/main.jsx', import.meta.url));
console.log('E2E contract verified React app entry points for the foundation scaffold.');
