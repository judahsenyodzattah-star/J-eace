import {
  Activity, Aperture, BarChart3, BookOpenText, Boxes, ChevronDown,
  ClipboardList, FileSearch2, Fingerprint, Gauge, LifeBuoy,
  ScrollText, Settings2, ShieldCheck,
} from 'lucide-react';
import { Logo } from './Logo';

export type PageId = 'overview' | 'analyze' | 'analyses' | 'reviews' | 'policies' | 'applications' | 'analytics' | 'audit' | 'docs';

const workspaceItems = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'analyze', label: 'New analysis', icon: Aperture },
  { id: 'analyses', label: 'Analyses', icon: FileSearch2, count: '2.8k' },
  { id: 'reviews', label: 'Review queue', icon: ClipboardList, count: '12', countTone: 'hot' },
];
const governanceItems = [
  { id: 'policies', label: 'Policies', icon: Fingerprint },
  { id: 'applications', label: 'Applications', icon: Boxes },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'audit', label: 'Audit log', icon: ScrollText },
];

interface Props {
  page: PageId;
  onChange: (page: PageId) => void;
  open: boolean;
  onClose: () => void;
  pendingReviews: number;
}

export function Sidebar({ page, onChange, open, onClose, pendingReviews }: Props) {
  const renderItems = (items: typeof workspaceItems) => items.map((item) => {
    const Icon = item.icon;
    const selected = page === item.id;
    const count = item.id === 'reviews' ? pendingReviews : item.count;
    return (
      <button key={item.id} className={`nav-item ${selected ? 'active' : ''}`} onClick={() => { onChange(item.id as PageId); onClose(); }}>
        <Icon size={17} strokeWidth={selected ? 2.2 : 1.85} />
        <span>{item.label}</span>
        {count && <span className={`nav-count ${item.id === 'reviews' ? 'nav-count-hot' : ''}`}>{count}</span>}
      </button>
    );
  });

  return <>
    {open && <button aria-label="Close navigation" className="mobile-scrim" onClick={onClose} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><Logo /><button className="workspace-switch"><span className="workspace-avatar">EU</span><span className="workspace-name"><b>Example University</b><small>Workspace</small></span><ChevronDown size={14} /></button></div>
      <nav className="side-navigation" aria-label="Main navigation">
        <div className="nav-group-label">WORKSPACE</div>
        {renderItems(workspaceItems)}
        <div className="nav-group-label nav-gap">GOVERNANCE</div>
        {renderItems(governanceItems)}
        <div className="nav-group-label nav-gap">RESOURCES</div>
        <button className={`nav-item ${page === 'docs' ? 'active' : ''}`} onClick={() => { onChange('docs'); onClose(); }}><BookOpenText size={17} strokeWidth={1.85} /><span>Developer docs</span></button>
      </nav>
      <div className="sidebar-bottom">
        <div className="model-mini-card">
          <div className="mini-model-top"><span className="health-dot" /><span>DETECTOR STATUS</span><Activity size={13} /></div>
          <strong>Sandbox heuristic</strong>
          <span className="mini-model-note">Transformer checkpoint not connected</span>
          <div className="mini-model-divider"><span /><span>demo.1</span></div>
        </div>
        <button className="nav-item support-item" onClick={() => onChange('docs')}><LifeBuoy size={17} strokeWidth={1.85} /><span>Help &amp; support</span></button>
        <div className="sidebar-profile">
          <div className="profile-avatar">MP</div><div className="profile-name"><b>Maya Patel</b><small>Workspace owner</small></div><Settings2 size={16} className="profile-settings" />
        </div>
      </div>
    </aside>
  </>;
}
