import type { AnalyzeResult } from '../types';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'ApiError'; }
}

export interface ApiAnalyzeInput {
  text: string;
  source?: string;
  content_type?: string;
  locale?: string;
  author_id?: string;
  context?: Record<string, unknown>;
}

export async function submitAnalysis(input: ApiAnalyzeInput): Promise<AnalyzeResult> {
  const response = await fetch('/api/v1/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': import.meta.env.VITE_JEACE_DEMO_API_KEY ?? 'jeace_local_demo_key' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(payload?.error?.message ?? `Analysis request failed (${response.status})`, response.status);
  }
  const payload = await response.json();
  return {
    id: payload.id,
    score: payload.score,
    confidence: payload.confidence,
    classification: payload.classification,
    model: payload.model,
    modelVersion: payload.model_version ?? payload.modelVersion,
    latencyMs: payload.latency_ms ?? payload.latencyMs,
    decision: payload.decision,
    reason: payload.reason,
    policyId: payload.policy_id ?? payload.policyId,
    policyVersion: payload.policy_version ?? payload.policyVersion,
    flagThreshold: payload.flag_threshold ?? payload.flagThreshold,
    blockThreshold: payload.block_threshold ?? payload.blockThreshold,
    reviewStatus: payload.review_status ?? payload.reviewStatus,
    signals: payload.signals,
  } as AnalyzeResult;
}

export async function getHealth(): Promise<{ status: string; detector: string; modelLoaded: boolean }> {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error('Could not reach the API');
  return response.json();
}
