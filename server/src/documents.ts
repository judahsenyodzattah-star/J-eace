import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_DOCUMENT_PIXELS = 24_000_000;

export type SupportedImageMime = 'image/jpeg' | 'image/png';
export type ComparisonState = 'MATCH' | 'MISMATCH' | 'NOT_EXTRACTED' | 'NOT_PROVIDED';
export type ComparisonStatus = 'MATCH' | 'MISMATCH' | 'INCOMPLETE' | 'NOT_COMPARED';

export interface ImageInspection {
  mediaType: SupportedImageMime;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface ExpectedTransaction {
  amount?: string;
  currency?: string;
  reference?: string;
}

export interface FieldComparison {
  status: ComparisonState;
  expected: string | null;
  observed: string | null;
}

export interface BankDocumentAnalysis {
  id: string;
  documentType: 'transfer_receipt';
  analyzedAt: string;
  file: ImageInspection & { sha256: string };
  metadata: {
    exifPresent: boolean;
    captureTime: string | null;
    cameraMake: string | null;
    cameraModel: string | null;
    software: string | null;
    orientation: string | number | null;
    gpsRead: false;
  };
  ocr: {
    engine: 'tesseract.js';
    language: 'eng';
    confidence: number;
    text: string;
  };
  extractedFields: {
    amount: string | null;
    currency: string | null;
    reference: string | null;
    date: string | null;
  };
  comparisons: {
    amount: FieldComparison;
    currency: FieldComparison;
    reference: FieldComparison;
  };
  comparisonStatus: ComparisonStatus;
  humanReviewRequired: true;
  forensicAssessment: 'NOT_PERFORMED';
  reviewReasons: string[];
}

export interface BankDocumentAnalysisInput {
  buffer: Buffer;
  inspection: ImageInspection;
  expected: ExpectedTransaction;
}

export type BankDocumentAnalyzer = (input: BankDocumentAnalysisInput) => Promise<BankDocumentAnalysis>;
export type OcrEngine = (buffer: Buffer) => Promise<{ text: string; confidence: number }>;

export class InvalidDocumentImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDocumentImageError';
  }
}

function jpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  let offset = 2;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

/** Validate the binary signature and image dimensions before invoking OCR. */
export function inspectImage(buffer: Buffer): ImageInspection {
  if (buffer.length < 24) throw new InvalidDocumentImageError('The image file is incomplete or invalid.');
  let mediaType: SupportedImageMime;
  let dimensions: { width: number; height: number } | null = null;

  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (isPng) {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') throw new InvalidDocumentImageError('The PNG image header is invalid.');
    mediaType = 'image/png';
    dimensions = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    mediaType = 'image/jpeg';
    dimensions = jpegDimensions(buffer);
  } else {
    throw new InvalidDocumentImageError('Unsupported image format. Upload a genuine JPEG or PNG image.');
  }

  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new InvalidDocumentImageError('Could not read the image dimensions.');
  }
  if (dimensions.width > 12_000 || dimensions.height > 12_000 || dimensions.width * dimensions.height > MAX_DOCUMENT_PIXELS) {
    throw new InvalidDocumentImageError('The image dimensions are too large to process safely.');
  }
  return { mediaType, ...dimensions, sizeBytes: buffer.length };
}

function normalizeMoney(value: string | undefined): string | null {
  if (!value) return null;
  const compact = value.trim().replace(/,/g, '').replace(/\s/g, '');
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(compact)) return null;
  const numeric = Number(compact);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : null;
}

function normalizeCurrency(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (cleaned === 'GH' || cleaned === 'GHC' || cleaned === 'GHS') return 'GHS';
  return /^[A-Z]{3}$/.test(cleaned) ? cleaned : null;
}

function normalizeReference(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length > 0 ? normalized : null;
}

export function extractReceiptFields(text: string): BankDocumentAnalysis['extractedFields'] {
  const compactText = text.replace(/\r/g, '\n');
  const moneyPattern = /\b(GHS|USD|EUR|GBP|NGN|KES|ZAR)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b|GH[₵¢]\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b|([₵¢])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\b/i;
  const moneyMatch = compactText.match(moneyPattern);
  let amount: string | null = null;
  let currency: string | null = null;
  if (moneyMatch) {
    const amountText = moneyMatch[2] ?? moneyMatch[3] ?? moneyMatch[5];
    const currencyText = moneyMatch[1] ?? (moneyMatch[3] ? 'GHS' : moneyMatch[4] === '₵' || moneyMatch[4] === '¢' ? 'GHS' : null);
    amount = normalizeMoney(amountText);
    currency = normalizeCurrency(currencyText ?? undefined);
  }
  if (!amount) {
    const labeledAmount = compactText.match(/\b(?:transaction\s+)?(?:amount|total|paid|value)\s*[:#-]?\s*(?:[A-Z]{3}\s*)?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    amount = normalizeMoney(labeledAmount?.[1]);
  }

  const referenceMatch = compactText.match(/\b(?:transaction\s*)?(?:reference|ref(?:erence)?|id|no\.?|number)\s*[:#-]\s*([A-Z0-9][A-Z0-9/-]{3,})/i);
  const dateMatch = compactText.match(/\b(?:20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.](?:20)?\d{2})\b/);

  return {
    amount,
    currency,
    reference: normalizeReference(referenceMatch?.[1] ?? undefined),
    date: dateMatch?.[0] ?? null,
  };
}

function comparison(observed: string | null, expected: string | undefined, normalizer: (value: string | undefined) => string | null): FieldComparison {
  const normalizedExpected = normalizer(expected);
  if (!normalizedExpected) return { status: 'NOT_PROVIDED', expected: expected?.trim() || null, observed };
  if (!observed) return { status: 'NOT_EXTRACTED', expected: expected!.trim(), observed: null };
  return {
    status: normalizer(observed) === normalizedExpected ? 'MATCH' : 'MISMATCH',
    expected: expected!.trim(),
    observed,
  };
}

function scalar(value: unknown): string | number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string') return value.trim().slice(0, 120) || null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

const require = createRequire(import.meta.url);
const exifr = require('exifr') as { parse: (input: Buffer, tags: string[]) => Promise<Record<string, unknown> | undefined> };
const tesseract = require('tesseract.js') as {
  createWorker: (language: string, oem: number, options: Record<string, unknown>) => Promise<{
    recognize: (image: Buffer) => Promise<{ data: { text: string; confidence: number } }>;
    terminate: () => Promise<unknown>;
  }>;
};
const englishData = require('@tesseract.js-data/eng') as { langPath: string; gzip: boolean };
let workerPromise: ReturnType<typeof tesseract.createWorker> | undefined;
let ocrTail: Promise<void> = Promise.resolve();

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = tesseract.createWorker('eng', 1, {
      langPath: englishData.langPath,
      gzip: englishData.gzip,
      cacheMethod: 'none',
      logger: () => undefined,
      errorHandler: () => undefined,
    }).catch((cause: unknown) => {
      workerPromise = undefined;
      throw cause;
    });
  }
  return workerPromise;
}

export function recognizeReceiptText(buffer: Buffer): Promise<{ text: string; confidence: number }> {
  const task = ocrTail.then(async () => {
    const worker = await getOcrWorker();
    const result = await worker.recognize(buffer);
    return {
      text: (result.data.text ?? '').slice(0, 12_000),
      confidence: Math.max(0, Math.min(100, Math.round(Number(result.data.confidence) || 0))),
    };
  });
  ocrTail = task.then(() => undefined, () => undefined);
  return task;
}

export async function closeDocumentOcr(): Promise<void> {
  const worker = await workerPromise?.catch(() => undefined);
  workerPromise = undefined;
  if (worker) await worker.terminate();
}

const allowedExifTags = ['Make', 'Model', 'Software', 'DateTimeOriginal', 'CreateDate', 'ModifyDate', 'Orientation'] as const;

export function createBankDocumentAnalyzer(ocrEngine: OcrEngine = recognizeReceiptText): BankDocumentAnalyzer {
  return async ({ buffer, inspection, expected }) => {
    let rawExif: Record<string, unknown> = {};
    try {
      const parsed = await exifr.parse(buffer, [...allowedExifTags]);
      if (parsed && typeof parsed === 'object') rawExif = parsed as Record<string, unknown>;
    } catch {
      // EXIF is optional and malformed metadata must not prevent a human-readable OCR pass.
    }

    const ocr = await ocrEngine(buffer);
    const extractedFields = extractReceiptFields(ocr.text);
    const comparisons = {
      amount: comparison(extractedFields.amount, expected.amount, normalizeMoney),
      currency: comparison(extractedFields.currency, expected.currency, normalizeCurrency),
      reference: comparison(extractedFields.reference, expected.reference, normalizeReference),
    };
    const checks = Object.values(comparisons);
    const suppliedCount = checks.filter((check) => check.status !== 'NOT_PROVIDED').length;
    const comparisonStatus: ComparisonStatus = suppliedCount === 0
      ? 'NOT_COMPARED'
      : checks.some((check) => check.status === 'MISMATCH')
        ? 'MISMATCH'
        : checks.filter((check) => check.status !== 'NOT_PROVIDED').every((check) => check.status === 'MATCH')
          ? 'MATCH'
          : 'INCOMPLETE';
    const reviewReasons: string[] = [];
    if (comparisonStatus === 'MISMATCH') reviewReasons.push('One or more OCR-extracted values differ from the supplied transaction record. Confirm both sources before taking action.');
    if (comparisonStatus === 'INCOMPLETE') reviewReasons.push('At least one supplied transaction value could not be read reliably from the image.');
    if (comparisonStatus === 'NOT_COMPARED') reviewReasons.push('No trusted transaction record was supplied for comparison.');
    if (ocr.confidence < 65 || !ocr.text.trim()) reviewReasons.push('OCR confidence is low or no text was detected; verify the document manually.');
    if (comparisonStatus === 'MATCH') reviewReasons.push('Extracted values match the supplied record, but this does not authenticate the image or prove the transaction occurred.');
    reviewReasons.push('Human verification is required. Image manipulation forensics are not performed by this prototype.');

    const captureTime = scalar(rawExif.DateTimeOriginal ?? rawExif.CreateDate ?? rawExif.ModifyDate);
    const cameraMake = scalar(rawExif.Make);
    const cameraModel = scalar(rawExif.Model);
    const software = scalar(rawExif.Software);
    const orientation = scalar(rawExif.Orientation);
    return {
      id: `doc_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      documentType: 'transfer_receipt',
      analyzedAt: new Date().toISOString(),
      file: { ...inspection, sha256: createHash('sha256').update(buffer).digest('hex') },
      metadata: {
        exifPresent: Object.keys(rawExif).length > 0,
        captureTime: typeof captureTime === 'string' ? captureTime : null,
        cameraMake: typeof cameraMake === 'string' ? cameraMake : null,
        cameraModel: typeof cameraModel === 'string' ? cameraModel : null,
        software: typeof software === 'string' ? software : null,
        orientation: typeof orientation === 'string' || typeof orientation === 'number' ? orientation : null,
        gpsRead: false,
      },
      ocr: { engine: 'tesseract.js', language: 'eng', confidence: ocr.confidence, text: ocr.text.slice(0, 12_000) },
      extractedFields,
      comparisons,
      comparisonStatus,
      humanReviewRequired: true,
      forensicAssessment: 'NOT_PERFORMED',
      reviewReasons: reviewReasons.slice(0, 4),
    };
  };
}

export const analyzeBankDocument = createBankDocumentAnalyzer();
