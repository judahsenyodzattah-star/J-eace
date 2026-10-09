import { describe, expect, it } from 'vitest';
import { createBankDocumentAnalyzer, extractReceiptFields, inspectImage } from '../server/src/documents';

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64');

describe('bank document sandbox helpers', () => {
  it('sniffs PNG from bytes and reads safe dimensions', () => {
    expect(inspectImage(onePixelPng)).toMatchObject({ mediaType: 'image/png', width: 1, height: 1, sizeBytes: onePixelPng.length });
  });

  it('rejects file extensions and payloads that are not real supported images', () => {
    expect(() => inspectImage(Buffer.from('not an image file'))).toThrow(/incomplete|invalid/i);
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40)]);
    expect(() => inspectImage(fakeJpeg)).toThrow(/dimensions/i);
  });

  it('extracts common receipt fields but leaves ambiguous fields empty', () => {
    const fields = extractReceiptFields('Transfer complete\nAmount: GHS 1,250.00\nTransaction Ref: TRX-443322\nDate: 2026-10-09');
    expect(fields).toEqual({ amount: '1250.00', currency: 'GHS', reference: 'TRX443322', date: '2026-10-09' });
    expect(extractReceiptFields('Payment successful')).toEqual({ amount: null, currency: null, reference: null, date: null });
  });

  it('compares OCR estimates to the supplied transaction record and always requires a reviewer', async () => {
    const analyze = createBankDocumentAnalyzer(async () => ({
      text: 'Amount: GHS 1,250.00\nTransaction Ref: TRX-443322',
      confidence: 91,
    }));
    const image = inspectImage(onePixelPng);
    const result = await analyze({
      buffer: onePixelPng,
      inspection: image,
      expected: { amount: '1,250.00', currency: 'GHS', reference: 'TRX-443322' },
    });
    expect(result.comparisonStatus).toBe('MATCH');
    expect(result.comparisons.reference.status).toBe('MATCH');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.forensicAssessment).toBe('NOT_PERFORMED');
    expect(result.metadata.gpsRead).toBe(false);
    expect(result.ocr.text).toContain('TRX-443322');
  });

  it('treats mismatches as a review signal, not an automated fraud result', async () => {
    const analyze = createBankDocumentAnalyzer(async () => ({ text: 'GHS 125.00 Ref: TX-2233', confidence: 87 }));
    const result = await analyze({
      buffer: onePixelPng,
      inspection: inspectImage(onePixelPng),
      expected: { amount: '250.00', currency: 'GHS', reference: 'TX-2233' },
    });
    expect(result.comparisonStatus).toBe('MISMATCH');
    expect(result.humanReviewRequired).toBe(true);
    expect(result.reviewReasons.join(' ')).not.toMatch(/fraud found|fraud detected/i);
  });
});
