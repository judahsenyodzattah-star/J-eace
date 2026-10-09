import { describe, expect, it } from 'vitest';
import { decide, validateThresholds } from '../server/src/policy';

describe('moderation policy engine', () => {
  const policy = { flagThreshold: 0.6, blockThreshold: 0.85 };
  it('allows scores below the flag threshold', () => {
    expect(decide(0, policy)).toBe('ALLOW');
    expect(decide(0.5999, policy)).toBe('ALLOW');
  });
  it('flags scores from the flag threshold up to (but excluding) the block threshold', () => {
    expect(decide(0.6, policy)).toBe('FLAG');
    expect(decide(0.8499, policy)).toBe('FLAG');
  });
  it('blocks scores at or above the block threshold', () => {
    expect(decide(0.85, policy)).toBe('BLOCK');
    expect(decide(1, policy)).toBe('BLOCK');
  });
  it('rejects inverted, equal, or out-of-range thresholds', () => {
    expect(() => validateThresholds({ flagThreshold: 0.9, blockThreshold: 0.8 })).toThrow();
    expect(() => validateThresholds({ flagThreshold: 0.8, blockThreshold: 0.8 })).toThrow();
    expect(() => validateThresholds({ flagThreshold: -0.1, blockThreshold: 0.8 })).toThrow();
  });
  it('rejects invalid scores rather than silently clamping them', () => {
    expect(() => decide(-0.01, policy)).toThrow();
    expect(() => decide(1.01, policy)).toThrow();
    expect(() => decide(Number.NaN, policy)).toThrow();
  });
});
