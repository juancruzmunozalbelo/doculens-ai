import { createHash } from 'node:crypto';
import { normalizeDocumentText } from './normalization.mjs';

const DEFAULT_MAX_TOKENS = 180;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;

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
  let current = { headingPath: ['Untitled'], lines: [] };

  for (const line of lines) {
    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      pushSection(sections, current);
      const level = heading[1].length;
      headingStack.length = Math.max(0, level - 1);
      headingStack[level - 1] = cleanHeading(heading[2]);
      current = {
        headingPath: headingStack.filter(Boolean),
        lines: [line],
      };
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
