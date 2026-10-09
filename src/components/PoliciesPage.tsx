import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, Fingerprint, GitBranch, History, Plus, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { Policy } from '../types';

interface Props { policies: Policy[]; onSave: (policy: Policy) => void; onCreate: (policy: Policy) => void; }

export function PoliciesPage({ policies, onSave, onCreate }: Props) {
  const [selectedId, setSelectedId] = useState(policies[0]?.id ?? '');
  const selected = policies.find((item) => item.id === selectedId) ?? policies[0];
  const [flagThreshold, setFlagThreshold] = useState(selected?.flagThreshold ?? 0.6);
  const [blockThreshold, setBlockThreshold] = useState(selected?.blockThreshold ?? 0.85);
  const [dirty, setDirty] = useState(false);
  const [validation, setValidation] = useState('');
  const [created, setCreated] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setFlagThreshold(selected.flagThreshold); setBlockThreshold(selected.blockThreshold); setDirty(false); setValidation('');
  }, [selected?.id, selected?.version]);

  function savePolicy() {
    if (!selected) return;
    if (flagThreshold >= blockThreshold) { setValidation('The block threshold must be higher than the flag threshold.'); return; }
    const updated = { ...selected, flagThreshold, blockThreshold, version: selected.version + 1, updatedAt: 'Oct 09, 2026', status: 'ACTIVE' as const };
    onSave(updated); setDirty(false); setValidation('');
  }

  function createPolicy() {
    const newPolicy: Policy = { id: `pol_${Math.random().toString(36).slice(2, 7)}`, name: 'New moderation policy', application: 'Unassigned', description: 'A new versioned policy, ready to configure.', flagThreshold: 0.6, blockThreshold: 0.85, version: 1, updatedAt: 'Oct 09, 2026', status: 'DRAFT' };
    onCreate(newPolicy); setSelectedId(newPolicy.id); setCreated(true);
  }

  if (!selected) return null;
  const flagPercent = Math.round(flagThreshold * 100);
  const blockPercent = Math.round(blockThreshold * 100);
  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">GOVERNANCE <span className="eyebrow-separator">/</span> CLASSIFICATION &amp; ENFORCEMENT</div><h1>Policies</h1><p>Define how detection signals translate into application-specific action.</p></div><div className="heading-actions"><button className="button button-primary" onClick={createPolicy}><Plus size={15} />Create policy</button></div></div>
    {created && <div className="inline-success-banner"><Check size={15} />Draft created. Adjust its thresholds and save to publish version 2.<button onClick={() => setCreated(false)}>Dismiss</button></div>}
    <div className="policy-layout">
      <aside className="card policy-list-card"><div className="policy-list-header"><div><h2>Policy library</h2><p>{policies.length} versioned policies</p></div><button className="icon-button policy-list-more" aria-label="Policy library options">···</button></div><div className="policy-list-items">{policies.map((policy) => <button key={policy.id} onClick={() => setSelectedId(policy.id)} className={`policy-list-item ${selected.id === policy.id ? 'selected' : ''}`}><span className="policy-list-icon"><Fingerprint size={16} /></span><span className="policy-list-copy"><b>{policy.name}</b><small>{policy.application}</small><span className="policy-list-meta">v{policy.version} <i>·</i> {policy.status}</span></span><ChevronRight size={15} className="policy-list-chevron" /></button>)}</div><div className="policy-library-foot"><ShieldCheck size={15} />Version history is immutable</div></aside>
      <div className="policy-editor-column">
        <section className="card policy-editor-card"><div className="policy-editor-header"><div><span className="policy-editor-icon"><SlidersHorizontal size={17} /></span><div><div className="policy-heading-title"><h2>{selected.name}</h2><span className={selected.status === 'ACTIVE' ? 'policy-active-tag' : 'policy-draft-tag'}><i />{selected.status}</span></div><p>{selected.description}</p></div></div><div className="policy-version-chip"><GitBranch size={13} />v{selected.version}<ChevronRight size={12} />draft</div></div>
          <div className="policy-metadata-row"><div><span>ASSIGNED TO</span><b>{selected.application}</b></div><div><span>STRATEGY</span><b>Threshold evaluation</b></div><div><span>LAST UPDATED</span><b>{selected.updatedAt}</b></div><div><span>VERSION</span><b>v{selected.version}</b></div></div>
          <div className="policy-form-section"><div className="policy-section-heading"><div><h3>Decision thresholds</h3><p>Choose how the estimated AI-likelihood score guides moderation.</p></div><button className="subtle-icon" title="Thresholds apply only to new decisions"><CircleHelp size={15} /></button></div>
            <div className="threshold-editor"><div className="threshold-editor-label"><span className="threshold-editor-icon threshold-flag-bg"><span /></span><div><b>Flag for human review</b><small>Scores at or above this value enter the review queue.</small></div><strong>{flagPercent}<small>%</small></strong></div><input aria-label="Flag threshold" className="range-input range-flag" type="range" min="10" max="90" step="1" value={flagPercent} onChange={(event) => { setFlagThreshold(Number(event.target.value) / 100); setDirty(true); setValidation(''); }} style={{ '--range-fill': `${((flagPercent - 10) / 80) * 100}%` } as CSSProperties} /><div className="range-labels"><span>10% · More review</span><span>90% · Less review</span></div></div>
            <div className="threshold-editor threshold-editor-block"><div className="threshold-editor-label"><span className="threshold-editor-icon threshold-block-bg"><span /></span><div><b>Block automatically</b><small>Scores at or above this value trigger the block decision.</small></div><strong>{blockPercent}<small>%</small></strong></div><input aria-label="Block threshold" className="range-input range-block" type="range" min="15" max="99" step="1" value={blockPercent} onChange={(event) => { setBlockThreshold(Number(event.target.value) / 100); setDirty(true); setValidation(''); }} style={{ '--range-fill': `${((blockPercent - 15) / 84) * 100}%` } as CSSProperties} /><div className="range-labels"><span>15% · More enforcement</span><span>99% · Less enforcement</span></div></div>
            <div className="policy-outcome-preview"><div className="outcome-preview-heading"><span>OUTCOME PREVIEW</span><span><CircleHelp size={13} /> Deterministic rules</span></div><div className="outcome-preview-flow"><div><span>0 – {flagPercent - 1}%</span><b className="allow-text">ALLOW</b></div><ArrowRight size={16} /><div><span>{flagPercent} – {blockPercent - 1}%</span><b className="flag-text">FLAG</b></div><ArrowRight size={16} /><div><span>{blockPercent} – 100%</span><b className="block-text">BLOCK</b></div></div></div>
            {validation && <div className="field-error policy-validation">{validation}</div>}
            <div className="policy-save-row"><span className="immutable-note"><History size={14} />Saving creates a new policy version. Existing decisions stay unchanged.</span><button className="button button-primary" disabled={!dirty} onClick={savePolicy}>Save new version <ArrowRight size={14} /></button></div>
          </div>
        </section>
        <section className="card policy-history-card"><div className="card-header"><div><h2>Version history</h2><p>Past thresholds stay attached to every historical decision.</p></div><button className="text-link" onClick={() => setDirty(false)}>View changelog <ArrowRight size={13} /></button></div><div className="history-table"><div className="history-row history-header"><span>VERSION</span><span>FLAG</span><span>BLOCK</span><span>CHANGED BY</span><span>DATE</span></div><div className="history-row current-history"><span><i className="current-dot" />v{selected.version} <em>Current</em></span><span>{Math.round(selected.flagThreshold * 100)}%</span><span>{Math.round(selected.blockThreshold * 100)}%</span><span>Maya Patel</span><span>{selected.updatedAt}</span></div><div className="history-row"><span>v{Math.max(1, selected.version - 1)}</span><span>{Math.max(10, Math.round(selected.flagThreshold * 100) - 2)}%</span><span>{Math.max(20, Math.round(selected.blockThreshold * 100) - 2)}%</span><span>Alex Morgan</span><span>Sep 28, 2026</span></div><div className="history-row"><span>v1</span><span>55%</span><span>90%</span><span>Maya Patel</span><span>Sep 12, 2026</span></div></div></section>
      </div>
    </div>
  </div>;
}
