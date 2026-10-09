import { createHash, randomUUID } from 'node:crypto';
import type { DetectorOutput } from './detector.js';
import { decide, type Decision } from './policy.js';

export interface PolicyVersion { id: string; tenantId: string; applicationId: string | null; name: string; version: number; flagThreshold: number; blockThreshold: number; createdAt: string; }
export interface ApiAnalysis {
  id: string; tenantId: string; applicationId: string; submittedAt: string; source: string | null; contentType: string; locale: string | null; contentHash: string;
  score: number; confidence: number; classification: 'AI_LIKELY' | 'HUMAN_LIKELY'; model: string; modelVersion: string; latencyMs: number;
  decision: Decision; policyId: string; policyVersion: number; flagThreshold: number; blockThreshold: number; reviewStatus: 'PENDING' | 'NOT_REQUIRED'; reason: string;
}
export interface AuditRecord { id: string; tenantId: string; actor: string; action: string; target: string; timestamp: string; metadata: Record<string, unknown>; }

const now = () => new Date().toISOString();
export const demoTenantId = 'ten_demo_university';
export const demoApplicationId = 'app_demo_student_portal';
const initialPolicy: PolicyVersion = { id: 'pol_academic_standard', tenantId: demoTenantId, applicationId: demoApplicationId, name: 'Academic integrity · Standard', version: 3, flagThreshold: 0.6, blockThreshold: 0.85, createdAt: now() };

export class DemoStore {
  readonly tenantId = demoTenantId;
  readonly applicationId = demoApplicationId;
  private policies: PolicyVersion[] = [initialPolicy];
  private analyses = new Map<string, ApiAnalysis>();
  private auditRecords: AuditRecord[] = [];

  currentPolicy(): PolicyVersion { return this.policies[this.policies.length - 1]; }
  listPolicies(tenantId = this.tenantId): PolicyVersion[] { return this.policies.filter((policy) => policy.tenantId === tenantId); }
  listAnalyses(tenantId = this.tenantId, appId = this.applicationId): ApiAnalysis[] {
    return [...this.analyses.values()].filter((analysis) => analysis.tenantId === tenantId && analysis.applicationId === appId).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  }
  getAnalysis(id: string, tenantId = this.tenantId, appId = this.applicationId): ApiAnalysis | undefined {
    const analysis = this.analyses.get(id);
    return analysis?.tenantId === tenantId && analysis.applicationId === appId ? analysis : undefined;
  }
  createAnalysis(output: DetectorOutput, hash: string, meta: { source?: string; contentType?: string; locale?: string }): ApiAnalysis {
    const policy = this.currentPolicy();
    const decision = decide(output.score, policy);
    const analysis: ApiAnalysis = {
      id: `an_${randomUUID().replaceAll('-', '').slice(0, 10)}`, tenantId: this.tenantId, applicationId: this.applicationId, submittedAt: now(),
      source: meta.source ?? null, contentType: meta.contentType ?? 'text/plain', locale: meta.locale ?? null, contentHash: hash,
      score: output.score, confidence: output.confidence, classification: output.classification, model: output.model, modelVersion: output.modelVersion, latencyMs: output.latencyMs,
      decision, policyId: policy.id, policyVersion: policy.version, flagThreshold: policy.flagThreshold, blockThreshold: policy.blockThreshold,
      reviewStatus: decision === 'ALLOW' ? 'NOT_REQUIRED' : 'PENDING',
      reason: decision === 'ALLOW' ? 'Score is below the review threshold.' : decision === 'FLAG' ? 'AI-likelihood crossed the review threshold.' : 'AI-likelihood crossed the block threshold.',
    };
    this.analyses.set(analysis.id, analysis);
    this.addAudit('ANALYSIS_CREATED', analysis.id, { decision, score: analysis.score, policy_version: analysis.policyVersion });
    return analysis;
  }
  addAudit(action: string, target: string, metadata: Record<string, unknown> = {}): AuditRecord {
    const record: AuditRecord = { id: `au_${randomUUID().replaceAll('-', '').slice(0, 10)}`, tenantId: this.tenantId, actor: 'system', action, target, timestamp: now(), metadata };
    this.auditRecords.unshift(record);
    if (this.auditRecords.length > 1000) this.auditRecords.length = 1000;
    return record;
  }
  listAudit(tenantId = this.tenantId): AuditRecord[] { return this.auditRecords.filter((record) => record.tenantId === tenantId); }
}

export function sha256(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
