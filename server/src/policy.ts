export type Decision = 'ALLOW' | 'FLAG' | 'BLOCK';

export interface ThresholdPolicy {
  flagThreshold: number;
  blockThreshold: number;
}

export function validateThresholds(policy: ThresholdPolicy): void {
  const { flagThreshold, blockThreshold } = policy;
  if (!Number.isFinite(flagThreshold) || !Number.isFinite(blockThreshold)) {
    throw new Error('Thresholds must be finite numbers.');
  }
  if (flagThreshold < 0 || flagThreshold > 1 || blockThreshold < 0 || blockThreshold > 1) {
    throw new Error('Thresholds must be between 0.0 and 1.0.');
  }
  if (flagThreshold >= blockThreshold) {
    throw new Error('The block threshold must be higher than the flag threshold.');
  }
}

/** Deterministic policy evaluation; a score is never modified by this function. */
export function decide(score: number, policy: ThresholdPolicy): Decision {
  validateThresholds(policy);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('Score must be between 0.0 and 1.0.');
  }
  if (score >= policy.blockThreshold) return 'BLOCK';
  if (score >= policy.flagThreshold) return 'FLAG';
  return 'ALLOW';
}
