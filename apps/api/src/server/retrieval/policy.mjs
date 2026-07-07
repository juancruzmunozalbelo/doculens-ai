import { DEFAULT_RELEVANCE_THRESHOLD, buildScoreSummary, lexicalTerms } from './utils.mjs';

const GLOBAL_QUESTION_PATTERNS = [
  /\b(entire|whole|overall)\b/i,
  /\bsummar(?:y|ize|ise|ization|isation)\b/i,
  /\bcompare\b/i,
  /\ball\s+(?:party|parties|obligations?|sections?|terms?|requirements?|deliverables?)\b/i,
  /\bfull\s+document\b/i,
  /\bwhat\s+(?:is|does)\s+(?:this|the)\s+(?:document|source|file|pdf)\s+(?:about|cover|contain)\b/i,
  /\bwhat'?s\s+(?:this|the)\s+(?:document|source|file|pdf)\s+about\b/i,
  /\b(?:document|source|file|pdf)\s+overview\b/i,
  /\boverview\s+of\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
  /\b(?:tell|walk)\s+me\s+(?:about|through)\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
  /\b(?:main|key)\s+(?:points|ideas|themes|takeaways)\b/i,
  /\b(?:purpose|scope)\s+of\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
  /\b(?:main|key|primary|core)\s+(?:requirements?|deliverables?|risks?|obligations?|expectations?)\b/i,
  /\bwhat\s+(?:are|were)\s+(?:the\s+)?(?:main|key|primary|core)?\s*(?:requirements?|deliverables?|risks?|obligations?|expectations?)\s+(?:in|from|for|of)\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
  /\bwhat\s+(?:deliverables?|requirements?|risks?|obligations?|expectations?)\s+does\s+(?:this|the)\s+(?:document|source|file|pdf)\s+(?:request|require|list|mention|describe|include)\b/i,
  /\bwhat\s+does\s+(?:this|the)\s+(?:document|source|file|pdf)\s+(?:require|request|ask|expect|need)\b/i,
  /\bwhat\s+is\s+(?:required|requested|expected|needed|asked)\s+(?:by|from|for|of)\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
  /\b(?:summarize|summarise|list|identify|extract)\s+(?:the\s+)?(?:requirements?|deliverables?|risks?|obligations?|expectations?)\s+(?:in|from|for|of)\s+(?:this|the)\s+(?:document|source|file|pdf)\b/i,
];

const OUTSIDE_DOCUMENT_PATTERNS = [
  /\bstock\s+price\b/i,
  /\bshare\s+price\b/i,
  /\bweather\b|\bclima\b/i,
  /\bnews\b/i,
  /\bmarket\s+cap\b/i,
  /\bcapital\s+of\b/i,
  /\bwho\s+won\b/i,
  /\breal[-\s]?time\b/i,
  /\b(?:current|today|latest)\b.*\b(?:stock|share|market|weather|news|clima)\b/i,
];

const SOURCE_ANCHOR_PATTERN = /\b(?:this|the)\s+(?:assessment|document|source|file|pdf)\b|\b(?:in|from|within|according\s+to)\s+(?:this|the)\s+(?:assessment|document|source|file|pdf)\b/i;

const QUESTION_INTENT_TERMS = new Set([
  'what',
  'whats',
  'which',
  'who',
  'where',
  'when',
  'list',
  'show',
  'tell',
  'describe',
  'explain',
  'identify',
  'extract',
  'summarize',
  'summarise',
]);

const TOPIC_STOPWORDS = new Set([
  'what',
  'whats',
  'which',
  'who',
  'where',
  'when',
  'does',
  'this',
  'that',
  'the',
  'and',
  'for',
  'candidate',
  'company',
  'offer',
  'from',
  'with',
  'list',
  'show',
  'tell',
  'about',
  'source',
  'document',
  'file',
  'pdf',
  'are',
  'is',
  'was',
  'should',
  'could',
  'would',
  'were',
  'expected',
  'required',
  'requested',
  'needed',
  'necessary',
]);

function isQuestionLike(question) {
  const terms = lexicalTerms(question);
  return String(question ?? '').trim().endsWith('?') || terms.some((term) => QUESTION_INTENT_TERMS.has(term));
}

function topicTerms(question) {
  return lexicalTerms(question).filter((term) => !TOPIC_STOPWORDS.has(term));
}

function textForDocumentMatch({ document, retrievedChunks = [] } = {}) {
  const documentText = [
    document?.title,
    document?.content,
    document?.text,
    document?.summary,
    document?.description,
    ...retrievedChunks.flatMap((chunk) => [
      chunk?.content,
      chunk?.contentExcerpt,
      Array.isArray(chunk?.headingPath) ? chunk.headingPath.join(' ') : chunk?.headingPath,
    ]),
  ];
  return documentText.filter((value) => typeof value === 'string' && value.trim() !== '').join('\n');
}

function documentContainsQuestionTopic({ question, document, retrievedChunks }) {
  if (!isQuestionLike(question)) {
    return false;
  }
  const topics = topicTerms(question);
  if (topics.length === 0) {
    return false;
  }
  const documentTerms = new Set(lexicalTerms(textForDocumentMatch({ document, retrievedChunks })));
  return topics.some((term) => documentTerms.has(term));
}

function isExplicitSourceQuestion(question) {
  return SOURCE_ANCHOR_PATTERN.test(String(question ?? ''));
}

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
  document = null,
} = {}) {
  const retrievalScoreSummary = buildScoreSummary({ retrievedChunks, relevanceThreshold });
  const explicitSourceQuestion = isExplicitSourceQuestion(question);

  if (isOutsideDocumentQuestion(question) && !explicitSourceQuestion) {
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

  if (documentContainsQuestionTopic({ question, document, retrievedChunks })) {
    return {
      contextStrategy: 'fallback',
      fallbackReason: 'global_question',
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
