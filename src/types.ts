export type Decision = 'ALLOW' | 'FLAG' | 'BLOCK';
export type ReviewStatus = 'PENDING' | 'UPHELD' | 'OVERTURNED' | 'NOT_REQUIRED';

export interface Analysis {
  id: string;
  title: string;
  application: string;
  source: string;
  contentType: string;
  submittedAt: string;
  score: number;
  confidence: number;
  decision: Decision;
  finalDecision?: Decision;
  reviewStatus: ReviewStatus;
  model?: string;
  modelVersion: string;
  latencyMs: number;
  policyId?: string;
  policyName?: string;
  flagThreshold?: number;
  blockThreshold?: number;
  policyVersion: number;
  preview: string;
  text?: string;
  reason: string;
}

export interface Policy {
  id: string;
  name: string;
  application: string;
  description: string;
  flagThreshold: number;
  blockThreshold: number;
  version: number;
  updatedAt: string;
  status: 'ACTIVE' | 'DRAFT';
}

export interface Application {
  id: string;
  name: string;
  description: string;
  keySuffix: string;
  status: 'ACTIVE' | 'PAUSED';
  monthlyUsage: number;
  monthlyQuota: number;
  policy: string;
  lastUsed: string;
}

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  detail: string;
  kind: 'security' | 'policy' | 'analysis' | 'review' | 'application';
}

export interface AnalyzeResult {
  id: string;
  score: number;
  confidence: number;
  classification: 'AI_LIKELY' | 'HUMAN_LIKELY';
  model: string;
  modelVersion: string;
  latencyMs: number;
  decision: Decision;
  reason: string;
  policyId?: string;
  policyVersion: number;
  flagThreshold?: number;
  blockThreshold?: number;
  reviewStatus: ReviewStatus;
  signals?: Array<{ label: string; value: string; description: string }>;
}
