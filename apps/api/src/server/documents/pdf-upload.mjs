import Busboy from 'busboy';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const DEFAULT_PDF_UPLOAD_LIMITS = Object.freeze({
  maxFileBytes: 5 * 1024 * 1024,
  maxPages: 20,
  conversionTimeoutMs: 15_000,
  maxExtractedChars: 120_000,
  maxMultipartOverheadBytes: 64 * 1024,
});

const PDF_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
]);

const ACTIVE_CONTENT_PATTERNS = [
  /\/OpenAction\b/i,
  /\/AA\b/i,
  /\/JavaScript\b/i,
  /\/JS\b/i,
  /\/Launch\b/i,
  /\/EmbeddedFile\b/i,
  /\/RichMedia\b/i,
  /\/XFA\b/i,
];

const MAX_SAFE_BASENAME_LENGTH = 96;
const SECRET_SHAPED_FILENAME = /\b(api[_-]?key|secret|token|password|passwd|credential|private[_-]?key|aws[_-]?access[_-]?key|session[_-]?id)\b|(?:sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{8,}/i;

export class PdfUploadError extends Error {
  constructor(message, { statusCode = 400, code = 'pdf_upload_failed', category } = {}) {
    super(message);
    this.name = 'PdfUploadError';
    this.statusCode = statusCode;
    this.code = code;
    this.category = category ?? pdfFailureCategory(code, statusCode);
  }
}

export function isPdfUploadError(error) {
  return error instanceof PdfUploadError;
}

function pdfFailureCategory(code, statusCode) {
  if (statusCode === 413 || /too_large|too_many_pages|request_too_large|file_too_large|text_too_large/i.test(String(code))) {
    return 'oversized';
  }
  if (/unsupported|magic_mismatch|malformed|converter_rejected|active_content/i.test(String(code))) {
    return 'unsupported_or_mismatch';
  }
  if (/encrypted|protected|no_text|unprocessable/i.test(String(code))) {
    return 'unreadable_or_protected';
  }
  if (statusCode === 503 || /unavailable|timeout|backend|processing/i.test(String(code))) {
    return 'processing_failed';
  }
  return 'invalid_request';
}

export function pdfUploadErrorPayload(error) {
  return {
    error: error.message,
    code: error.code,
    category: error.category ?? pdfFailureCategory(error.code, error.statusCode),
  };
}

function safeLimitValue(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizePdfUploadLimits(limits = {}) {
  return Object.freeze({
    maxFileBytes: safeLimitValue(limits.maxFileBytes, DEFAULT_PDF_UPLOAD_LIMITS.maxFileBytes),
    maxPages: safeLimitValue(limits.maxPages, DEFAULT_PDF_UPLOAD_LIMITS.maxPages),
    conversionTimeoutMs: safeLimitValue(limits.conversionTimeoutMs, DEFAULT_PDF_UPLOAD_LIMITS.conversionTimeoutMs),
    maxExtractedChars: safeLimitValue(limits.maxExtractedChars, DEFAULT_PDF_UPLOAD_LIMITS.maxExtractedChars),
    maxMultipartOverheadBytes: safeLimitValue(
      limits.maxMultipartOverheadBytes,
      DEFAULT_PDF_UPLOAD_LIMITS.maxMultipartOverheadBytes,
    ),
  });
}

function badRequest(message, code = 'pdf_bad_request') {
  return new PdfUploadError(message, { statusCode: 400, code });
}

function uploadTooLarge(message, code = 'pdf_upload_too_large') {
  return new PdfUploadError(message, { statusCode: 413, code });
}

function unsupportedPdf(message, code = 'pdf_unsupported_type') {
  return new PdfUploadError(message, { statusCode: 415, code });
}

function unprocessablePdf(message, code = 'pdf_unprocessable') {
  return new PdfUploadError(message, { statusCode: 422, code });
}

function converterUnavailable(message = 'PDF reading is temporarily unavailable. Try again or paste the document text instead.', code = 'pdf_converter_unavailable') {
  return new PdfUploadError(message, { statusCode: 503, code, category: 'processing_failed' });
}

function headerValue(headers, name) {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isMultipartPdfUpload(contentType) {
  return typeof contentType === 'string' && /^multipart\/form-data\s*;/i.test(contentType);
}

function ensureDeclaredLengthWithinLimit(headers, limits) {
  const contentLength = headerValue(headers, 'content-length');
  if (typeof contentLength !== 'string' || contentLength.trim() === '') {
    return;
  }
  const declaredBytes = Number(contentLength);
  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
    throw badRequest('Malformed upload request.', 'pdf_bad_content_length');
  }
  if (declaredBytes > limits.maxFileBytes + limits.maxMultipartOverheadBytes) {
    throw uploadTooLarge('PDF uploads are limited to 5 MiB.', 'pdf_request_too_large');
  }
}

function normalizeDisplayText(value) {
  let normalized = String(value ?? '');
  try {
    normalized = normalized.normalize('NFKC');
  } catch {
    // Keep the original string when ICU normalization is unavailable.
  }
  return normalized
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateMiddle(value, maxLength = MAX_SAFE_BASENAME_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }
  const keep = Math.max(12, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(value.length - keep)}`;
}

function splitPdfExtension(basename) {
  return /\.pdf$/i.test(basename)
    ? { stem: basename.slice(0, -4), extension: '.pdf' }
    : { stem: basename, extension: '' };
}

export function sanitizeOriginalPdfBasename(filename) {
  const pathless = normalizeDisplayText(filename)
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.' && segment !== '..' && !segment.startsWith('.'))
    .pop();
  const candidate = normalizeDisplayText(pathless || 'uploaded-document.pdf')
    .replace(/[\\/]/g, ' ')
    .replace(/^\.+/, '')
    .trim();
  const { stem, extension } = splitPdfExtension(candidate || 'uploaded-document.pdf');
  const safeStem = normalizeDisplayText(stem)
    .replace(/[^\p{L}\p{N} ._()[\]-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const basename = `${safeStem || 'uploaded-document'}${extension || '.pdf'}`;
  if (SECRET_SHAPED_FILENAME.test(basename)) {
    return 'redacted-filename.pdf';
  }
  return truncateMiddle(basename);
}

function sanitizeTitle(value) {
  return normalizeDisplayText(value).slice(0, 160);
}

function titleFromFilename(filename) {
  const safeBasename = sanitizeOriginalPdfBasename(filename);
  const { stem } = splitPdfExtension(safeBasename);
  return sanitizeTitle(stem) || 'Uploaded PDF';
}

function extensionIsPdf(filename) {
  const pathless = normalizeDisplayText(filename).split(/[\\/]+/).pop() ?? '';
  return /\.pdf$/i.test(pathless);
}

function contentTypeIsPdf(mimeType) {
  return PDF_CONTENT_TYPES.has(String(mimeType || '').toLowerCase());
}

async function readMagicBytes(filePath, length = 8) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function assertPdfLooksSafeForConversion({ filePath, filename, mimeType, limits }) {
  if (!contentTypeIsPdf(mimeType) || !extensionIsPdf(filename)) {
    throw unsupportedPdf('Only PDF uploads are supported. Paste document text for other file types.');
  }

  const magic = await readMagicBytes(filePath);
  if (!magic.toString('latin1').startsWith('%PDF-')) {
    throw unsupportedPdf('The uploaded file does not look like a PDF. Paste document text instead.', 'pdf_magic_mismatch');
  }

  const bytes = await readFile(filePath);
  const latin1 = bytes.toString('latin1');
  if (/\/Encrypt\b/i.test(latin1)) {
    throw unprocessablePdf('Password-protected or encrypted PDFs are not supported in this demo.', 'pdf_encrypted');
  }
  if (ACTIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(latin1))) {
    throw unprocessablePdf('This PDF contains unsupported active content. Paste document text instead.', 'pdf_active_content');
  }

  const detectablePages = [...latin1.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length;
  if (detectablePages > limits.maxPages) {
    throw uploadTooLarge('PDF uploads are limited to 20 pages.', 'pdf_too_many_pages');
  }
}

export async function cleanupPdfUpload(upload) {
  if (!upload?.tempDir) {
    return;
  }
  await rm(upload.tempDir, { recursive: true, force: true });
}

export async function parsePdfUploadMultipart(request, { limits: rawLimits, tempRoot } = {}) {
  const limits = normalizePdfUploadLimits(rawLimits);
  const contentType = headerValue(request.headers, 'content-type');
  if (!isMultipartPdfUpload(contentType)) {
    throw unsupportedPdf('Upload a PDF using multipart/form-data.', 'pdf_multipart_required');
  }
  ensureDeclaredLengthWithinLimit(request.headers, limits);

  const root = tempRoot ? path.resolve(tempRoot) : tmpdir();
  const tempDir = await mkdtemp(path.join(root, 'doculens-pdf-upload-'));
  let tempPath;
  let fileCount = 0;
  let fileSize = 0;
  let title;
  let fileInfo;
  let pendingError;
  const writePromises = [];

  function rememberError(error) {
    if (!pendingError) {
      pendingError = error instanceof PdfUploadError ? error : badRequest('Malformed upload request.', 'pdf_malformed_multipart');
    }
  }

  try {
    await new Promise((resolve, reject) => {
      let busboy;
      try {
        busboy = Busboy({
          headers: request.headers,
          limits: {
            fileSize: limits.maxFileBytes,
            files: 2,
            fields: 2,
            fieldSize: 256,
            parts: 4,
          },
        });
      } catch {
        reject(badRequest('Malformed upload request.', 'pdf_malformed_multipart'));
        return;
      }

      busboy.on('field', (name, value) => {
        if (name === 'title') {
          title = sanitizeTitle(value);
        }
      });

      busboy.on('file', (name, file, info) => {
        fileCount += 1;
        if (name !== 'file' || fileCount > 1) {
          rememberError(badRequest('Upload exactly one PDF file.', 'pdf_multiple_files'));
          file.resume();
          return;
        }

        fileInfo = {
          filename: info.filename,
          mimeType: info.mimeType,
        };
        tempPath = path.join(tempDir, `${randomUUID()}.pdf`);
        const output = createWriteStream(tempPath, { flags: 'wx' });
        writePromises.push(new Promise((writeResolve, writeReject) => {
          output.on('finish', writeResolve);
          output.on('error', writeReject);
        }));

        file.on('data', (chunk) => {
          fileSize += chunk.length;
        });
        file.on('limit', () => {
          const error = uploadTooLarge('PDF uploads are limited to 5 MiB.', 'pdf_file_too_large');
          rememberError(error);
          output.destroy();
          file.resume();
          reject(error);
        });
        file.on('error', () => {
          rememberError(badRequest('Malformed upload request.', 'pdf_malformed_multipart'));
        });
        file.pipe(output);
      });

      busboy.on('filesLimit', () => {
        rememberError(badRequest('Upload exactly one PDF file.', 'pdf_multiple_files'));
      });
      busboy.on('fieldsLimit', () => {
        rememberError(badRequest('Too many upload fields.', 'pdf_too_many_fields'));
      });
      busboy.on('partsLimit', () => {
        rememberError(badRequest('Too many upload parts.', 'pdf_too_many_parts'));
      });
      busboy.on('error', () => {
        reject(badRequest('Malformed upload request.', 'pdf_malformed_multipart'));
      });
      busboy.on('finish', resolve);
      busboy.on('close', resolve);
      request.on('error', () => {
        reject(badRequest('Malformed upload request.', 'pdf_malformed_multipart'));
      });
      request.pipe(busboy);
    });

    const writeResults = await Promise.allSettled(writePromises);
    const writeFailure = writeResults.find((result) => result.status === 'rejected');
    if (pendingError) {
      throw pendingError;
    }
    if (writeFailure) {
      throw badRequest('Malformed upload request.', 'pdf_malformed_multipart');
    }
    if (fileCount === 0 || !tempPath || !fileInfo) {
      throw badRequest('Upload exactly one PDF file.', 'pdf_missing_file');
    }
    if (fileSize <= 0) {
      throw badRequest('The uploaded PDF is empty.', 'pdf_empty_file');
    }

    await assertPdfLooksSafeForConversion({ filePath: tempPath, ...fileInfo, limits });

    const safeOriginalBasename = sanitizeOriginalPdfBasename(fileInfo.filename);
    return {
      tempDir,
      path: tempPath,
      title: title || titleFromFilename(safeOriginalBasename),
      originalFilename: safeOriginalBasename,
      originalBasename: safeOriginalBasename,
      safeOriginalBasename,
      mimeType: String(fileInfo.mimeType || '').toLowerCase(),
      sizeBytes: fileSize,
      sourceMethod: 'pdf_upload',
      uploadedAt: new Date().toISOString(),
      limits,
    };
  } catch (error) {
    await cleanupPdfUpload({ tempDir });
    throw error;
  }
}

function killConverterProcess(child) {
  if (!child?.pid) {
    return;
  }
  try {
    if (process.platform !== 'win32') {
      process.kill(-child.pid, 'SIGKILL');
      return;
    }
  } catch {
    // Fall through to killing the direct child below.
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // Best-effort timeout cleanup only.
  }
}

async function readConvertedText(outputPath) {
  try {
    return await readFile(outputPath, 'utf8');
  } catch {
    return '';
  }
}

export function createMarkItDownPdfConverter({ command = process.env.DOCULENS_MARKITDOWN_COMMAND || 'markitdown' } = {}) {
  return {
    async convert({ inputPath, outputPath, timeoutMs }) {
      await new Promise((resolve, reject) => {
        const child = spawn(command, [inputPath, '-o', outputPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          killConverterProcess(child);
        }, timeoutMs);

        child.stdout?.resume();
        child.stderr?.resume();
        child.on('error', (error) => {
          clearTimeout(timeout);
          if (error?.code === 'ENOENT') {
            reject(converterUnavailable());
            return;
          }
          reject(converterUnavailable());
        });
        child.on('close', (code) => {
          clearTimeout(timeout);
          if (timedOut) {
            reject(converterUnavailable('PDF reading timed out. Try again or paste the document text instead.', 'pdf_converter_timeout'));
            return;
          }
          if (code !== 0) {
            reject(unprocessablePdf('This PDF could not be read. Choose another PDF or paste the document text instead.', 'pdf_converter_rejected'));
            return;
          }
          resolve();
        });
      });
      return await readConvertedText(outputPath);
    },
  };
}

async function callPdfConverter(converter, payload) {
  if (typeof converter === 'function') {
    return await converter(payload);
  }
  if (converter && typeof converter.convert === 'function') {
    return await converter.convert(payload);
  }
  throw converterUnavailable();
}

function normalizeConverterResult(result) {
  if (typeof result === 'string') {
    return result;
  }
  if (Buffer.isBuffer(result)) {
    return result.toString('utf8');
  }
  if (result && typeof result.text === 'string') {
    return result.text;
  }
  if (result && typeof result.markdown === 'string') {
    return result.markdown;
  }
  return '';
}

function ensureUsableExtractedText(text, limits) {
  if (text.length > limits.maxExtractedChars) {
    throw uploadTooLarge('The readable PDF text is outside the supported limits.', 'pdf_text_too_large');
  }
  const visibleText = text.replace(/[#*_`~>\-\s]/g, '').trim();
  if (visibleText.length < 8 || !/[A-Za-z0-9]/.test(visibleText)) {
    throw unprocessablePdf('This PDF could not be read. Choose another PDF or paste the document text instead.', 'pdf_no_text');
  }
}

export async function convertPdfUploadToText({ upload, converter, limits: rawLimits } = {}) {
  if (!upload?.path || !upload?.tempDir) {
    throw badRequest('Upload exactly one PDF file.', 'pdf_missing_file');
  }
  const limits = normalizePdfUploadLimits(rawLimits ?? upload.limits);
  const outputPath = path.join(upload.tempDir, `${randomUUID()}.md`);
  let result;
  try {
    result = await callPdfConverter(converter ?? createMarkItDownPdfConverter(), {
      inputPath: upload.path,
      outputPath,
      timeoutMs: limits.conversionTimeoutMs,
      maxExtractedChars: limits.maxExtractedChars,
      maxFileBytes: limits.maxFileBytes,
      maxPages: limits.maxPages,
    });
  } catch (error) {
    if (error instanceof PdfUploadError) {
      throw error;
    }
    if (error?.statusCode === 503 || /unavailable|enoent|not\s+found|missing|CONVERTER_UNAVAILABLE/i.test(String(error?.code ?? error?.message ?? ''))) {
      throw converterUnavailable();
    }
    if (error?.statusCode === 413) {
      throw uploadTooLarge('The readable PDF text is outside the supported limits.', 'pdf_text_too_large');
    }
    throw unprocessablePdf('This PDF could not be read. Choose another PDF or paste the document text instead.', 'pdf_converter_rejected');
  }

  const text = normalizeConverterResult(result) || await readConvertedText(outputPath);
  ensureUsableExtractedText(text, limits);
  return text;
}
