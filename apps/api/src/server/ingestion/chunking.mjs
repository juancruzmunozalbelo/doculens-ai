import { createHash } from 'node:crypto';
import { normalizeDocumentText } from './normalization.mjs';

const DEFAULT_MAX_TOKENS = 180;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;
const KNOWN_ASSESSMENT_HEADINGS = new Map([
  ['full stack ai engineer assessment', { title: 'Full Stack AI Engineer Assessment', level: 1 }],
  ['overview and objective', { title: 'Overview and objective', level: 2 }],
  ['application scope', { title: 'Application scope', level: 2 }],
  ['backend requirements', { title: 'Backend requirements', level: 2 }],
  ['ai and retrieval requirements', { title: 'AI and retrieval requirements', level: 2 }],
  ['frontend requirements', { title: 'Frontend requirements', level: 2 }],
  ['data, privacy, and logging requirements', { title: 'Data, privacy, and logging requirements', level: 2 }],
  ['reliability and evaluation requirements', { title: 'Reliability and evaluation requirements', level: 2 }],
  ['deployment and operations requirements', { title: 'Deployment and operations requirements', level: 2 }],
  ['deliverables', { title: 'Deliverables', level: 2 }],
  ['review rubric markers', { title: 'Review rubric markers', level: 2 }],
]);

const SECTION_KEYWORD_PATTERN = /\b(?:overview|objective|scope|requirements?|deliverables?|rubric|evaluation|reliability|deployment|operations|frontend|backend|privacy|logging|risks?)\b/i;
const NUMBERED_HEADING_PATTERN = /^(?:section\s+)?\d+(?:\.\d+)*[.)]?\s+(.+)$/i;
const BULLET_OR_TABLE_PATTERN = /^\s*(?:[-*•]|\d+[.)]\s+\S.{40,}|\|)/;

function tokenEstimate(content) {
  return String(content).split(/\s+/).filter(Boolean).length;
}

function stableChunkId({ documentId, chunkIndex, headingPath, content }) {
  const hash = createHash('sha256')
    .update(String(documentId))
    .update('\0')
    .update(String(chunkIndex))
    .update('\0')
    .update(headingPath.join('\u001f'))
    .update('\0')
    .update(content)
    .digest('hex')
    .slice(0, 24);
  return `chunk_${hash}`;
}

function cleanHeading(rawHeading) {
  return rawHeading.replace(/\s+/g, ' ').trim();
}

function normalizedHeadingKey(value) {
  return cleanHeading(value).toLowerCase();
}

function isPlainHeadingCandidate(line) {
  const heading = cleanHeading(line);
  if (
    heading === ''
    || heading.length > 96
    || BULLET_OR_TABLE_PATTERN.test(heading)
    || /[.!?;]$/.test(heading)
    || heading.split(/\s+/).length > 10
  ) {
    return false;
  }
  return SECTION_KEYWORD_PATTERN.test(heading);
}

function inferPlainTextHeading(line, { hasMarkdownHeadings, hasRootHeading }) {
  if (hasMarkdownHeadings) {
    return null;
  }

  const heading = cleanHeading(line).replace(/\s*:\s*$/, '');
  const known = KNOWN_ASSESSMENT_HEADINGS.get(normalizedHeadingKey(heading));
  if (known) {
    return known;
  }
  if (!isPlainHeadingCandidate(heading)) {
    return null;
  }

  const numbered = heading.match(NUMBERED_HEADING_PATTERN);
  const numberedTitle = numbered ? cleanHeading(numbered[1]) : '';
  if (numberedTitle && isPlainHeadingCandidate(numberedTitle)) {
    return { title: numberedTitle, level: hasRootHeading ? 2 : 1 };
  }

  if (!hasRootHeading && /\b(?:assessment|document|source|application|project)\b/i.test(heading)) {
    return { title: heading, level: 1 };
  }

  return { title: heading, level: hasRootHeading ? 2 : 1 };
}

function startSection({ sections, current, headingStack, level, title, line }) {
  pushSection(sections, current);
  headingStack.length = Math.max(0, level - 1);
  headingStack[level - 1] = cleanHeading(title);
  return {
    headingPath: headingStack.filter(Boolean),
    lines: [line],
  };
}

function pushSection(sections, section) {
  const content = section.lines.join('\n').trim();
  if (content !== '') {
    sections.push({ headingPath: section.headingPath, content });
  }
}

function parseSections(content) {
  const lines = content.split('\n');
  const sections = [];
  const headingStack = [];
  const hasMarkdownHeadings = lines.some((line) => HEADING_PATTERN.test(line));
  let current = { headingPath: ['Untitled'], lines: [] };

  for (const line of lines) {
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      current = startSection({
        sections,
        current,
        headingStack,
        level: heading[1].length,
        title: heading[2],
        line,
      });
      continue;
    }

    const inferredHeading = inferPlainTextHeading(line, {
      hasMarkdownHeadings,
      hasRootHeading: headingStack.length > 0,
    });
    if (inferredHeading) {
      current = startSection({
        sections,
        current,
        headingStack,
        level: inferredHeading.level,
        title: inferredHeading.title,
        line,
      });
      continue;
    }

    current.lines.push(line);
  }

  pushSection(sections, current);
  return sections;
}

function paragraphsFor(sectionContent) {
  return sectionContent.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function splitSectionContent(sectionContent, maxTokens) {
  const totalTokens = tokenEstimate(sectionContent);
  if (totalTokens <= maxTokens) {
    return [sectionContent];
  }

  const paragraphs = paragraphsFor(sectionContent);
  const chunks = [];
  let pending = [];
  let pendingTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = tokenEstimate(paragraph);
    if (paragraphTokens > maxTokens) {
      if (pending.length > 0) {
        chunks.push(pending.join('\n\n'));
        pending = [];
        pendingTokens = 0;
      }
      const words = paragraph.split(/\s+/).filter(Boolean);
      for (let index = 0; index < words.length; index += maxTokens) {
        chunks.push(words.slice(index, index + maxTokens).join(' '));
      }
      continue;
    }

    if (pendingTokens > 0 && pendingTokens + paragraphTokens > maxTokens) {
      chunks.push(pending.join('\n\n'));
      pending = [];
      pendingTokens = 0;
    }
    pending.push(paragraph);
    pendingTokens += paragraphTokens;
  }

  if (pending.length > 0) {
    chunks.push(pending.join('\n\n'));
  }

  return chunks;
}

export function chunkDocument({ documentId, content, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  if (typeof documentId !== 'string' || documentId.trim() === '') {
    throw new Error('documentId is required for chunking');
  }
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    throw new Error('maxTokens must be a positive integer');
  }

  const normalized = normalizeDocumentText(content ?? '');
  if (normalized === '') {
    return [];
  }

  const chunks = [];
  for (const section of parseSections(normalized)) {
    for (const chunkContent of splitSectionContent(section.content, maxTokens)) {
      const chunkIndex = chunks.length;
      const boundedTokenEstimate = tokenEstimate(chunkContent);
      chunks.push({
        chunkId: stableChunkId({ documentId, chunkIndex, headingPath: section.headingPath, content: chunkContent }),
        chunkIndex,
        headingPath: [...section.headingPath],
        content: chunkContent,
        tokenEstimate: boundedTokenEstimate,
      });
    }
  }

  return chunks;
}
