import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRight, CalendarDays, Filter, ListFilter, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Analysis, Decision } from '../types';
import { formatRelative } from '../lib/format';
import { DecisionBadge, ReviewBadge } from './StatusBadge';
import { ScorePill } from './ScorePill';

interface Props { analyses: Analysis[]; query: string; onQueryChange: (value: string) => void; onSelect: (analysis: Analysis) => void; }

export function AnalysesPage({ analyses, query, onQueryChange, onSelect }: Props) {
  const [decision, setDecision] = useState('ALL');
  const [application, setApplication] = useState('ALL');
  const [sortNewest, setSortNewest] = useState(true);
  const apps = [...new Set(analyses.map((item) => item.application))];
  const filtered = useMemo(() => analyses.filter((item) => {
    const matchesSearch = !query.trim() || `${item.title} ${item.application} ${item.source} ${item.id}`.toLowerCase().includes(query.toLowerCase());
    const matchesDecision = decision === 'ALL' || (item.finalDecision ?? item.decision) === decision;
    const matchesApp = application === 'ALL' || item.application === application;
    return matchesSearch && matchesDecision && matchesApp;
  }).sort((a, b) => sortNewest ? new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime() : new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime()), [analyses, query, decision, application, sortNewest]);

  function exportCsv() {
    const rows = [['analysis_id', 'title', 'application', 'score', 'decision', 'review_status', 'submitted_at'], ...filtered.map((item) => [item.id, item.title, item.application, item.score.toFixed(2), item.finalDecision ?? item.decision, item.reviewStatus, item.submittedAt])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'jeace-analyses.csv'; link.click(); URL.revokeObjectURL(link.href);
  }

  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">WORKSPACE <span className="eyebrow-separator">/</span> HISTORY</div><h1>Analyses</h1><p>Review content evaluations and the policy decisions they informed.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={exportCsv}><ArrowDownToLine size={15} />Export CSV</button><span className="demo-data-pill"><i />Sandbox data</span></div></div>
    <div className="analysis-summary-strip"><div><b>{analyses.length.toLocaleString()}</b><span>shown in this sandbox</span></div><div className="strip-divider" /><div className="summary-decision"><span className="tiny-dot dot-allow" />{analyses.filter((a) => (a.finalDecision ?? a.decision) === 'ALLOW').length} allowed</div><div className="summary-decision"><span className="tiny-dot dot-flag" />{analyses.filter((a) => (a.finalDecision ?? a.decision) === 'FLAG').length} flagged</div><div className="summary-decision"><span className="tiny-dot dot-block" />{analyses.filter((a) => (a.finalDecision ?? a.decision) === 'BLOCK').length} blocked</div><div className="strip-spacer" /><div className="strip-privacy"><Filter size={14} /> Content text is not retained in this view</div></div>
    <section className="card analyses-list-card">
      <div className="filter-toolbar"><div className="filter-search"><Search size={15} /><input aria-label="Search analyses" placeholder="Search by submission, app, or ID…" value={query} onChange={(event) => onQueryChange(event.target.value)} />{query && <button onClick={() => onQueryChange('')} aria-label="Clear search"><X size={14} /></button>}</div><div className="toolbar-filters"><div className="select-wrap filter-select"><ListFilter size={14} /><select aria-label="Filter by decision" value={decision} onChange={(event) => setDecision(event.target.value)}><option value="ALL">All decisions</option><option value="ALLOW">Allow</option><option value="FLAG">Flag</option><option value="BLOCK">Block</option></select></div><div className="select-wrap filter-select app-select"><SlidersHorizontal size={14} /><select aria-label="Filter by application" value={application} onChange={(event) => setApplication(event.target.value)}><option value="ALL">All applications</option>{apps.map((app) => <option key={app} value={app}>{app}</option>)}</select></div><button className="button button-secondary date-filter" onClick={() => setSortNewest((current) => !current)}><CalendarDays size={14} />{sortNewest ? 'Newest first' : 'Oldest first'}</button></div></div>
      <div className="table-scroll"><table className="data-table analyses-table"><thead><tr><th>SUBMISSION <span className="th-sort">↕</span></th><th>APPLICATION</th><th>AI LIKELIHOOD</th><th>DECISION</th><th>REVIEW STATUS</th><th>SUBMITTED</th><th /></tr></thead><tbody>
        {filtered.map((analysis) => <tr key={analysis.id} onClick={() => onSelect(analysis)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(analysis)}>
          <td><div className="submission-cell"><span className="file-icon"><span className="file-icon-inner" /></span><span><b>{analysis.title}</b><small>{analysis.id} <i>·</i> {analysis.source}</small></span></div></td>
          <td className="app-cell">{analysis.application}</td><td><div className="score-table-cell"><ScorePill score={analysis.score} /><span className="confidence-caption">{Math.round(analysis.confidence * 100)}% conf.</span></div></td>
          <td><DecisionBadge decision={analysis.finalDecision ?? analysis.decision} /></td><td><ReviewBadge status={analysis.reviewStatus} /></td><td className="time-cell">{formatRelative(analysis.submittedAt)}</td><td><ArrowRight className="row-arrow" size={15} /></td>
        </tr>)}
      </tbody></table></div>
      {filtered.length === 0 && <div className="empty-state"><span className="empty-icon"><Search size={21} /></span><h3>No analyses match those filters</h3><p>Try another search term or clear your filters.</p><button className="button button-secondary" onClick={() => { onQueryChange(''); setDecision('ALL'); setApplication('ALL'); }}>Clear filters</button></div>}
      <div className="table-footer"><span>Showing <b>{filtered.length}</b> of <b>{analyses.length}</b> analyses</span><div className="pagination"><button disabled>←</button><button className="page-number active">1</button><button disabled>2</button><button disabled>3</button><span>…</span><button disabled>Next <ArrowRight size={12} /></button></div></div>
    </section>
    <div className="retention-footnote"><span className="privacy-shield"><Filter size={14} /></span><p><b>Limited retention is enabled.</b> Submission text is held only while this browser session is active. The database design supports full, limited, and hash-only retention modes.</p></div>
  </div>;
}
