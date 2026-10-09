import { Bell, ChevronDown, CircleHelp, Command, Menu, Search, Sparkles } from 'lucide-react';
import type { PageId } from './Sidebar';

const titles: Record<PageId, string> = {
  overview: 'Overview', analyze: 'New analysis', analyses: 'Analyses', reviews: 'Review queue', policies: 'Policies', applications: 'Applications', analytics: 'Analytics', audit: 'Audit log', docs: 'Developer docs',
};

interface Props {
  page: PageId;
  onMenu: () => void;
  onNewAnalysis: () => void;
  onSearch: (value: string) => void;
  onNavigate: (page: PageId) => void;
}

export function Topbar({ page, onMenu, onNewAnalysis, onSearch, onNavigate }: Props) {
  return <header className="topbar">
    <div className="topbar-left">
      <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMenu}><Menu size={19} /></button>
      <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{titles[page]}</b></div>
    </div>
    <div className="topbar-actions">
      <label className="global-search"><Search size={15} /><input placeholder="Search anything…" onFocus={() => page !== 'analyses' && onNavigate('analyses')} onChange={(event) => onSearch(event.target.value)} /><kbd><Command size={11} /> K</kbd></label>
      <button className="icon-button top-help" aria-label="Help" onClick={() => onNavigate('docs')}><CircleHelp size={17} /></button>
      <button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
      <div className="topbar-divider" />
      <button className="top-avatar-button" aria-label="Account menu"><span className="profile-avatar profile-avatar-small">MP</span><ChevronDown size={14} /></button>
      <button className="top-new-analysis" onClick={onNewAnalysis}><Sparkles size={15} />New analysis</button>
    </div>
  </header>;
}
