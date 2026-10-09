import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, ChevronDown, Clock3, FileText, Fingerprint, Info, LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import type { Analysis, AnalyzeResult, Decision } from '../types';
import { scoreInDemoMode } from '../lib/demoDetector';
import { ApiError, submitAnalysis } from '../api/client';
import { DecisionBadge } from './StatusBadge';
import type { PageId } from './Sidebar';

interface Props {
  flagThreshold: number;
  blockThreshold: number;
  policyName: string;
  policyId: string;
  policyVersion: number;
  onAnalyzed: (analysis: Analysis, result: AnalyzeResult, usingFallback: boolean) => void;
  onNavigate: (page: PageId) => void;
}

const decisionCopy: Record<Decision, string> = {
  ALLOW: 'The score is below this policy’s review threshold. The submission can continue.',
  FLAG: 'This result falls in the review band. A person should review it before taking action.',
  BLOCK: 'The score exceeds the configured block threshold. A moderator can still review this decision.',
};

export function AnalyzePage({ flagThreshold, blockThreshold, policyName, policyId, policyVersion, onAnalyzed, onNavigate }: Props) {
  const [text, setText] = useState('');
  const [source, setSource] = useState('assignment');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [currentText, setCurrentText] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState('');
  const wordCount = useMemo(() => text.trim() ? text.trim().split(/\s+/).length : 0, [text]);

  async function analyze() {
    const clean = text.trim();
    if (!clean) { setError('Add a few sentences to run an analysis.'); return; }
    setError(''); setLoading(true); setResult(null);
    let data: AnalyzeResult;
    let fallback = false;
    try {
      data = await submitAnalysis({ text: clean, source, content_type: 'text/plain', locale: 'en' });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(`${cause.message} (HTTP ${cause.status}). No analysis was stored.`);
        setLoading(false);
        return;
      }
      // A local transparent fallback keeps a disconnected walkthrough usable; the result is marked clearly.
      data = scoreInDemoMode({ text: clean, flagThreshold, blockThreshold, policyVersion, policyId });
      fallback = true;
    }
    const analysis: Analysis = {
      id: data.id,
      title: titleFor(source, data.id),
      application: 'Student Portal',
      source,
      contentType: 'text/plain',
      submittedAt: new Date().toISOString(),
      score: data.score,
      confidence: data.confidence,
      decision: data.decision,
      reviewStatus: data.reviewStatus,
      model: data.model,
      modelVersion: data.modelVersion,
      latencyMs: data.latencyMs,
      policyId: data.policyId ?? policyId,
      policyName,
      flagThreshold: data.flagThreshold ?? flagThreshold,
      blockThreshold: data.blockThreshold ?? blockThreshold,
      policyVersion: data.policyVersion,
      preview: 'Submitted content withheld by limited-retention settings.',
      text: clean,
      reason: data.reason,
    };
    setResult(data); setCurrentText(clean); setUsingFallback(fallback); setLoading(false); onAnalyzed(analysis, data, fallback);
  }

  return <div className="page-content analyze-page">
    <div className="page-heading analyze-heading"><div><div className="eyebrow">EVALUATION <span className="eyebrow-separator">/</span> AUTHENTICITY</div><h1>Analyze content</h1><p>Evaluate a text sample and preview how your current moderation policy responds.</p></div><div className="heading-right-meta"><span className="demo-data-pill"><i />Sandbox mode</span></div></div>
    <div className="analysis-workspace">
      <div className="analysis-main-column">
        <section className="card analyzer-input-card">
          <div className="card-header analyzer-card-header"><div className="section-icon-title"><span className="section-icon section-icon-violet"><FileText size={17} /></span><div><h2>Content to evaluate</h2><p>Paste the text you want J’eace to assess.</p></div></div><span className="soft-tag">Private by default</span></div>
          <div className="form-field"><label htmlFor="analysis-text">Submitted text <span className="required-star">*</span></label><textarea id="analysis-text" value={text} onChange={(event) => { setText(event.target.value.slice(0, 20_000)); setError(''); }} placeholder="Paste or type content here…\n\nFor a useful demonstration, include a few paragraphs. Very short samples are difficult to assess reliably." maxLength={20_000} /><div className="textarea-footer"><span><LockKeyhole size={12} /> Content is not saved in this browser demo</span><span>{wordCount.toLocaleString()} words <i>·</i> {text.length.toLocaleString()} / 20,000 characters</span></div>{error && <div className="field-error"><AlertCircle size={14} />{error}</div>}</div>
          <div className="analysis-form-row">
            <div className="form-field source-field"><label htmlFor="source-select">Source type</label><div className="select-wrap"><select id="source-select" value={source} onChange={(event) => setSource(event.target.value)}><option value="assignment">Assignment</option><option value="discussion">Discussion post</option><option value="research">Research paper</option><option value="portfolio">Portfolio / reflection</option><option value="other">Other</option></select><ChevronDown size={15} /></div></div>
            <div className="form-field source-field"><label>Application policy</label><div className="policy-selection"><span className="policy-mini-icon"><Fingerprint size={14} /></span><span>{policyName}</span><span className="policy-policy-version">v{policyVersion}</span><Check className="policy-check" size={14} /></div></div>
          </div>
          <div className="analyze-actions"><div className="api-availability"><span className="health-dot" />Analysis engine ready <button className="inline-info" aria-label="About the demo engine" title="The included sandbox scorer is heuristic and not a trained model."><Info size={13} /></button></div><button className="button button-primary button-analyze" disabled={loading || !text.trim()} onClick={analyze}>{loading ? <span className="button-spinner" /> : <Sparkles size={15} />}{loading ? 'Evaluating…' : 'Run evaluation'}<ArrowRight size={14} /></button></div>
        </section>

        {result ? <section className="card result-card" aria-live="polite">
          <div className="result-header"><div><div className="result-kicker"><span className="result-kicker-icon"><Check size={12} /></span>ANALYSIS COMPLETE <span className="result-id">{result.id}</span></div><h2>Assessment overview</h2><p>This is a probabilistic signal, not a determination of who wrote the text.</p></div><button className="icon-button reset-button" aria-label="Reset analysis" onClick={() => { setResult(null); setText(''); setCurrentText(''); }}><RotateCcw size={16} /></button></div>
          <div className="result-overview">
            <div className="score-gauge-wrap"><div className="score-gauge" style={{ background: `conic-gradient(${result.score >= blockThreshold ? '#dc6874' : result.score >= flagThreshold ? '#e6a33f' : '#655de2'} ${result.score * 360}deg, #edf0f6 0deg)` }}><div className="score-gauge-inner"><span>AI likelihood</span><strong>{Math.round(result.score * 100)}<small>%</small></strong><span className="gauge-confidence">{Math.round(result.confidence * 100)}% confidence</span></div></div><div className="gauge-caption"><span className="gauge-caption-dot" />Estimated likelihood</div></div>
            <div className="result-summary"><div className="result-classification-row"><span className={`classification-tag ${result.classification === 'AI_LIKELY' ? 'classification-ai' : 'classification-human'}`}>{result.classification === 'AI_LIKELY' ? 'AI-LIKELY SIGNAL' : 'HUMAN-LIKELY SIGNAL'}</span><DecisionBadge decision={result.decision} /></div><h3>{result.score >= 0.5 ? 'Elevated AI-likelihood signal' : 'Lower AI-likelihood signal'}</h3><p>{decisionCopy[result.decision]}</p><div className="result-meta-grid"><div><span>MODEL</span><b>{result.model}</b></div><div><span>VERSION</span><b>{result.modelVersion}</b></div><div><span>LATENCY</span><b>{result.latencyMs} ms</b></div><div><span>POLICY</span><b>{policyName} · v{policyVersion}</b></div></div></div>
          </div>
          <div className={`demo-caveat ${usingFallback || result.model.includes('demo') ? 'demo-caveat-warn' : ''}`}><Info size={15} /><span>{usingFallback ? 'API unavailable — browser sandbox scorer shown. ' : ''}<b>Sandbox heuristic, not a trained model.</b> Do not use this output to make consequential decisions. The included ML service requires a fine-tuned checkpoint.</span></div>
          {result.signals && <div className="signals-section"><div className="signals-header"><div><h3>Signals considered</h3><span>Illustrative indicators from the demo scorer</span></div><span className="signal-disclaimer">Not explanations of a trained model</span></div><div className="signal-grid">{result.signals.map((signal) => <div className="signal-card" key={signal.label}><div><b>{signal.label}</b><span>{signal.value}</span></div><p>{signal.description}</p></div>)}</div></div>}
          <div className="result-content-preview"><div className="preview-heading"><span>SUBMITTED SAMPLE</span><span>{currentText.trim().split(/\s+/).filter(Boolean).length} words</span></div><p>{currentText}</p></div>
        </section> : <section className="first-run-card"><div className="first-run-art"><div className="first-run-orbit orbit-one" /><div className="first-run-orbit orbit-two" /><div className="first-run-icon"><WandSparkles size={25} /></div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" /></div><div><h3>Ready when you are</h3><p>Run an evaluation to see a sample AI-likelihood score, confidence estimate, and policy outcome. The sandbox scorer is only for demonstrating workflow.</p><div className="first-run-points"><span><Check size={13} />Policy-aware outcome</span><span><Check size={13} />Human review routing</span><span><Check size={13} />Privacy-conscious demo</span></div></div></section>}
      </div>

      <aside className="analysis-side-column">
        <section className="card policy-side-card"><div className="side-card-heading"><span className="side-card-icon violet-tint"><Fingerprint size={17} /></span><div><h2>Active policy</h2><p>Decision rules for this application</p></div></div><div className="active-policy-name"><b>{policyName}</b><span className="policy-active-tag"><i />ACTIVE</span></div><div className="threshold-display"><div className="threshold-row"><span><i className="threshold-dot threshold-flag" />Flag at</span><b>{Math.round(flagThreshold * 100)}%</b></div><div className="threshold-line"><span style={{ width: `${flagThreshold * 100}%` }} /></div><div className="threshold-row"><span><i className="threshold-dot threshold-block" />Block at</span><b>{Math.round(blockThreshold * 100)}%</b></div><div className="threshold-line threshold-line-block"><span style={{ width: `${blockThreshold * 100}%` }} /></div></div><div className="policy-result-examples"><div><span>Below {Math.round(flagThreshold * 100)}%</span><b className="sample-outcome allow-text">ALLOW</b></div><div><span>{Math.round(flagThreshold * 100)}–{Math.round(blockThreshold * 100)}%</span><b className="sample-outcome flag-text">FLAG</b></div><div><span>{Math.round(blockThreshold * 100)}% and up</span><b className="sample-outcome block-text">BLOCK</b></div></div><button className="side-text-link" onClick={() => onNavigate('policies')}>Manage policy <ArrowRight size={14} /></button></section>
        <section className="card privacy-side-card"><div className="privacy-lock-icon"><ShieldCheck size={18} /></div><h3>Human judgment stays in the loop</h3><p>Flagged results are a request for review—not a verdict. Moderators can uphold or overturn every decision.</p><div className="privacy-link-row"><span><Clock3 size={13} />Review queue enabled</span><span className="privacy-link-arrow"><ArrowRight size={14} /></span></div></section>
        <div className="limits-side-note"><div className="limits-note-icon"><Info size={15} /></div><p><b>About AI detection</b><br />Short texts, edits, paraphrasing, and unfamiliar writing styles can affect model reliability. Never treat an AI-likelihood score as proof.</p></div>
      </aside>
    </div>
  </div>;
}

function titleFor(source: string, id: string): string {
  const prefix = source === 'discussion' ? 'Discussion' : source === 'research' ? 'Research' : source === 'portfolio' ? 'Portfolio' : source === 'assignment' ? 'Assignment' : 'Submission';
  return `${prefix} · ${id.slice(-4).toUpperCase()}`;
}
