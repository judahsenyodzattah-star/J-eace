import type { Decision, ReviewStatus } from '../types';

export function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className={`badge badge-${decision.toLowerCase()}`}><i />{decision}</span>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const label = status === 'PENDING' ? 'Needs review' : status === 'NOT_REQUIRED' ? 'No review' : status.toLowerCase();
  return <span className={`review-badge review-${status.toLowerCase()}`}><i />{label}</span>;
}
