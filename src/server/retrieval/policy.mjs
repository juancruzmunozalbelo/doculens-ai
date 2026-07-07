import { DEFAULT_RELEVANCE_THRESHOLD, buildScoreSummary } from './utils.mjs';

const GLOBAL_QUESTION_PATTERNS = [
  /\b(entire|whole|overall)\b/i,
  /\bsummar(?:y|ize|ise|ization|isation)\b/i,
  /\bcompare\b/i,
  /\ball\s+(?:party|parties|obligations?|sections?|terms?)\b/i,
  /\bfull\s+document\b/i,
];

const OUTSIDE_DOCUMENT_PATTERNS = [
  /\bstock\s+price\b/i,
  /\bshare\s+price\b/i,
  /\bweather\b/i,
  /\bnews\b/i,
  /\bmarket\s+cap\b/i,
  /\breal[-\s]?time\b/i,
  /\b(?:current|today|latest)\b.*\b(?:stock|share|market|weather|news|price)\b/i,
];

function isGlobalQuestion(question) {
  return GLOBAL_QUESTION_PATTERNS.some((pattern) => pattern.test(String(question ?? '')));
}

function isOutsideDocumentQuestion(question) {
  return OUTSIDE_DOCUMENT_PATTERNS.some((pattern) => pattern.test(String(question ?? '')));
}

export function decideRetrievalStrategy({
  question,
  retrievalBackend,
  retrievedChunks = [],
  relevanceThreshold = DEFAULT_RELEVANCE_THRESHOLD,
} = {}) {
  const retrievalScoreSummary = buildScoreSummary({ retrievedChunks, relevanceThreshold });

  if (isOutsideDocumentQuestion(question)) {
    return {
      contextStrategy: 'unsupported',
      fallbackReason: null,
      unsupportedReason: 'outside_document_scope',
      retrievalBackend,
      retrievalScoreSummary,
    };
  }

  if (isGlobalQuestion(question)) {
    return {
      contextStrategy: 'fallback',
      fallbackReason: 'global_question',
      unsupportedReason: null,
      retrievalBackend,
      retrievalScoreSummary,
    };
  }

  if (retrievalScoreSummary.passingChunks > 0) {
    return {
      contextStrategy: 'rag',
      fallbackReason: null,
      unsupportedReason: null,
      retrievalBackend,
      retrievalScoreSummary,
    };
  }

  return {
    contextStrategy: 'fallback',
    fallbackReason: 'low_retrieval_coverage',
    unsupportedReason: null,
    retrievalBackend,
    retrievalScoreSummary,
  };
}
