import { describe, expect, it } from 'vitest';
import { scoreInDemoMode } from '../src/lib/demoDetector';

describe('sandbox scorer contract', () => {
  it('returns a bounded score and labels its output as a demo heuristic', () => {
    const result = scoreInDemoMode({ text: 'An example sentence for a small test.', flagThreshold: 0.6, blockThreshold: 0.85 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.model).toContain('demo');
    expect(result.modelVersion).toBe('demo.1');
  });
  it('uses the supplied policy thresholds deterministically', () => {
    const sample = 'Moreover, a comprehensive and pivotal approach can foster progress. In conclusion, this landscape underscores the importance. Furthermore, it is important to note that the result can delve into the issue.';
    const lowThreshold = scoreInDemoMode({ text: sample, flagThreshold: 0.25, blockThreshold: 0.45 });
    expect(lowThreshold.decision).toBe('BLOCK');
    const highThreshold = scoreInDemoMode({ text: sample, flagThreshold: 0.95, blockThreshold: 0.99 });
    expect(highThreshold.decision).toBe('ALLOW');
  });
  it('exposes explainable demo-only signal labels and short-sample caveat', () => {
    const result = scoreInDemoMode({ text: 'A few words here.', flagThreshold: 0.6, blockThreshold: 0.85 });
    expect(result.signals?.map((signal) => signal.label)).toEqual(['Text length', 'Lexical variation', 'Formulaic phrasing']);
    expect(result.signals?.[0].description).toContain('Short samples');
  });
});
