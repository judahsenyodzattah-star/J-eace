import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clock3, FileText, Fingerprint, Gauge, Info, ShieldCheck, X } from 'lucide-react';
import { Sidebar, type PageId } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { OverviewPage } from './components/OverviewPage';
import { AnalyzePage } from './components/AnalyzePage';
import { AnalysesPage } from './components/AnalysesPage';
import { ReviewPage } from './components/ReviewPage';
import { PoliciesPage } from './components/PoliciesPage';
import { ApplicationsPage } from './components/ApplicationsPage';
import { AnalyticsPage } from './components/AnalyticsPage';
import { AuditPage } from './components/AuditPage';
import { DocsPage } from './components/DocsPage';
import { DecisionBadge } from './components/StatusBadge';
import { ScorePill } from './components/ScorePill';
import { Modal } from './components/Modal';
import { Toast } from './components/Toast';
import { seedAnalyses, seedApplications, seedAudit, seedPolicies } from './data';
import type { Analysis, AnalyzeResult, Application, AuditEvent, Decision, Policy } from './types';
import { formatRelative } from './lib/format';

function readStored<T>(key: string, initial: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : initial;
  } catch { return initial; }
}

function App() {
  const [page, setPage] = useState<PageId>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [analyses, setAnalyses] = useState<Analysis[]>(() => readStored('jeace-analyses-v1', seedAnalyses));
  const [policies, setPolicies] = useState<Policy[]>(() => readStored('jeace-policies-v1', seedPolicies));
  const [applications, setApplications] = useState<Application[]>(() => readStored('jeace-applications-v1', seedApplications));
  const [audit, setAudit] = useState<AuditEvent[]>(() => readStored('jeace-audit-v1', seedAudit));
  const [globalQuery, setGlobalQuery] = useState('');
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const activePolicy = policies[0] ?? seedPolicies[0];
  const pendingReviews = analyses.filter((analysis) => analysis.reviewStatus === 'PENDING').length;
  const activeTitle = useMemo(() => activePolicy?.name ?? 'Academic integrity · Standard', [activePolicy?.id, activePolicy?.version]);

  useEffect(() => {
    const withoutContent = analyses.map(({ text, ...analysis }) => text
      ? { ...analysis, title: `${analysis.source[0]?.toUpperCase() ?? 'S'}${analysis.source.slice(1)} · ${analysis.id.slice(-4).toUpperCase()}`, preview: 'Submitted content withheld by limited-retention settings.' }
      : analysis);
    localStorage.setItem('jeace-analyses-v1', JSON.stringify(withoutContent));
  }, [analyses]);
  useEffect(() => localStorage.setItem('jeace-policies-v1', JSON.stringify(policies)), [policies]);
  useEffect(() => localStorage.setItem('jeace-applications-v1', JSON.stringify(applications)), [applications]);
  useEffect(() => localStorage.setItem('jeace-audit-v1', JSON.stringify(audit.slice(0, 80))), [audit]);
  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function addAudit(action: string, target: string, detail: string, kind: AuditEvent['kind']) {
    const event: AuditEvent = { id: `au_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`, actor: action === 'ANALYSIS_CREATED' ? 'System' : 'Maya Patel', action, target, timestamp: new Date().toISOString(), detail, kind };
    setAudit((current) => [event, ...current]);
  }

  function handleAnalysis(analysis: Analysis, _result: AnalyzeResult, usingFallback: boolean) {
    setAnalyses((current) => [analysis, ...current.filter((item) => item.id !== analysis.id)]);
    addAudit('ANALYSIS_CREATED', analysis.id, `Student Portal · ${analysis.decision} · score ${analysis.score.toFixed(2)}`, 'analysis');
    setToast({ message: usingFallback ? 'Analysis completed with the browser sandbox scorer.' : 'Analysis completed and added to your history.', tone: 'success' });
  }

  function reviewAnalysis(id: string, status: 'UPHELD' | 'OVERTURNED', finalDecision: Decision, note: string) {
    setAnalyses((current) => current.map((item) => item.id === id ? { ...item, reviewStatus: status, finalDecision } : item));
    addAudit(status === 'UPHELD' ? 'REVIEW_UPHELD' : 'REVIEW_OVERTURNED', id, `${status === 'UPHELD' ? 'Original decision upheld' : `Decision changed to ${finalDecision}`} · ${note}`, 'review');
    setToast({ message: status === 'UPHELD' ? 'Decision upheld and audit record created.' : `Decision overturned to ${finalDecision}.`, tone: 'success' });
  }

  function savePolicy(policy: Policy) {
    setPolicies((current) => current.map((item) => item.id === policy.id ? policy : item));
    addAudit('POLICY_UPDATED', `${policy.id} · v${policy.version}`, `Thresholds saved: flag ${Math.round(policy.flagThreshold * 100)}%, block ${Math.round(policy.blockThreshold * 100)}%`, 'policy');
    setToast({ message: `Policy version ${policy.version} published. Historical decisions are unchanged.`, tone: 'success' });
  }

  function createPolicy(policy: Policy) {
    setPolicies((current) => [...current, policy]);
    addAudit('POLICY_CREATED', `${policy.id} · v${policy.version}`, 'A new moderation policy was created in draft.', 'policy');
  }

  function createApplication(name: string, description: string) {
    const app: Application = { id: `app_${crypto.randomUUID().replaceAll('-', '').slice(0, 6)}`, name, description: description || 'New application integration.', keySuffix: Math.random().toString(36).slice(2, 6), status: 'ACTIVE', monthlyUsage: 0, monthlyQuota: 1000, policy: activeTitle, lastUsed: 'Never' };
    setApplications((current) => [app, ...current]);
    addAudit('APPLICATION_CREATED', app.id, `${name} connected with default sandbox quota`, 'application');
    setToast({ message: `${name} added to your workspace.`, tone: 'success' });
  }

  function rotateKey(id: string, suffix: string) {
    const app = applications.find((item) => item.id === id);
    setApplications((current) => current.map((item) => item.id === id ? { ...item, keySuffix: suffix, lastUsed: 'Just now' } : item));
    addAudit('API_KEY_ROTATED', id, 'Previous key revoked; demo placeholder replacement generated.', 'security');
    setToast({ message: `Sandbox key placeholder rotated${app ? ` for ${app.name}` : ''}.`, tone: 'success' });
  }

  function toggleApplication(id: string) {
    const app = applications.find((item) => item.id === id);
    if (!app) return;
    const status = app.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    setApplications((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    addAudit(status === 'PAUSED' ? 'APPLICATION_PAUSED' : 'APPLICATION_RESUMED', id, `${app.name} ${status.toLowerCase()}`, 'application');
    setToast({ message: `${app.name} ${status === 'ACTIVE' ? 'resumed' : 'paused'}.`, tone: 'success' });
  }

  function navigate(nextPage: PageId) {
    setPage(nextPage); setMobileNavOpen(false);
  }

  let view;
  switch (page) {
    case 'overview': view = <OverviewPage analyses={analyses} onNavigate={navigate} onSelect={setSelectedAnalysis} />; break;
    case 'analyze': view = <AnalyzePage flagThreshold={activePolicy.flagThreshold} blockThreshold={activePolicy.blockThreshold} policyName={activePolicy.name} policyId={activePolicy.id} policyVersion={activePolicy.version} onAnalyzed={handleAnalysis} onNavigate={navigate} />; break;
    case 'analyses': view = <AnalysesPage analyses={analyses} query={globalQuery} onQueryChange={setGlobalQuery} onSelect={setSelectedAnalysis} />; break;
    case 'reviews': view = <ReviewPage analyses={analyses} onReview={reviewAnalysis} />; break;
    case 'policies': view = <PoliciesPage policies={policies} onSave={savePolicy} onCreate={createPolicy} />; break;
    case 'applications': view = <ApplicationsPage applications={applications} onCreate={createApplication} onRotate={rotateKey} onToggle={toggleApplication} />; break;
    case 'analytics': view = <AnalyticsPage />; break;
    case 'audit': view = <AuditPage events={audit} />; break;
    case 'docs': view = <DocsPage />; break;
  }

  return <div className="app-shell">
    <Sidebar page={page} onChange={navigate} open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} pendingReviews={pendingReviews} />
    <div className="main-shell"><Topbar page={page} onMenu={() => setMobileNavOpen(true)} onNewAnalysis={() => navigate('analyze')} onSearch={setGlobalQuery} onNavigate={navigate} /><main className="main-content">{view}</main><footer className="app-footer"><span>© 2026 J’eace · Evaluation, Authenticity, Classification &amp; Enforcement</span><span><span className="health-dot" />Sandbox workspace online</span><button onClick={() => navigate('docs')}>Documentation <ArrowRight size={12} /></button></footer></div>
    {selectedAnalysis && <Modal title="Analysis details" eyebrow={`ANALYSIS · ${selectedAnalysis.id}`} onClose={() => setSelectedAnalysis(null)}><div className="detail-modal-content"><div className="detail-modal-title"><div><h3>{selectedAnalysis.title}</h3><p>{selectedAnalysis.application} <i>·</i> {selectedAnalysis.source} <i>·</i> {formatRelative(selectedAnalysis.submittedAt)}</p></div><DecisionBadge decision={selectedAnalysis.finalDecision ?? selectedAnalysis.decision} /></div><div className="detail-score-line"><div><ScorePill score={selectedAnalysis.score} large /><span>AI likelihood</span></div><div><b>{Math.round(selectedAnalysis.confidence * 100)}%</b><span>confidence</span></div><div><b>{selectedAnalysis.latencyMs} ms</b><span>latency</span></div></div><div className="detail-meta-list"><div><span><Fingerprint size={14} />Policy</span><span className="policy-snapshot"><b>{selectedAnalysis.policyName ?? activeTitle} · v{selectedAnalysis.policyVersion}</b><small>{selectedAnalysis.policyId ?? 'policy snapshot'} · Flag {Math.round((selectedAnalysis.flagThreshold ?? 0.6) * 100)}% · Block {Math.round((selectedAnalysis.blockThreshold ?? 0.85) * 100)}%</small></span></div><div><span><Gauge size={14} />Model</span><b>{selectedAnalysis.model ?? 'j-eace-demo-heuristic'} · {selectedAnalysis.modelVersion}</b></div><div><span><Clock3 size={14} />Reason</span><b>{selectedAnalysis.reason}</b></div></div><div className="detail-content-preview"><span><FileText size={13} />CONTENT PREVIEW</span><p>{selectedAnalysis.text ?? selectedAnalysis.preview}</p>{!selectedAnalysis.text && <small>Full text not available under limited retention.</small>}</div><div className="modal-disclaimer"><Info size={14} /><span>Probabilistic signal only. It is not proof of authorship. Each decision references immutable policy thresholds.</span></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setSelectedAnalysis(null)}>Close</button>{selectedAnalysis.reviewStatus === 'PENDING' && <button className="button button-primary" onClick={() => { setSelectedAnalysis(null); navigate('reviews'); }}>Open in review queue <ArrowRight size={14} /></button>}</div></div></Modal>}
    {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
    <div className="global-demo-indicator"><span className="health-dot" /><span>DEMO WORKSPACE</span><button title="Demo data and heuristic scoring are for walkthroughs only." aria-label="About demo workspace"><Info size={13} /></button></div>
  </div>;
}

export default App;
