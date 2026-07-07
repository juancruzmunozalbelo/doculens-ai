import { buildPromptMessages } from './builder.mjs';

export const PROMPT_VERSION = '2026-07-07.1';

const DEFINITIONS = new Map([
  ['doculens.analysis', {
    id: 'doculens.analysis',
    version: PROMPT_VERSION,
    description: 'DocuLens document analysis prompt for structured summaries, sections, requirements, deliverables, risks, uncertainties, and reviewer questions.',
    build: (input) => buildPromptMessages({ ...input, promptId: 'doculens.analysis', promptVersion: input?.promptVersion ?? PROMPT_VERSION }),
  }],
  ['doculens.chat', {
    id: 'doculens.chat',
    version: PROMPT_VERSION,
    description: 'DocuLens document chat prompt for grounded answers with citations.',
    build: (input) => buildPromptMessages({ ...input, promptId: 'doculens.chat', promptVersion: input?.promptVersion ?? PROMPT_VERSION }),
  }],
  ['doculens.fallback', {
    id: 'doculens.fallback',
    version: PROMPT_VERSION,
    description: 'DocuLens fallback prompt for explicit low-coverage document reasoning with uncertainty.',
    build: (input) => buildPromptMessages({ ...input, promptId: 'doculens.fallback', promptVersion: input?.promptVersion ?? PROMPT_VERSION }),
  }],
  ['doculens.unsupported', {
    id: 'doculens.unsupported',
    version: PROMPT_VERSION,
    description: 'DocuLens unsupported-answer prompt for refusing document-unsupported requests.',
    build: (input) => buildPromptMessages({ ...input, promptId: 'doculens.unsupported', promptVersion: input?.promptVersion ?? PROMPT_VERSION }),
  }],
  ['doculens.prompt_injection', {
    id: 'doculens.prompt_injection',
    version: PROMPT_VERSION,
    description: 'DocuLens prompt safety guardrail prompt for treating document instructions as untrusted evidence.',
    build: (input) => buildPromptMessages({ ...input, promptId: 'doculens.prompt_injection', promptVersion: input?.promptVersion ?? PROMPT_VERSION }),
  }],
]);

export function getPromptDefinition(promptId) {
  const definition = DEFINITIONS.get(promptId);
  if (!definition) {
    throw new Error(`Unknown prompt id: ${promptId}`);
  }
  return Object.freeze({ ...definition });
}

export function listPromptDefinitions() {
  return Array.from(DEFINITIONS.values()).map((definition) => Object.freeze({ ...definition }));
}
