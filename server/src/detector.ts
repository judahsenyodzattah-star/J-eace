export interface DetectorInput { text: string; locale?: string; metadata?: Record<string, unknown>; }
export interface DetectorOutput { score: number; confidence: number; classification: 'AI_LIKELY' | 'HUMAN_LIKELY'; model: string; modelVersion: string; latencyMs: number; }
export interface DetectorHealth { healthy: boolean; name: string; modelLoaded: boolean; detail?: string; }
export interface DetectorAdapter { readonly name: string; readonly cacheVersion?: string; analyze(input: DetectorInput): Promise<DetectorOutput>; healthCheck(): Promise<DetectorHealth>; }

class DemoHeuristicDetector implements DetectorAdapter {
  readonly name = 'j-eace-demo-heuristic';
  readonly cacheVersion = 'demo.1';
  async analyze({ text }: DetectorInput): Promise<DetectorOutput> {
    const started = performance.now();
    const normalized = text.trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const lower = normalized.toLowerCase();
    const sentenceCount = Math.max(1, (normalized.match(/[.!?]+/g) ?? []).length);
    const uniqueRatio = new Set(words.map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ''))).size / Math.max(words.length, 1);
    const phrases = ['moreover', 'furthermore', 'in conclusion', 'it is important to note', 'delve', 'pivotal', 'comprehensive', 'foster', 'underscores', 'landscape'];
    const transitionHits = phrases.filter((phrase) => lower.includes(phrase)).length;
    const repeatedPunctuation = /([.!?])\1{1,}/.test(normalized);
    const longTextFactor = Math.min(words.length / 180, 1);
    const formulaicFactor = Math.min(transitionHits / 4, 1);
    const regularityFactor = Math.max(0, 1 - Math.abs(uniqueRatio - 0.58) * 2.2);
    const rhythmFactor = Math.min(sentenceCount / Math.max(words.length / 18, 1), 1);
    const raw = 0.17 + longTextFactor * 0.11 + formulaicFactor * 0.29 + regularityFactor * 0.12 + (repeatedPunctuation ? 0.06 : 0) + Math.max(0, rhythmFactor - 0.82) * 0.17;
    const score = Math.max(0.08, Math.min(0.94, Number(raw.toFixed(2))));
    const confidence = Math.max(0.52, Math.min(0.87, Number((0.55 + longTextFactor * 0.27 + Math.min(words.length / 120, 1) * 0.05).toFixed(2))));
    const latencyMs = Math.round(Math.max(35, Math.min(110, 36 + words.length * 0.17)) + (performance.now() - started));
    return { score, confidence, classification: score >= 0.5 ? 'AI_LIKELY' : 'HUMAN_LIKELY', model: this.name, modelVersion: 'demo.1', latencyMs };
  }
  async healthCheck(): Promise<DetectorHealth> { return { healthy: true, name: this.name, modelLoaded: false, detail: 'Sandbox-only deterministic heuristic; no trained weights are loaded.' }; }
}

class HttpTransformerDetector implements DetectorAdapter {
  readonly name = 'j-eace-transformer';
  readonly cacheVersion = process.env.DETECTOR_MODEL_VERSION;
  private failures = 0;
  private openUntil = 0;
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 4_000) {}

  async analyze(input: DetectorInput): Promise<DetectorOutput> {
    if (Date.now() < this.openUntil) throw new DetectorUnavailableError('Detector circuit is open; retry after a short delay.');
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/internal/predict`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: input.text, locale: input.locale ?? 'en' }), signal: controller.signal,
        });
        if (!response.ok) {
          const retryable = response.status >= 500 || response.status === 429;
          if (retryable && attempt === 0) { lastError = new Error(`ML service returned ${response.status}`); continue; }
          throw new DetectorUnavailableError(`ML service returned ${response.status}.`);
        }
        const payload = await response.json() as Record<string, unknown>;
        const score = Number(payload.score);
        const confidence = Number(payload.confidence);
        if (!Number.isFinite(score) || score < 0 || score > 1) throw new DetectorUnavailableError('ML service returned an invalid score.');
        this.failures = 0; this.openUntil = 0;
        return {
          score, confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : Math.max(score, 1 - score),
          classification: payload.classification === 'HUMAN_LIKELY' ? 'HUMAN_LIKELY' : 'AI_LIKELY',
          model: typeof payload.model === 'string' ? payload.model : this.name,
          modelVersion: typeof payload.model_version === 'string' ? payload.model_version : 'unknown',
          latencyMs: Math.max(0, Number(payload.latency_ms) || 0),
        };
      } catch (error) {
        lastError = error;
        if (error instanceof DetectorUnavailableError && !/returned 5\d\d|returned 429/.test(error.message)) break;
        if (attempt === 0) continue;
      } finally { clearTimeout(timer); }
    }
    this.failures += 1;
    if (this.failures >= 3) this.openUntil = Date.now() + 15_000;
    const message = lastError instanceof Error && lastError.name === 'AbortError' ? 'ML inference timed out.' : 'ML inference is unavailable.';
    throw new DetectorUnavailableError(message);
  }

  async healthCheck(): Promise<DetectorHealth> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), Math.min(this.timeoutMs, 1500));
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/health`, { signal: controller.signal });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      const loaded = Boolean(data.model_loaded ?? data.modelLoaded);
      return { healthy: response.ok && loaded, name: this.name, modelLoaded: loaded, detail: loaded ? 'Transformer checkpoint is ready.' : 'Inference service is reachable, but no trained checkpoint is loaded.' };
    } catch { return { healthy: false, name: this.name, modelLoaded: false, detail: 'Inference service could not be reached.' }; }
    finally { clearTimeout(timer); }
  }
}

export class DetectorUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'DetectorUnavailableError'; }
}

class UnconfiguredDetector implements DetectorAdapter {
  readonly name = 'unconfigured-detector';
  async analyze(_input: DetectorInput): Promise<DetectorOutput> {
    throw new DetectorUnavailableError('No trained detector service is configured.');
  }
  async healthCheck(): Promise<DetectorHealth> {
    return { healthy: false, name: this.name, modelLoaded: false, detail: 'Set ML_SERVICE_URL to a private trained inference service.' };
  }
}

export function createDetector(): DetectorAdapter {
  const modelUrl = process.env.ML_SERVICE_URL;
  if (modelUrl) return new HttpTransformerDetector(modelUrl);
  return process.env.JEACE_DEMO_MODE === 'false' ? new UnconfiguredDetector() : new DemoHeuristicDetector();
}
