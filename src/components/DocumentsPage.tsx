import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, FileCheck2, FileImage, Info, LockKeyhole, RotateCcw, ScanLine, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { analyzeBankReceipt, DocumentApiError, type ExpectedTransactionInput } from '../api/documents';
import type { BankDocumentAnalysis, DocumentComparisonState } from '../types';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function comparisonLabel(status: DocumentComparisonState): string {
  if (status === 'MATCH') return 'Matches';
  if (status === 'MISMATCH') return 'Differs';
  if (status === 'NOT_EXTRACTED') return 'Not read';
  return 'Not supplied';
}

function comparisonClass(status: DocumentComparisonState): string {
  if (status === 'MATCH') return 'document-check-match';
  if (status === 'MISMATCH') return 'document-check-mismatch';
  return 'document-check-incomplete';
}

function ComparisonRow({ label, comparison }: { label: string; comparison: BankDocumentAnalysis['comparisons']['amount'] }) {
  return <div className="document-comparison-row">
    <b>{label}</b>
    <span>{comparison.expected ?? '—'}</span>
    <span>{comparison.observed ?? 'Not read'}</span>
    <em className={comparisonClass(comparison.status)}>{comparisonLabel(comparison.status)}</em>
  </div>;
}

export function DocumentsPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('GHS');
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<BankDocumentAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(candidate?: File) {
    setError('');
    setResult(null);
    if (!candidate) { setFile(null); return; }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('The image must be no larger than 5 MB.');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(candidate.type)) {
      setFile(null);
      setError('Choose a JPEG or PNG photo of a transfer receipt. PDF is not supported in this first version.');
      return;
    }
    setFile(candidate);
  }

  async function submit() {
    if (!file) { setError('Choose a receipt image first.'); return; }
    setError('');
    setBusy(true);
    const expected: ExpectedTransactionInput = { amount, currency, reference };
    try {
      setResult(await analyzeBankReceipt(file, expected));
    } catch (cause) {
      setError(cause instanceof DocumentApiError ? `${cause.message} (HTTP ${cause.status})` : 'Could not reach the document service. Check that the local API is running, then try again.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null); setResult(null); setAmount(''); setCurrency('GHS'); setReference(''); setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  const comparisonHeadline = result?.comparisonStatus === 'MATCH'
    ? 'Extracted values match the supplied record'
    : result?.comparisonStatus === 'MISMATCH'
      ? 'One or more values differ from the supplied record'
      : result?.comparisonStatus === 'INCOMPLETE'
        ? 'Comparison is incomplete'
        : 'No transaction comparison was performed';

  return <div className="page-content bank-documents-page">
    <div className="page-heading">
      <div><div className="eyebrow">BANK DOCUMENTS <span className="eyebrow-separator">/</span> REVIEW ASSISTANCE</div><h1>Transfer receipt review</h1><p>Extract receipt text and metadata, then compare selected values with a trusted transaction record.</p></div>
      <div className="heading-actions"><span className="demo-data-pill"><i />Sandbox · English OCR</span></div>
    </div>

    <div className="bank-document-safety"><span className="document-safety-icon"><ShieldAlert size={17} /></span><div><b>Review assistance only—not a fraud verdict.</b><span>OCR can misread values. Metadata can be missing or edited. This prototype does not detect image manipulation or verify that a transaction occurred. A human must review every result.</span></div></div>

    <div className="bank-document-layout">
      <section className="card bank-document-form-card">
        <div className="card-header"><div className="section-icon-title"><span className="section-icon section-icon-violet"><FileImage size={17} /></span><div><h2>Receipt image</h2><p>Upload one transfer receipt or payment confirmation.</p></div></div><span className="soft-tag">In-memory processing</span></div>
        <label className={`document-dropzone ${file ? 'document-dropzone-selected' : ''}`} htmlFor="receipt-file">
          {previewUrl ? <img className="document-image-preview" src={previewUrl} alt="Selected receipt preview" /> : <span className="document-upload-icon"><Upload size={19} /></span>}
          <span className="document-upload-copy"><b>{file ? file.name : 'Choose a receipt image'}</b><small>{file ? `${formatBytes(file.size)} · ${file.type}` : 'JPEG or PNG · up to 5 MB · one image per review'}</small></span>
          <span className="button button-secondary document-browse-button">Browse files</span>
          <input ref={fileInput} id="receipt-file" type="file" accept="image/jpeg,image/png" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>

        <div className="document-expected-heading"><div><h3>Trusted transaction record</h3><p>Optional comparison values. In a bank integration, send these from a trusted backend—not from the customer’s browser.</p></div><span>OPTIONAL</span></div>
        <div className="document-expected-grid">
          <div className="form-field"><label htmlFor="expected-amount">Expected amount</label><input id="expected-amount" inputMode="decimal" placeholder="e.g. 250.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="expected-currency">Currency code</label><input id="expected-currency" maxLength={3} placeholder="GHS" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} /></div>
          <div className="form-field document-reference-field"><label htmlFor="expected-reference">Expected transaction reference</label><input id="expected-reference" maxLength={100} placeholder="e.g. TXN-240918-77" value={reference} onChange={(event) => setReference(event.target.value)} /></div>
        </div>

        {error && <div className="field-error document-upload-error"><AlertCircle size={14} />{error}</div>}
        <div className="document-submit-row"><span><LockKeyhole size={13} />Image and OCR text are not saved in this demo.</span><div><button className="button button-secondary" onClick={reset} disabled={busy || (!file && !result)}>Clear</button><button className="button button-primary" onClick={submit} disabled={!file || busy}>{busy ? <span className="button-spinner" /> : <ScanLine size={15} />}{busy ? 'Reading receipt…' : 'Review receipt'}</button></div></div>
      </section>

      <aside className="bank-document-side-column">
        <section className="card document-process-card"><div className="document-side-heading"><span className="document-side-icon"><ScanLine size={16} /></span><div><h2>What this checks</h2><p>Signals for a reviewer</p></div></div><ul><li><Check size={13} /><span>English OCR for amount, currency, date, and reference</span></li><li><Check size={13} /><span>Selected EXIF tags; GPS coordinates are not read</span></li><li><Check size={13} /><span>Field comparison against values supplied by your bank</span></li></ul><div className="document-side-warning"><Info size={14} /><span>No authenticity score, tamper classifier, account lookup, or bank-core connection is included.</span></div></section>
        <section className="card document-privacy-card"><div className="document-side-heading"><span className="document-privacy-icon"><LockKeyhole size={15} /></span><div><h2>Prototype privacy boundary</h2><p>Do not upload real customer records.</p></div></div><p>The API processes the image in memory, returns OCR text to this page, and does not persist the image or OCR output. The browser page does not save its review state to localStorage. A real bank deployment needs approved data access, encryption, retention controls, and security review.</p></section>
      </aside>
    </div>

    {result && <section className="card bank-document-result" aria-live="polite">
      <div className="bank-result-header"><div><div className="result-kicker"><span className="result-kicker-icon"><FileCheck2 size={12} /></span>DOCUMENT REVIEW · {result.id}</div><h2>{comparisonHeadline}</h2><p>Receipt values are OCR estimates and must be checked against the original and trusted bank records.</p></div><span className="document-human-review-pill"><ShieldCheck size={14} />Human review required</span></div>
      <div className={`document-comparison-banner ${result.comparisonStatus === 'MISMATCH' ? 'document-comparison-banner-warn' : ''}`}><Info size={15} /><span>{result.comparisonStatus === 'MATCH' ? 'Matching fields are not proof of authenticity or payment.' : result.comparisonStatus === 'MISMATCH' ? 'Differences may reflect OCR mistakes, formatting, or a real discrepancy. They are not a fraud finding.' : 'Supply trusted transaction values to compare; unavailable fields are inconclusive, not evidence of fraud.'}</span></div>

      <div className="document-result-grid">
        <section className="document-result-section"><div className="document-section-heading"><div><h3>Transaction fields</h3><p>OCR confidence · {result.ocr.confidence}%</p></div><span className={`document-status-pill ${result.comparisonStatus === 'MISMATCH' ? 'document-status-warn' : ''}`}>{result.comparisonStatus.replaceAll('_', ' ')}</span></div>
          <div className="document-comparison-table"><div className="document-comparison-row document-comparison-header"><b>FIELD</b><span>TRUSTED VALUE</span><span>OCR VALUE</span><em>CHECK</em></div><ComparisonRow label="Amount" comparison={result.comparisons.amount} /><ComparisonRow label="Currency" comparison={result.comparisons.currency} /><ComparisonRow label="Reference" comparison={result.comparisons.reference} /></div>
          <div className="document-extracted-date"><span>OCR date</span><b>{result.extractedFields.date ?? 'Not read'}</b></div>
          <details className="document-ocr-details"><summary>Show extracted OCR text · temporary, sensitive</summary><pre>{result.ocr.text || 'No text was recognized.'}</pre></details>
        </section>

        <section className="document-result-section document-metadata-section"><div className="document-section-heading"><div><h3>File &amp; metadata</h3><p>Metadata is user-controlled and may be absent.</p></div><span className="document-meta-tag">{result.file.mediaType === 'image/jpeg' ? 'JPEG' : 'PNG'}</span></div>
          <div className="document-metadata-list"><div><span>Image size</span><b>{result.file.width.toLocaleString()} × {result.file.height.toLocaleString()} px · {formatBytes(result.file.sizeBytes)}</b></div><div><span>EXIF tags</span><b>{result.metadata.exifPresent ? 'Some tags present' : 'None found'}</b></div><div><span>Capture time</span><b>{result.metadata.captureTime ?? 'Not available'}</b></div><div><span>Camera</span><b>{[result.metadata.cameraMake, result.metadata.cameraModel].filter(Boolean).join(' ') || 'Not available'}</b></div><div><span>Software tag</span><b>{result.metadata.software ?? 'Not available'}</b></div><div><span>GPS coordinates</span><b>Not read or returned</b></div></div>
          <div className="document-hash-row"><span>SHA-256 file fingerprint</span><code title={result.file.sha256}>{result.file.sha256}</code></div>
        </section>
      </div>

      <div className="document-review-reasons"><div className="document-side-heading"><span className="document-side-icon"><ShieldAlert size={15} /></span><div><h3>Reviewer notes</h3><p>Every document remains subject to human verification.</p></div></div><ul>{result.reviewReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></div>
      <div className="document-result-footer"><span><Info size={14} />Image manipulation forensics: not performed</span><span>Review ID {result.id} · {new Date(result.analyzedAt).toLocaleString()}</span></div>
    </section>}
  </div>;
}
