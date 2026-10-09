import { useState } from 'react';
import { Activity, ArrowRight, Check, ChevronDown, Copy, ExternalLink, KeyRound, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2, Webhook, X } from 'lucide-react';
import type { Application } from '../types';
import { Modal } from './Modal';
import { formatNumber } from '../lib/format';

interface Props {
  applications: Application[];
  onCreate: (name: string, description: string) => void;
  onRotate: (id: string, suffix: string) => void;
  onToggle: (id: string) => void;
}

export function ApplicationsPage({ applications, onCreate, onRotate, onToggle }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [showKey, setShowKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [menuAppId, setMenuAppId] = useState('');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const activeCount = applications.filter((app) => app.status === 'ACTIVE').length;
  const totalUsage = applications.reduce((sum, app) => sum + app.monthlyUsage, 0);
  const totalQuota = applications.reduce((sum, app) => sum + app.monthlyQuota, 0);

  function createApplication() {
    if (!name.trim()) { setError('Give your application a name.'); return; }
    onCreate(name.trim(), description.trim()); setName(''); setDescription(''); setShowCreate(false); setError('');
  }

  function rotate(app: Application) {
    const suffix = Math.random().toString(36).slice(2, 6);
    onRotate(app.id, suffix);
    setShowKey(`jce_demo_${Math.random().toString(36).slice(2, 10)}_${suffix}`);
    setCopied(false);
  }

  function copyKey() {
    if (!showKey) return;
    void navigator.clipboard?.writeText(showKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => setCopied(false));
  }

  return <div className="page-content">
    <div className="page-heading"><div><div className="eyebrow">INTEGRATIONS <span className="eyebrow-separator">/</span> MULTI-TENANT WORKSPACE</div><h1>Applications</h1><p>Connect products, manage credentials, and keep usage within agreed limits.</p></div><div className="heading-actions"><button className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={15} />Add application</button></div></div>
    <div className="app-overview-strip"><div className="app-strip-metric"><span className="app-strip-icon app-icon-blue"><Activity size={16} /></span><div><b>{applications.length}</b><small>Applications</small></div></div><span className="strip-divider" /><div className="app-strip-metric"><span className="app-strip-icon app-icon-green"><span className="health-dot" /></span><div><b>{activeCount} active</b><small>Connected this month</small></div></div><span className="strip-divider" /><div className="app-strip-metric usage-strip"><span className="app-strip-icon app-icon-violet"><Activity size={16} /></span><div><b>{formatNumber(totalUsage)} <small>/ {formatNumber(totalQuota)}</small></b><small>Analyses used this month</small></div></div><div className="strip-privacy"><ShieldCheck size={14} />Tenant scoped</div></div>
    <div className="applications-grid">{applications.map((app, index) => {
      const percent = Math.min(100, Math.round((app.monthlyUsage / app.monthlyQuota) * 100));
      return <article className="card application-card" key={app.id}>
        <div className="app-card-top"><div className={`app-logo app-logo-${index % 4}`}>{app.name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('').toUpperCase()}</div><span className={`app-status ${app.status === 'ACTIVE' ? 'app-status-active' : 'app-status-paused'}`}><i />{app.status}</span><div className="app-menu-wrap"><button className="app-menu-button" aria-label={`More actions for ${app.name}`} onClick={() => setMenuAppId(menuAppId === app.id ? '' : app.id)}><MoreHorizontal size={18} /></button>{menuAppId === app.id && <div className="app-actions-menu"><button onClick={() => { onToggle(app.id); setMenuAppId(''); }}>{app.status === 'ACTIVE' ? 'Pause application' : 'Resume application'}</button><button onClick={() => { rotate(app); setMenuAppId(''); }}><RefreshCw size={12} />Rotate API key</button></div>}</div></div>
        <h2>{app.name}</h2><p className="app-description">{app.description}</p>
        <div className="app-key-row"><span className="key-icon"><KeyRound size={14} /></span><span className="app-key-value">jeace_live_••••••••••••{app.keySuffix}</span><button title="Rotate API key" aria-label={`Rotate API key for ${app.name}`} onClick={() => rotate(app)}><RefreshCw size={13} /></button><button title="Copy key placeholder" aria-label={`Copy key placeholder for ${app.name}`} onClick={() => { setShowKey(`jeace_demo_${app.keySuffix}`); setCopied(false); }}><Copy size={13} /></button></div>
        <div className="app-usage-block"><div className="app-usage-heading"><span>MONTHLY USAGE</span><b>{formatNumber(app.monthlyUsage)} <small>/ {formatNumber(app.monthlyQuota)}</small></b></div><div className="usage-progress"><span className={percent >= 85 ? 'usage-high' : ''} style={{ width: `${percent}%` }} /></div><span className="usage-percent">{percent}% of plan allowance</span></div>
        <div className="app-card-footer"><div><span>POLICY</span><b>{app.policy}</b></div><div><span>LAST ACTIVE</span><b>{app.lastUsed}</b></div><button className="app-card-link" title="View app settings" onClick={() => setSelectedApp(app)}><ArrowRight size={15} /></button></div>
      </article>;
    })}
    <button className="add-application-card" onClick={() => setShowCreate(true)}><span className="add-app-circle"><Plus size={20} /></span><b>Connect an application</b><span>Issue a separate API key and policy for each integration.</span><small>Add application <ArrowRight size={13} /></small></button>
    </div>
    <div className="app-security-foot"><span className="app-security-icon"><ShieldCheck size={16} /></span><div><b>API keys are hashed at rest</b><p>In this clickable sandbox, keys are placeholders. Production keys should be shown once at creation, hashed before storage, and scoped to a single application.</p></div><button className="text-link">Credential guide <ArrowRight size={13} /></button></div>

    {showCreate && <Modal title="Connect an application" eyebrow="APPLICATION SETUP" onClose={() => setShowCreate(false)}><div className="create-app-form"><p>Each application gets its own identity, quota, and moderation policy assignment.</p><div className="form-field"><label htmlFor="app-name">Application name <span className="required-star">*</span></label><input id="app-name" value={name} onChange={(event) => { setName(event.target.value); setError(''); }} placeholder="e.g. Course Discussion Board" autoFocus /></div><div className="form-field"><label htmlFor="app-description">Description</label><textarea id="app-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will this integration analyze?" rows={3} /></div><div className="create-app-defaults"><span><Check size={14} />Default policy assigned</span><span><Check size={14} />Sandbox quota: 1,000 / month</span></div>{error && <span className="field-error">{error}</span>}<div className="modal-actions"><button className="button button-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="button button-primary" onClick={createApplication}>Create application <ArrowRight size={14} /></button></div></div></Modal>}
    {showKey && <Modal title="Sandbox credential" eyebrow="DEMO KEY · ONE-TIME VIEW" onClose={() => setShowKey('')}><div className="key-created-notice"><span className="key-created-icon"><Check size={17} /></span><div><b>Demo key generated</b><p>This is a placeholder for the UI walkthrough, not a production credential.</p></div></div><div className="key-reveal-box"><code>{showKey}</code><button onClick={copyKey}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button></div><div className="key-warning"><ShieldCheck size={15} /><span>Real keys are never recoverable after creation. Only their hash is stored.</span></div><div className="modal-actions key-modal-actions"><button className="button button-primary" onClick={() => setShowKey('')}>Done</button></div></Modal>}
    {selectedApp && <Modal title={selectedApp.name} eyebrow={`APPLICATION · ${selectedApp.id}`} onClose={() => setSelectedApp(null)}><div className="app-detail-modal"><p>{selectedApp.description}</p><div className="detail-meta-list"><div><span><Activity size={14} />Status</span><b>{selectedApp.status}</b></div><div><span><KeyRound size={14} />Credential suffix</span><b>•••• {selectedApp.keySuffix}</b></div><div><span><ShieldCheck size={14} />Assigned policy</span><b>{selectedApp.policy}</b></div><div><span><Activity size={14} />Monthly quota</span><b>{formatNumber(selectedApp.monthlyUsage)} / {formatNumber(selectedApp.monthlyQuota)}</b></div></div><div className="modal-actions"><button className="button button-secondary" onClick={() => setSelectedApp(null)}>Close</button><button className="button button-primary" onClick={() => { rotate(selectedApp); setSelectedApp(null); }}>Rotate demo key <RefreshCw size={13} /></button></div></div></Modal>}
  </div>;
}
