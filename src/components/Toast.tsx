import { Check, X } from 'lucide-react';

export function Toast({ message, onDismiss, tone = 'success' }: { message: string; onDismiss: () => void; tone?: 'success' | 'error' }) {
  return <div className={`toast toast-${tone}`} role="status"><span className="toast-icon">{tone === 'success' ? <Check size={15} /> : <X size={15} />}</span>{message}<button onClick={onDismiss} aria-label="Dismiss message"><X size={14} /></button></div>;
}
