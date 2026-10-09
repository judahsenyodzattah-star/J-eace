import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, Clock3, FileCheck2, Filter, MessageSquareText, ShieldAlert, ShieldCheck, ShieldX, UserRound, X } from 'lucide-react';
import type { Analysis, Decision } from '../types';
import { formatRelative } from '../lib/format';
import { Modal } from './Modal';
import { DecisionBadge, ReviewBadge } from './StatusBadge';
import { ScorePill } from './ScorePill';

interface Props { analyses: Analysis[]; onReview: (id: string, status: 'UPHELD' | 'OVERTURNED', finalDecision: Decision, note: string) => void; }

export function ReviewPage({ analyses, onReview }: Props) {
  const [filter, setFilter] = useState<'PENDING' | 'COMPLETED'>('PENDING');
  const [selected, setSelected] = useState<Analysis | null>(null);
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState('');
  const reviewable = useMemo(() => analyses.filter((item) => item.reviewStatus !== 'NOT_REQUIRED'), [analyses]);
  const rows = filter === 'PENDING' ? reviewable.filter((item) => item.reviewStatus === 'PENDING') : reviewable.filter((item) => item.reviewStatus !== 'PENDING');
  const pendingCount = reviewable.filter((item) => item.reviewStatus === 'PENDING').length;

  function decide(status: 'UPHELD' | 'OVERTURNED', finalDecision: Decision) {
    if (!selected) return;
    if (!note.trim()) { setSaveError('Add a short note so the decision is auditable.'); return; }
    onReview(selected.id, status, finalDecision, note.trim());
    setSelected(null); setNote(''); setSaveError('');
  }

  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">HUMAN-IN-THE-LOOP <span className="eyebrow-separator">/</span> MODERATION</div><h1>Review queue</h1><p>Bring context and human judgment to ambiguous or high-risk results.</p></div><div className="heading-actions"><span className="review-count-pill"><span className="tiny-dot dot-flag" />{pendingCount} awaiting review</span></div></div>
    <div className="review-guidance"><div className="guidance-icon"><ShieldCheck size={18} /></div><div><b>AI scores are signals—not verdicts.</b><span>Review the context, consider the limits of automated detection, then uphold or overturn the original policy decision.</span></div><button aria-label="Learn about detector limitations" title="Learn about detector limitations"><CircleHelp size={16} /></button></div>
    <div className="review-toolbar"><div className="segmented-control"><button className={filter === 'PENDING' ? 'selected' : ''} onClick={() => setFilter('PENDING')}>Needs review <span>{pendingCount}</span></button><button className={filter === 'COMPLETED' ? 'selected' : ''} onClick={() => setFilter('COMPLETED')}>Reviewed <span>{reviewable.length - pendingCount}</span></button></div><div className="review-toolbar-right"><span className="review-sla"><Clock3 size={14} /> Oldest item · {pendingCount ? '43 minutes' : '—'}</span><button className="button button-secondary review-filter-button"><Filter size={14} />Filter</button></div></div>
    <section className="card review-list-card">
      {rows.length ? <div className="review-table-header"><span>SUBMISSION</span><span>AI SIGNAL</span><span>ORIGINAL DECISION</span><span>PRIORITY</span><span>SUBMITTED</span><span /></div> : null}
      {rows.map((item) => <button className="review-row" key={item.id} onClick={() => { setSelected(item); setNote(''); setSaveError(''); }}>
        <div className="review-submission"><span className={`review-file-icon ${item.decision === 'BLOCK' ? 'review-file-block' : ''}`}><FileCheck2 size={16} /></span><span><b>{item.title}</b><small>{item.application} <i>·</i> {item.id}</small></span></div>
        <div className="review-score"><ScorePill score={item.score} /><span>{Math.round(item.confidence * 100)}% confidence</span></div>
        <div className="review-original-decision"><DecisionBadge decision={item.decision} /><span>{item.reason}</span></div>
        <div><span className={`priority-pill ${item.score >= 0.85 ? 'priority-high' : 'priority-normal'}`}><i />{item.score >= 0.85 ? 'High' : 'Standard'}</span></div>
        <div className="time-cell">{formatRelative(item.submittedAt)}</div><ChevronRight size={16} className="review-chevron" />
      </button>)}
      {!rows.length && <div className="empty-state review-empty"><span className="empty-icon"><ShieldCheck size={22} /></span><h3>{filter === 'PENDING' ? 'Your queue is clear' : 'No completed reviews yet'}</h3><p>{filter === 'PENDING' ? 'New flagged analyses will appear here for human review.' : 'Reviewed decisions will be available here for reference.'}</p>{filter === 'COMPLETED' && <button className="text-link" onClick={() => setFilter('PENDING')}>Return to pending queue <ArrowRight size={14} /></button>}</div>}
      {rows.length > 0 && <div className="review-list-footer"><span>Showing {rows.length} {filter === 'PENDING' ? 'pending item' : 'reviewed item'}{rows.length !== 1 ? 's' : ''}</span><span>Decisions are retained in the audit trail</span></div>}
    </section>
    <div className="review-bottom-callout"><div className="review-bottom-avatar"><UserRound size={17} /></div><div><b>Need a second opinion?</b><span>Assign a review to another moderator to add a second perspective.</span></div><span className="reviewer-settings-tag">Reviewer assignment · production extension</span></div>

    {selected && <Modal title="Review submission" eyebrow={`HUMAN REVIEW · ${selected.id}`} onClose={() => setSelected(null)} wide>
      <div className="review-modal-body">
        <div className="review-modal-main"><div className="review-modal-subtitle"><div><h3>{selected.title}</h3><p>{selected.application} <i>·</i> {selected.source} <i>·</i> {formatRelative(selected.submittedAt)}</p></div><DecisionBadge decision={selected.decision} /></div>
          <div className="review-score-panel"><div className="review-score-number"><ScorePill score={selected.score} large /><span>AI likelihood</span></div><div className="review-score-divider" /><div><span className="review-fact-label">MODEL CONFIDENCE</span><b>{Math.round(selected.confidence * 100)}%</b><small>Not a calibrated probability of authorship</small></div><div><span className="review-fact-label">POLICY VERSION</span><b>v{selected.policyVersion}</b><small>Flag {Math.round((selected.flagThreshold ?? 0.6) * 100)}% · Block {Math.round((selected.blockThreshold ?? 0.85) * 100)}% snapshot</small></div></div>
          <div className="review-text-preview"><div className="preview-heading"><span>SUBMITTED CONTENT</span><span className="retention-badge">LIMITED RETENTION</span></div><p>{selected.text ?? selected.preview}</p>{!selected.text && <span className="content-retention-note">Full content unavailable after this demo session, per retention settings.</span>}</div>
          <div className="review-reason"><span className="review-reason-icon"><MessageSquareText size={15} /></span><div><b>System rationale</b><p>{selected.reason} This result should be interpreted alongside context and other evidence.</p></div></div>
        </div>
        <div className="review-modal-sidebar"><div className="reviewer-panel-heading"><span className="moderator-avatar">MP</span><div><b>Maya Patel</b><small>Workspace owner · Review action</small></div></div><div className="form-field reviewer-note-field"><label htmlFor="review-note">Review note <span className="required-star">*</span></label><textarea id="review-note" placeholder="Add context for this decision…" rows={5} value={note} onChange={(event) => { setNote(event.target.value); setSaveError(''); }} /><span className="helper-copy">Notes are recorded in the immutable audit log.</span>{saveError && <span className="field-error"><X size={13} />{saveError}</span>}</div><div className="review-action-label">CHOOSE AN OUTCOME</div><button className="review-action-button action-uphold" onClick={() => decide('UPHELD', selected.decision)}><span className="action-button-icon"><Check size={16} /></span><span><b>Uphold {selected.decision}</b><small>Keep the original policy decision</small></span><ArrowRight size={15} /></button><button className="review-action-button action-overturn" onClick={() => decide('OVERTURNED', selected.decision === 'ALLOW' ? 'FLAG' : 'ALLOW')}><span className="action-button-icon"><ShieldX size={16} /></span><span><b>Overturn to {selected.decision === 'ALLOW' ? 'FLAG' : 'ALLOW'}</b><small>Override the initial decision</small></span><ArrowRight size={15} /></button>{selected.decision === 'FLAG' && <button className="review-action-button action-block" onClick={() => decide('OVERTURNED', 'BLOCK')}><span className="action-button-icon"><ShieldAlert size={16} /></span><span><b>Escalate to BLOCK</b><small>Override and apply a stronger action</small></span><ArrowRight size={15} /></button>}<div className="review-modal-privacy"><ShieldCheck size={14} /><span>Every human override is recorded with actor, rationale, and timestamp.</span></div></div>
      </div>
    </Modal>}
  </div>;
}
