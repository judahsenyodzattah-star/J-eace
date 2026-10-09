import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/src/app';
import { DetectorUnavailableError, type DetectorAdapter, type DetectorInput, type DetectorOutput } from '../server/src/detector';
import { DemoStore } from '../server/src/store';
import type { BankDocumentAnalysis, BankDocumentAnalysisInput, BankDocumentAnalyzer } from '../server/src/documents';

const sampleText = 'A private sample paragraph submitted only for an API contract test.';
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');

function fakeDocumentAnalyzer(calls: BankDocumentAnalysisInput[]): BankDocumentAnalyzer {
  return async (input) => {
    calls.push(input);
    const check = (observed: string | null, expected: string | undefined) => ({
      status: expected ? (observed?.replace(/[^A-Z0-9.]/gi, '').toUpperCase() === expected.replace(/[^A-Z0-9.]/gi, '').toUpperCase() ? 'MATCH' as const : 'MISMATCH' as const) : 'NOT_PROVIDED' as const,
      expected: expected ?? null,
      observed,
    });
    return {
      id: 'doc_test123', documentType: 'transfer_receipt', analyzedAt: '2026-10-09T00:00:00.000Z',
      file: { ...input.inspection, sha256: 'a'.repeat(64) },
      metadata: { exifPresent: false, captureTime: null, cameraMake: null, cameraModel: null, software: null, orientation: null, gpsRead: false },
      ocr: { engine: 'tesseract.js', language: 'eng', confidence: 90, text: 'Amount: GHS 10.00\nReference: TX1234' },
      extractedFields: { amount: '10.00', currency: 'GHS', reference: 'TX1234', date: null },
      comparisons: { amount: check('10.00', input.expected.amount), currency: check('GHS', input.expected.currency), reference: check('TX1234', input.expected.reference) },
      comparisonStatus: 'MATCH', humanReviewRequired: true, forensicAssessment: 'NOT_PERFORMED',
      reviewReasons: ['Human verification is required.'],
    } satisfies BankDocumentAnalysis;
  };
}

function multipartPayload(boundary: string, image: Buffer, mime = 'image/png', fields: Record<string, string> = { document_type: 'transfer_receipt' }) {
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="receipt.png"\r\nContent-Type: ${mime}\r\n\r\n`));
  parts.push(image, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function fixedDetector(analyze = vi.fn(async (_input: DetectorInput): Promise<DetectorOutput> => ({
  score: 0.72,
  confidence: 0.84,
  classification: 'AI_LIKELY',
  model: 'test-detector',
  modelVersion: 'test.1',
  latencyMs: 11,
}))): DetectorAdapter {
  return {
    name: 'test-detector',
    cacheVersion: 'test.1',
    analyze,
    healthCheck: async () => ({ healthy: true, name: 'test-detector', modelLoaded: true }),
  };
}

describe('Fastify analysis API', () => {
  let app: FastifyInstance;
  let store: DemoStore;

  beforeEach(async () => {
    store = new DemoStore();
    app = await buildServer({ store, detector: fixedDetector(), demoMode: false, apiKey: 'test-secret', quiet: true });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it('rejects missing credentials with the stable error envelope', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', payload: { text: sampleText } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED', request_id: expect.stringMatching(/^req_/) } });
  });

  it('validates content before calling the detector', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: '   ' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
  });

  it('returns a normalized score and applies the deterministic policy', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText, source: 'test' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 0.72, confidence: 0.84, decision: 'FLAG', policy_version: 3, model_version: 'test.1', review_status: 'PENDING' });
    expect(response.headers['x-jeace-demo-mode']).toBe('false');
  });

  it('stores a content hash rather than the submitted text and scopes reads to tenant/application', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText } });
    const id = response.json().id as string;
    const stored = store.getAnalysis(id);
    expect(stored?.contentHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(sampleText);
    expect(store.getAnalysis(id, 'ten_other', store.applicationId)).toBeUndefined();
    expect(store.getAnalysis(id, store.tenantId, 'app_other')).toBeUndefined();
    expect(store.listAnalyses('ten_other', store.applicationId)).toHaveLength(0);
    const crossTenant = await app.inject({ method: 'GET', url: `/v1/analyses/${id}`, headers: { 'x-api-key': 'test-secret' } });
    expect(crossTenant.statusCode).toBe(200); // This credential is bound to its one demo tenant/application.
  });

  it('uses only same-tenant, same-detector-version cache entries', async () => {
    const analyze = vi.fn(async (_input: DetectorInput): Promise<DetectorOutput> => ({ score: 0.2, confidence: 0.7, classification: 'HUMAN_LIKELY', model: 'test-detector', modelVersion: 'test.1', latencyMs: 21 }));
    await app.close();
    app = await buildServer({ store, detector: fixedDetector(analyze), demoMode: false, apiKey: 'test-secret', quiet: true });
    await app.ready();
    const headers = { 'x-api-key': 'test-secret' };
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(store.listAnalyses()).toHaveLength(2);
  });

  it('returns a controlled 503 when an explicitly configured detector is unavailable', async () => {
    await app.close();
    const unavailable: DetectorAdapter = {
      name: 'remote-transformer',
      analyze: async () => { throw new DetectorUnavailableError('private service unavailable'); },
      healthCheck: async () => ({ healthy: false, name: 'remote-transformer', modelLoaded: false }),
    };
    app = await buildServer({ store, detector: unavailable, demoMode: true, apiKey: 'test-secret', quiet: true });
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('DETECTOR_UNAVAILABLE');
    expect(store.listAnalyses()).toHaveLength(0);
  });

  it('paginates analysis history with an application-scoped cursor', async () => {
    const headers = { 'x-api-key': 'test-secret' };
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: `${sampleText} second` } });
    const first = await app.inject({ method: 'GET', url: '/v1/analyses?limit=1', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toHaveLength(1);
    expect(first.json().meta.next_cursor).toBeTruthy();
    const cursor = first.json().meta.next_cursor;
    const second = await app.inject({ method: 'GET', url: `/v1/analyses?limit=1&cursor=${cursor}`, headers });
    expect(second.json().data).toHaveLength(1);
    expect(second.json().meta.next_cursor).toBeNull();
  });

  it('returns a bounded content-size error', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: 'x'.repeat(20_001) } });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('CONTENT_TOO_LARGE');
  });
});

describe('bank document OCR API', () => {
  let app: FastifyInstance;
  let calls: BankDocumentAnalysisInput[];

  beforeEach(async () => {
    calls = [];
    app = await buildServer({
      detector: fixedDetector(),
      demoMode: false,
      apiKey: 'document-test-secret',
      documentAnalyzer: fakeDocumentAnalyzer(calls),
      quiet: true,
    });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it('requires API-key authentication before parsing an image upload', async () => {
    const multipart = multipartPayload('boundary-auth', onePixelPng);
    const response = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType }, payload: multipart.payload });
    expect(response.statusCode).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it('validates the uploaded image signature before OCR', async () => {
    const multipart = multipartPayload('boundary-invalid', Buffer.from('this is not a PNG'));
    const response = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType, 'x-api-key': 'document-test-secret' }, payload: multipart.payload });
    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(calls).toHaveLength(0);
  });

  it('runs OCR analysis and compares extracted receipt values with supplied reference data', async () => {
    const multipart = multipartPayload('boundary-success', onePixelPng, 'image/png', {
      document_type: 'transfer_receipt', expected_amount: '10.00', expected_currency: 'GHS', expected_reference: 'TX1234',
    });
    const response = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType, 'x-api-key': 'document-test-secret' }, payload: multipart.payload });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store, private');
    expect(response.json()).toMatchObject({
      id: 'doc_test123', document_type: 'transfer_receipt',
      extracted_fields: { amount: '10.00', currency: 'GHS', reference: 'TX1234' },
      comparison_status: 'MATCH', human_review_required: true, forensic_assessment: 'NOT_PERFORMED',
      metadata: { gps_read: false },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].expected).toEqual({ amount: '10.00', currency: 'GHS', reference: 'TX1234' });
    expect(calls[0].buffer.equals(onePixelPng)).toBe(true);
  });

  it('allows bounded image uploads larger than the JSON body limit', async () => {
    const image = Buffer.concat([onePixelPng, Buffer.alloc(128 * 1024)]);
    const multipart = multipartPayload('boundary-medium', image);
    const response = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType, 'x-api-key': 'document-test-secret' }, payload: multipart.payload });
    expect(response.statusCode).toBe(200);
    expect(calls[0].inspection.sizeBytes).toBe(image.length);
  });

  it('rejects document review requests without multipart content or with invalid expected amounts', async () => {
    const missing = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'x-api-key': 'document-test-secret' } });
    expect(missing.statusCode).toBe(400);

    const multipart = multipartPayload('boundary-amount', onePixelPng, 'image/png', {
      document_type: 'transfer_receipt', expected_amount: 'two hundred',
    });
    const invalidAmount = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType, 'x-api-key': 'document-test-secret' }, payload: multipart.payload });
    expect(invalidAmount.statusCode).toBe(400);
    expect(invalidAmount.json().error.code).toBe('INVALID_REQUEST');
    expect(calls).toHaveLength(0);
  });

  it('enforces the 5 MB image upload bound', async () => {
    const oversized = Buffer.concat([onePixelPng, Buffer.alloc(5 * 1024 * 1024)]);
    const multipart = multipartPayload('boundary-large', oversized);
    const response = await app.inject({ method: 'POST', url: '/v1/documents/analyze', headers: { 'content-type': multipart.contentType, 'x-api-key': 'document-test-secret' }, payload: multipart.payload });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('CONTENT_TOO_LARGE');
    expect(calls).toHaveLength(0);
  });
});
