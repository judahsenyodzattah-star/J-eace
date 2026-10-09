import type { Analysis, Application, AuditEvent, Policy } from './types';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const seedAnalyses: Analysis[] = [
  {
    id: 'an_8f31c9', title: 'ENG 204 · Essay draft', application: 'Student Portal', source: 'assignment', contentType: 'text/plain', submittedAt: ago(7),
    score: 0.74, confidence: 0.88, decision: 'FLAG', reviewStatus: 'PENDING', modelVersion: 'demo.1', latencyMs: 182, policyVersion: 3,
    preview: 'A short reflective essay on the role of public libraries in modern communities…', reason: 'AI-likelihood crossed the review threshold.',
  },
  {
    id: 'an_8f31c8', title: 'CS 118 · Forum response', application: 'LMS', source: 'discussion', contentType: 'text/plain', submittedAt: ago(19),
    score: 0.22, confidence: 0.81, decision: 'ALLOW', reviewStatus: 'NOT_REQUIRED', modelVersion: 'demo.1', latencyMs: 164, policyVersion: 3,
    preview: 'I approached the problem by splitting the input into smaller cases, then tested…', reason: 'Score is below the review threshold.',
  },
  {
    id: 'an_8f31c7', title: 'BIO 202 · Lab report', application: 'Assignment Checker', source: 'assignment', contentType: 'text/plain', submittedAt: ago(43),
    score: 0.93, confidence: 0.96, decision: 'BLOCK', reviewStatus: 'PENDING', modelVersion: 'demo.1', latencyMs: 207, policyVersion: 3,
    preview: 'The results demonstrate a statistically significant relationship between…', reason: 'AI-likelihood crossed the block threshold.',
  },
  {
    id: 'an_8f31c6', title: 'ART 110 · Portfolio reflection', application: 'Student Portal', source: 'portfolio', contentType: 'text/plain', submittedAt: ago(81),
    score: 0.67, confidence: 0.79, decision: 'FLAG', reviewStatus: 'PENDING', modelVersion: 'demo.1', latencyMs: 176, policyVersion: 3,
    preview: 'When I began the project, I thought about the contrast between light and…', reason: 'AI-likelihood crossed the review threshold.',
  },
  {
    id: 'an_8f31c5', title: 'ENG 204 · Discussion reply', application: 'LMS', source: 'discussion', contentType: 'text/plain', submittedAt: ago(191),
    score: 0.15, confidence: 0.76, decision: 'ALLOW', reviewStatus: 'NOT_REQUIRED', modelVersion: 'demo.1', latencyMs: 159, policyVersion: 3,
    preview: 'I agree with your point about narrative voice, especially in the final chapter…', reason: 'Score is below the review threshold.',
  },
  {
    id: 'an_8f31c4', title: 'PSY 210 · Research abstract', application: 'Research Repository', source: 'research', contentType: 'text/plain', submittedAt: ago(324),
    score: 0.88, confidence: 0.91, decision: 'BLOCK', reviewStatus: 'UPHELD', finalDecision: 'BLOCK', modelVersion: 'demo.1', latencyMs: 196, policyVersion: 3,
    preview: 'This study examines the relationship between sleep quality and cognitive…', reason: 'Original decision upheld by a moderator.',
  },
  {
    id: 'an_8f31c3', title: 'CS 118 · Lab notes', application: 'Assignment Checker', source: 'assignment', contentType: 'text/plain', submittedAt: ago(468),
    score: 0.41, confidence: 0.83, decision: 'ALLOW', reviewStatus: 'NOT_REQUIRED', modelVersion: 'demo.1', latencyMs: 169, policyVersion: 3,
    preview: 'The first implementation was too slow because it revisited every item…', reason: 'Score is below the review threshold.',
  },
];

export const seedPolicies: Policy[] = [
  { id: 'pol_001', name: 'Academic integrity · Standard', application: 'All applications', description: 'Balanced thresholds for coursework and general student-submitted content.', flagThreshold: 0.6, blockThreshold: 0.85, version: 3, updatedAt: 'Oct 04, 2026', status: 'ACTIVE' },
  { id: 'pol_002', name: 'Research · Human review first', application: 'Research Repository', description: 'Higher bar for enforcement; ambiguous cases are routed to a specialist reviewer.', flagThreshold: 0.52, blockThreshold: 0.92, version: 2, updatedAt: 'Sep 28, 2026', status: 'ACTIVE' },
];

export const seedApplications: Application[] = [
  { id: 'app_01', name: 'Student Portal', description: 'Student-facing submission and writing tools.', keySuffix: 'c2a9', status: 'ACTIVE', monthlyUsage: 12840, monthlyQuota: 20000, policy: 'Academic integrity · Standard', lastUsed: '2 min ago' },
  { id: 'app_02', name: 'LMS', description: 'Course discussions, assignments and instructor workflows.', keySuffix: '91df', status: 'ACTIVE', monthlyUsage: 8662, monthlyQuota: 12000, policy: 'Academic integrity · Standard', lastUsed: '8 min ago' },
  { id: 'app_03', name: 'Assignment Checker', description: 'Pre-submission feedback for coursework.', keySuffix: '••••', status: 'PAUSED', monthlyUsage: 3920, monthlyQuota: 8000, policy: 'Academic integrity · Standard', lastUsed: 'Yesterday' },
  { id: 'app_04', name: 'Research Repository', description: 'Research abstracts and repository submissions.', keySuffix: '4e72', status: 'ACTIVE', monthlyUsage: 1840, monthlyQuota: 5000, policy: 'Research · Human review first', lastUsed: '26 min ago' },
];

export const seedAudit: AuditEvent[] = [
  { id: 'au_1', actor: 'Maya Patel', action: 'REVIEW_OVERTURNED', target: 'an_8f31c1', timestamp: ago(24), detail: 'Decision changed to ALLOW · note added', kind: 'review' },
  { id: 'au_2', actor: 'Maya Patel', action: 'POLICY_UPDATED', target: 'pol_001 · v3', timestamp: ago(3 * 60), detail: 'Flag threshold adjusted from 0.58 to 0.60', kind: 'policy' },
  { id: 'au_3', actor: 'System', action: 'ANALYSIS_CREATED', target: 'an_8f31c9', timestamp: ago(7), detail: 'Student Portal · FLAG · score 0.74', kind: 'analysis' },
  { id: 'au_4', actor: 'Alex Morgan', action: 'API_KEY_ROTATED', target: 'app_01', timestamp: ago(22 * 60), detail: 'Previous key revoked; replacement issued', kind: 'security' },
  { id: 'au_5', actor: 'System', action: 'ANALYSIS_CREATED', target: 'an_8f31c7', timestamp: ago(43), detail: 'Assignment Checker · BLOCK · score 0.93', kind: 'analysis' },
  { id: 'au_6', actor: 'Alex Morgan', action: 'APPLICATION_PAUSED', target: 'app_03', timestamp: ago(28 * 60), detail: 'Assignment Checker paused by workspace owner', kind: 'application' },
  { id: 'au_7', actor: 'Sam Rivera', action: 'REVIEW_UPHELD', target: 'an_8f31c4', timestamp: ago(61), detail: 'BLOCK upheld · evidence note recorded', kind: 'review' },
];

export const trend = [
  { day: 'Mon', allow: 308, flag: 43, block: 10 },
  { day: 'Tue', allow: 370, flag: 52, block: 14 },
  { day: 'Wed', allow: 347, flag: 39, block: 8 },
  { day: 'Thu', allow: 431, flag: 60, block: 17 },
  { day: 'Fri', allow: 407, flag: 51, block: 12 },
  { day: 'Sat', allow: 272, flag: 33, block: 7 },
  { day: 'Sun', allow: 313, flag: 41, block: 11 },
];
