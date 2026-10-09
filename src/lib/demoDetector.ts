import type { AnalyzeResult, Decision } from '../types';

export interface DetectionInput {
  text: string;
  flagThreshold: number;
  blockThreshold: number;
  policyVersion?: number;
  policyId?: string;
}

/**
 * Small, deterministic sandbox scorer used only while no trained checkpoint is configured.
 * It is intentionally labeled as a heuristic and must never be used for production decisions.
 */
export function scoreInDemoMode({ text, flagThreshold, blockThreshold, policyVersion, policyId }: DetectionInput): AnalyzeResult {
  const normalized = text.trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const lower = normalized.toLowerCase();
  const sentenceCount = Math.max(1, (normalized.match(/[.!?]+/g) ?? []).length);
  const uniqueRatio = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ''))).size / Math.max(words.length, 1);
  const transitions = ['moreover', 'furthermore', 'in conclusion', 'it is important to note', 'delve', 'pivotal', 'comprehensive', 'foster', 'underscores', 'landscape'];
  const transitionHits = transitions.filter((phrase) => lower.includes(phrase)).length;
  const repeatedPunctuation = /([.!?])\1{1,}/.test(normalized);
  const longTextFactor = Math.min(words.length / 180, 1);
  const formulaicFactor = Math.min(transitionHits / 4, 1);
  const regularityFactor = Math.max(0, 1 - Math.abs(uniqueRatio - 0.58) * 2.2);
  const punctuationFactor = repeatedPunctuation ? 0.06 : 0;
  const rhythmFactor = Math.min(sentenceCount / Math.max(words.length / 18, 1), 1);
  const raw = 0.17 + longTextFactor * 0.11 + formulaicFactor * 0.29 + regularityFactor * 0.12 + punctuationFactor + Math.max(0, rhythmFactor - 0.82) * 0.17;
  const score = Math.max(0.08, Math.min(0.94, Number(raw.toFixed(2))));
  const confidence = Math.max(0.52, Math.min(0.87, Number((0.55 + longTextFactor * 0.27 + Math.min(words.length / 120, 1) * 0.05).toFixed(2))));
  const decision: Decision = score >= blockThreshold ? 'BLOCK' : score >= flagThreshold ? 'FLAG' : 'ALLOW';
  const reason = decision === 'BLOCK'
    ? 'Estimated AI-likelihood is above this application’s block threshold.'
    : decision === 'FLAG'
      ? 'Estimated AI-likelihood is within the human-review band.'
      : 'Estimated AI-likelihood is below this application’s review threshold.';
  const latencyMs = Math.max(35, Math.min(110, 36 + words.length * 0.17));

  return {
    id: `an_${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
    score,
    confidence,
    classification: score >= 0.5 ? 'AI_LIKELY' : 'HUMAN_LIKELY',
    model: 'j-eace-demo-heuristic',
    modelVersion: 'demo.1',
    latencyMs: Math.round(latencyMs),
    decision,
    reason,
    policyId,
    policyVersion: policyVersion ?? 3,
    flagThreshold,
    blockThreshold,
    reviewStatus: decision === 'FLAG' || decision === 'BLOCK' ? 'PENDING' : 'NOT_REQUIRED',
    signals: [
      { label: 'Text length', value: `${words.length} words`, description: words.length < 80 ? 'Short samples are less reliable.' : 'Enough text for the demo heuristic to inspect.' },
      { label: 'Lexical variation', value: `${Math.round(uniqueRatio * 100)}%`, description: 'Unique-word ratio; a weak stylistic indicator, not proof of authorship.' },
      { label: 'Formulaic phrasing', value: `${transitionHits} matches`, description: 'A few common transitions are counted in this demonstration only.' },
    ],
  };
}
