export const AI_PROVIDER_CONTRACT = Object.freeze({
  methods: Object.freeze(['answerQuestion', 'analyzeDocument']),
  separates: Object.freeze(['prompt construction', 'model invocation', 'response post-processing']),
});

export function assertAIProvider(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new Error('AIProvider implementation is required');
  }
  for (const method of AI_PROVIDER_CONTRACT.methods) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`AIProvider must implement ${method}`);
    }
  }
  return provider;
}
