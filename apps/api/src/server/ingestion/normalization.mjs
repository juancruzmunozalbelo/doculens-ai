export function normalizeDocumentText(content) {
  if (typeof content !== 'string') {
    throw new TypeError('document content must be a string');
  }

  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
