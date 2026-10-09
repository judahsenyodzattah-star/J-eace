import type { BankDocumentAnalysis, DocumentComparisonState, DocumentComparisonStatus, DocumentFieldComparison } from '../types';

export interface ExpectedTransactionInput {
  amount?: string;
  currency?: string;
  reference?: string;
}

export class DocumentApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DocumentApiError';
  }
}

type ApiFieldComparison = { status: DocumentComparisonState; expected: string | null; observed: string | null };
type ApiDocumentResult = {
  id: string;
  document_type: 'transfer_receipt';
  analyzed_at: string;
  file: { media_type: 'image/jpeg' | 'image/png'; size_bytes: number; sha256: string; width: number; height: number };
  metadata: { exif_present: boolean; capture_time: string | null; camera_make: string | null; camera_model: string | null; software: string | null; orientation: string | number | null; gps_read: false };
  ocr: { engine: 'tesseract.js'; language: 'eng'; confidence: number; text: string };
  extracted_fields: { amount: string | null; currency: string | null; reference: string | null; date: string | null };
  comparisons: { amount: ApiFieldComparison; currency: ApiFieldComparison; reference: ApiFieldComparison };
  comparison_status: DocumentComparisonStatus;
  human_review_required: true;
  forensic_assessment: 'NOT_PERFORMED';
  review_reasons: string[];
};

export async function analyzeBankReceipt(file: File, expected: ExpectedTransactionInput): Promise<BankDocumentAnalysis> {
  const form = new FormData();
  form.append('document', file, file.name);
  form.append('document_type', 'transfer_receipt');
  if (expected.amount?.trim()) {
    form.append('expected_amount', expected.amount.trim());
    if (expected.currency?.trim()) form.append('expected_currency', expected.currency.trim());
  }
  if (expected.reference?.trim()) form.append('expected_reference', expected.reference.trim());

  const response = await fetch('/api/v1/documents/analyze', {
    method: 'POST',
    headers: { 'x-api-key': import.meta.env.VITE_JEACE_DEMO_API_KEY ?? 'jeace_local_demo_key' },
    body: form,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new DocumentApiError(payload?.error?.message ?? `Document review failed (${response.status}).`, response.status);
  }

  const payload = await response.json() as ApiDocumentResult;
  const mapComparison = (value: ApiFieldComparison): DocumentFieldComparison => ({ status: value.status, expected: value.expected, observed: value.observed });
  return {
    id: payload.id,
    documentType: payload.document_type,
    analyzedAt: payload.analyzed_at,
    file: { mediaType: payload.file.media_type, sizeBytes: payload.file.size_bytes, sha256: payload.file.sha256, width: payload.file.width, height: payload.file.height },
    metadata: {
      exifPresent: payload.metadata.exif_present,
      captureTime: payload.metadata.capture_time,
      cameraMake: payload.metadata.camera_make,
      cameraModel: payload.metadata.camera_model,
      software: payload.metadata.software,
      orientation: payload.metadata.orientation,
      gpsRead: false,
    },
    ocr: payload.ocr,
    extractedFields: payload.extracted_fields,
    comparisons: {
      amount: mapComparison(payload.comparisons.amount),
      currency: mapComparison(payload.comparisons.currency),
      reference: mapComparison(payload.comparisons.reference),
    },
    comparisonStatus: payload.comparison_status,
    humanReviewRequired: true,
    forensicAssessment: 'NOT_PERFORMED',
    reviewReasons: payload.review_reasons,
  };
}
