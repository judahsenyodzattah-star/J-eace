import { ShieldCheck } from 'lucide-react';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <div className="brand-mark"><ShieldCheck size={20} strokeWidth={2.35} /></div>
      {!compact && <div className="brand-wordmark"><strong>J’eace</strong><span>TRUST &amp; SAFETY</span></div>}
    </div>
  );
}
