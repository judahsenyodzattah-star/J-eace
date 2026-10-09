import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CircleHelp, Clock3, Cpu, FileCheck2, Layers3, ShieldAlert, ShieldBan, ShieldCheck, Sparkles, UsersRound, Zap } from 'lucide-react';
import type { Analysis, Decision } from '../types';
import { trend } from '../data';
import { formatRelative } from '../lib/format';
import { DecisionBadge, ReviewBadge } from './StatusBadge';
import { ScorePill } from './ScorePill';
import type { PageId } from './Sidebar';

interface Props {
  analyses: Analysis[];
  onNavigate: (page: PageId) => void;
  onSelect: (analysis: Analysis) => void;
}

function TrendChart() {
  const width = 680;
  const height = 206;
  const pad = { top: 16, right: 10, bottom: 24, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = 600;
  type SeriesKey = 'allow' | 'flag' | 'block';
  const series: { key: SeriesKey; color: string; fill?: string }[] = [
    { key: 'allow', color: '#635bdf', fill: 'url(#allowFill)' },
    { key: 'flag', color: '#e5a43b' },
    { key: 'block', color: '#df6673' },
  ];
  const coords = (key: SeriesKey) => trend.map((item, index) => ({
    x: pad.left + (innerW / (trend.length - 1)) * index,
    y: pad.top + innerH - (item[key] / max) * innerH,
  }));
  const line = (points: { x: number; y: number }[]) => points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const firstSeries = coords('allow');
  const area = `${line(firstSeries)} L ${firstSeries[firstSeries.length - 1].x} ${pad.top + innerH} L ${firstSeries[0].x} ${pad.top + innerH} Z`;
  return <div className="chart-plot trend-plot">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Analysis decisions over the last seven days">
      <defs><linearGradient id="allowFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#635bdf" stopOpacity=".14" /><stop offset="100%" stopColor="#635bdf" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((n) => {
        const y = pad.top + (innerH / 4) * n;
        return <g key={n}><line className="grid-line" x1={pad.left} x2={width - pad.right} y1={y} y2={y} /><text className="axis-label" x="0" y={y + 3}>{600 - n * 150}</text></g>;
      })}
      <path d={area} fill="url(#allowFill)" />
      {series.map((item) => {
        const points = coords(item.key);
        return <g key={item.key}><path d={line(points)} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.1" fill="#fff" stroke={item.color} strokeWidth="2" />)}</g>;
      })}
      {trend.map((item, index) => <text className="axis-label axis-day" key={item.day} x={pad.left + (innerW / (trend.length - 1)) * index} y={height - 3} textAnchor="middle">{item.day}</text>)}
    </svg>
  </div>;
}

function DecisionRing() {
  const counts: Record<Decision, number> = { ALLOW: 2448, FLAG: 319, BLOCK: 79 };
  const total = counts.ALLOW + counts.FLAG + counts.BLOCK;
  const allow = (counts.ALLOW / total) * 100;
  const flag = (counts.FLAG / total) * 100;
  return <div className="decision-chart-wrap">
    <div className="donut" style={{ background: `conic-gradient(#635bdf 0 ${allow}%, #e7aa48 ${allow}% ${allow + flag}%, #e3757e ${allow + flag}% 100%)` }}>
      <div className="donut-center"><strong>{(total / 1000).toFixed(1)}k</strong><span>decisions</span></div>
    </div>
    <div className="donut-legend">
      <div className="legend-item"><span className="legend-dot legend-allow" /><span>Allowed</span><b>86.0%</b></div>
      <div className="legend-item"><span className="legend-dot legend-flag" /><span>Flagged</span><b>11.2%</b></div>
      <div className="legend-item"><span className="legend-dot legend-block" /><span>Blocked</span><b>2.8%</b></div>
    </div>
  </div>;
}

export function OverviewPage({ analyses, onNavigate, onSelect }: Props) {
  const recent = analyses.slice(0, 4);
  const pending = analyses.filter((item) => item.reviewStatus === 'PENDING').length;
  return <div className="page-content overview-page">
    <div className="page-heading heading-overview">
      <div><div className="eyebrow">FRIDAY, OCTOBER 09, 2026 <span className="eyebrow-separator">·</span> EXAMPLE UNIVERSITY</div><h1>A clearer picture of content integrity.</h1><p>Monitor signals, review decisions, and keep your policies in tune.</p></div>
      <div className="heading-actions"><span className="demo-data-pill"><i /> Sandbox data</span><button className="button button-primary" onClick={() => onNavigate('analyze')}><Sparkles size={15} />Analyze content</button></div>
    </div>

    <div className="metrics-grid">
      <MetricCard title="Analyses this week" value="2,846" change="12.8%" trend="up" icon={<Layers3 size={18} />} footnote="vs. previous 7 days" accent="violet" />
      <MetricCard title="Flagged for review" value="319" change="4.2%" trend="down" icon={<ShieldAlert size={18} />} footnote="of all analyzed content" accent="amber" />
      <MetricCard title="Blocked by policy" value="79" change="8.1%" trend="up" icon={<ShieldBan size={18} />} footnote="1.4% of submissions" accent="rose" />
      <MetricCard title="Median response" value="184" suffix="ms" change="16 ms" trend="down" icon={<Zap size={18} />} footnote="last 24 hours" accent="green" />
    </div>

    <div className="overview-chart-grid">
      <section className="card chart-card trend-card">
        <div className="card-header chart-card-header"><div><div className="card-title-line"><h2>Decision activity</h2><button className="subtle-icon" aria-label="About this chart"><CircleHelp size={14} /></button></div><p>Daily outcomes across connected applications</p></div><div className="select-pill">Last 7 days <span className="select-caret">⌄</span></div></div>
        <div className="chart-legend"><span><i className="chart-legend-allow" />Allow</span><span><i className="chart-legend-flag" />Flag</span><span><i className="chart-legend-block" />Block</span><span className="legend-source">Live decision volume</span></div>
        <TrendChart />
      </section>
      <section className="card decision-card">
        <div className="card-header"><div><h2>Decision mix</h2><p>Outcomes over the last 7 days</p></div><button className="more-button" aria-label="More options">···</button></div>
        <DecisionRing />
        <div className="decision-card-foot"><span><span className="status-pulse" />Policy engine active</span><button onClick={() => onNavigate('analytics')}>View analytics <ArrowRight size={13} /></button></div>
      </section>
    </div>

    <div className="overview-lower-grid">
      <section className="card recent-card">
        <div className="card-header recent-card-header"><div><h2>Recent analyses</h2><p>The latest decisions from your workspace</p></div><button className="text-link" onClick={() => onNavigate('analyses')}>View all <ArrowRight size={14} /></button></div>
        <div className="table-scroll"><table className="data-table recent-table"><thead><tr><th>SUBMISSION</th><th>AI LIKELIHOOD</th><th>DECISION</th><th>TIME</th><th /></tr></thead><tbody>
          {recent.map((analysis) => <tr key={analysis.id} onClick={() => onSelect(analysis)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onSelect(analysis)}>
            <td><div className="submission-cell"><span className="file-icon"><FileCheck2 size={15} /></span><span><b>{analysis.title}</b><small>{analysis.application} <i>·</i> {analysis.source}</small></span></div></td>
            <td><ScorePill score={analysis.score} /></td><td><DecisionBadge decision={analysis.finalDecision ?? analysis.decision} /></td><td className="time-cell">{formatRelative(analysis.submittedAt)}</td><td><ArrowRight className="row-arrow" size={15} /></td>
          </tr>)}
        </tbody></table></div>
        {recent.length === 0 && <div className="empty-state compact-empty">No analyses yet. Run your first analysis to see it here.</div>}
      </section>
      <section className="card health-card">
        <div className="card-header"><div><h2>Detector health</h2><p>Inference &amp; model status</p></div><span className="health-status"><i />DEMO</span></div>
        <div className="model-status-block"><div className="model-icon"><Cpu size={20} /></div><div><b>Sandbox heuristic</b><span>Demo scoring · not a trained model</span></div></div>
        <div className="health-stat-list"><div><span>Model version</span><b>demo.1</b></div><div><span>Median latency</span><b>184 ms <small className="positive-inline">−9%</small></b></div><div><span>Service uptime</span><b className="uptime-val"><span className="health-dot" />99.98%</b></div></div>
        <div className="health-note"><ShieldCheck size={15} /><span>Detection is probabilistic. A score is not proof of authorship.</span></div>
        <button className="health-details" onClick={() => onNavigate('docs')}>Configure a trained model <ArrowRight size={14} /></button>
      </section>
    </div>

    <div className="overview-bottom-row">
      <div className="queue-note"><div className="queue-note-icon"><UsersRound size={17} /></div><span><b>{pending} items need human review</b><small>Human judgment stays in the loop for every flagged case.</small></span><button onClick={() => onNavigate('reviews')}>Open queue <ArrowRight size={14} /></button></div>
      <div className="privacy-note"><span className="privacy-shield"><ShieldCheck size={15} /></span><span><b>Privacy-first workspace</b><small>Demo content is not retained after this session.</small></span></div>
    </div>
  </div>;
}

function MetricCard({ title, value, suffix, change, trend: direction, icon, footnote, accent }: { title: string; value: string; suffix?: string; change: string; trend: 'up' | 'down'; icon: ReactNode; footnote: string; accent: string }) {
  const isGood = (title.includes('Flagged') || title.includes('Blocked') || title.includes('response')) ? direction === 'down' : direction === 'up';
  const TrendIcon = direction === 'up' ? ArrowUpRight : ArrowDownRight;
  return <article className={`metric-card metric-${accent}`}><div className="metric-top"><span>{title}</span><span className="metric-icon">{icon}</span></div><div className="metric-value-row"><strong>{value}</strong>{suffix && <small>{suffix}</small>}<span className={`metric-change ${isGood ? 'change-positive' : 'change-neutral'}`}><TrendIcon size={13} />{change}</span></div><div className="metric-footnote">{footnote}</div><div className="metric-sparkline" aria-hidden="true"><svg viewBox="0 0 90 25"><path d="M1 19 C14 20 17 7 28 13 S43 18 51 10 S64 5 72 10 S82 9 89 3" /></svg></div></article>;
}
