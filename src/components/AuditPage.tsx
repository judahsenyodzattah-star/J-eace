import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronDown, Download, Search, Shield, ShieldCheck } from 'lucide-react';
import type { AuditEvent } from '../types';
import { formatRelative } from '../lib/format';

interface Props { events: AuditEvent[]; }
const iconFor = (kind: AuditEvent['kind']) => kind === 'security' ? <Shield size={15} /> : kind === 'policy' ? <ShieldCheck size={15} /> : kind === 'review' ? <ShieldCheck size={15} /> : kind === 'application' ? <Shield size={15} /> : <span className="audit-analysis-icon">A</span>;

export function AuditPage({ events }: Props) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('ALL');
  const filtered = useMemo(() => events.filter((event) => {
    const matchesKind = kind === 'ALL' || event.kind === kind;
    const matchesQuery = !query || `${event.actor} ${event.action} ${event.target} ${event.detail}`.toLowerCase().includes(query.toLowerCase());
    return matchesKind && matchesQuery;
  }), [events, kind, query]);
  function exportAudit() {
    const rows = [['event_id', 'actor', 'action', 'target', 'time', 'detail'], ...filtered.map((event) => [event.id, event.actor, event.action, event.target, event.timestamp, event.detail])];
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'jeace-audit-log.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">ACCOUNTABILITY <span className="eyebrow-separator">/</span> IMMUTABLE HISTORY</div><h1>Audit log</h1><p>Trace security-sensitive actions and moderation changes across your workspace.</p></div><div className="heading-actions"><button className="button button-secondary" onClick={exportAudit}><Download size={14} />Export log</button></div></div>
    <div className="audit-assurance"><div className="audit-assurance-icon"><ShieldCheck size={19} /></div><div><b>Workspace actions are recorded.</b><span>Audit records include the actor, target, action and timestamp. Secret values and submitted text are excluded.</span></div><span className="audit-retention-tag">RETENTION · 365 DAYS</span></div>
    <div className="audit-summary-grid"><div className="card audit-summary-card"><span className="audit-summary-icon audit-sum-blue"><Shield size={16} /></span><div><b>{events.filter((e) => e.kind === 'security').length.toString().padStart(2, '0')}</b><span>Security events</span></div><small>Last 30 days</small></div><div className="card audit-summary-card"><span className="audit-summary-icon audit-sum-violet"><ShieldCheck size={16} /></span><div><b>{events.filter((e) => e.kind === 'policy').length.toString().padStart(2, '0')}</b><span>Policy changes</span></div><small>Last 30 days</small></div><div className="card audit-summary-card"><span className="audit-summary-icon audit-sum-amber"><span>✓</span></span><div><b>{events.filter((e) => e.kind === 'review').length.toString().padStart(2, '0')}</b><span>Review actions</span></div><small>Last 30 days</small></div><div className="card audit-summary-card"><span className="audit-summary-icon audit-sum-green"><span>A</span></span><div><b>{events.filter((e) => e.kind === 'analysis').length.toString().padStart(2, '0')}</b><span>Analysis events</span></div><small>Last 30 days</small></div></div>
    <section className="card audit-card"><div className="audit-card-header"><div><h2>Event history</h2><p>Chronological record of workspace activity</p></div><div className="audit-controls"><label className="audit-search"><Search size={14} /><input placeholder="Search events…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="select-wrap audit-kind-select"><select aria-label="Filter events" value={kind} onChange={(event) => setKind(event.target.value)}><option value="ALL">All events</option><option value="security">Security</option><option value="policy">Policy</option><option value="review">Review</option><option value="analysis">Analysis</option><option value="application">Application</option></select><ChevronDown size={13} /></div><button className="button button-secondary audit-date-button"><CalendarDays size={13} />Date range</button></div></div>
      <div className="audit-event-list">{filtered.map((event) => <div className="audit-event-row" key={event.id}><span className={`audit-event-icon audit-kind-${event.kind}`}>{iconFor(event.kind)}</span><div className="audit-event-main"><div><b>{event.action.replaceAll('_', ' ')}</b><span className={`audit-type-tag audit-tag-${event.kind}`}>{event.kind}</span></div><p>{event.detail}</p><span className="audit-target">Target · <code>{event.target}</code></span></div><div className="audit-actor"><span className="audit-actor-avatar">{event.actor === 'System' ? 'SY' : event.actor.split(' ').map((x) => x[0]).join('')}</span><span><b>{event.actor}</b><small>Workspace actor</small></span></div><time>{formatRelative(event.timestamp)}</time><button className="audit-row-detail" aria-label={`Details for ${event.action}`} title="Event metadata"><ArrowRight size={14} /></button></div>)}{filtered.length === 0 && <div className="empty-state"><h3>No matching events</h3><p>Change the filters to view more audit activity.</p></div>}</div>
      <div className="table-footer audit-footer"><span>Showing <b>{filtered.length}</b> of <b>{events.length}</b> events</span><div className="pagination"><button disabled>←</button><button className="page-number active">1</button><button disabled>2</button><button disabled>Next <ArrowRight size={12} /></button></div></div>
    </section>
    <div className="audit-immutable-note"><ShieldCheck size={15} /><span>Audit records are append-only. The production design prevents updates and deletes at the database layer.</span></div>
  </div>;
}
