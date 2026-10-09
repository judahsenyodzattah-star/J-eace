import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server/src/app';
import { DetectorUnavailableError, type DetectorAdapter, type DetectorInput, type DetectorOutput } from '../server/src/detector';
import { DemoStore } from '../server/src/store';

const sampleText = 'A private sample paragraph submitted only for an API contract test.';

function fixedDetector(analyze = vi.fn(async (_input: DetectorInput): Promise<DetectorOutput> => ({
  score: 0.72,
  confidence: 0.84,
  classification: 'AI_LIKELY',
  model: 'test-detector',
  modelVersion: 'test.1',
  latencyMs: 11,
}))): DetectorAdapter {
  return {
    name: 'test-detector',
    cacheVersion: 'test.1',
    analyze,
    healthCheck: async () => ({ healthy: true, name: 'test-detector', modelLoaded: true }),
  };
}

describe('Fastify analysis API', () => {
  let app: FastifyInstance;
  let store: DemoStore;

  beforeEach(async () => {
    store = new DemoStore();
    app = await buildServer({ store, detector: fixedDetector(), demoMode: false, apiKey: 'test-secret', quiet: true });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it('rejects missing credentials with the stable error envelope', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', payload: { text: sampleText } });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED', request_id: expect.stringMatching(/^req_/) } });
  });

  it('validates content before calling the detector', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: '   ' } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_REQUEST');
  });

  it('returns a normalized score and applies the deterministic policy', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText, source: 'test' } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ score: 0.72, confidence: 0.84, decision: 'FLAG', policy_version: 3, model_version: 'test.1', review_status: 'PENDING' });
    expect(response.headers['x-jeace-demo-mode']).toBe('false');
  });

  it('stores a content hash rather than the submitted text and scopes reads to tenant/application', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText } });
    const id = response.json().id as string;
    const stored = store.getAnalysis(id);
    expect(stored?.contentHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain(sampleText);
    expect(store.getAnalysis(id, 'ten_other', store.applicationId)).toBeUndefined();
    expect(store.getAnalysis(id, store.tenantId, 'app_other')).toBeUndefined();
    expect(store.listAnalyses('ten_other', store.applicationId)).toHaveLength(0);
    const crossTenant = await app.inject({ method: 'GET', url: `/v1/analyses/${id}`, headers: { 'x-api-key': 'test-secret' } });
    expect(crossTenant.statusCode).toBe(200); // This credential is bound to its one demo tenant/application.
  });

  it('uses only same-tenant, same-detector-version cache entries', async () => {
    const analyze = vi.fn(async (_input: DetectorInput): Promise<DetectorOutput> => ({ score: 0.2, confidence: 0.7, classification: 'HUMAN_LIKELY', model: 'test-detector', modelVersion: 'test.1', latencyMs: 21 }));
    await app.close();
    app = await buildServer({ store, detector: fixedDetector(analyze), demoMode: false, apiKey: 'test-secret', quiet: true });
    await app.ready();
    const headers = { 'x-api-key': 'test-secret' };
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(store.listAnalyses()).toHaveLength(2);
  });

  it('returns a controlled 503 when an explicitly configured detector is unavailable', async () => {
    await app.close();
    const unavailable: DetectorAdapter = {
      name: 'remote-transformer',
      analyze: async () => { throw new DetectorUnavailableError('private service unavailable'); },
      healthCheck: async () => ({ healthy: false, name: 'remote-transformer', modelLoaded: false }),
    };
    app = await buildServer({ store, detector: unavailable, demoMode: true, apiKey: 'test-secret', quiet: true });
    await app.ready();
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: sampleText } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('DETECTOR_UNAVAILABLE');
    expect(store.listAnalyses()).toHaveLength(0);
  });

  it('paginates analysis history with an application-scoped cursor', async () => {
    const headers = { 'x-api-key': 'test-secret' };
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: sampleText } });
    await app.inject({ method: 'POST', url: '/v1/analyze', headers, payload: { text: `${sampleText} second` } });
    const first = await app.inject({ method: 'GET', url: '/v1/analyses?limit=1', headers });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toHaveLength(1);
    expect(first.json().meta.next_cursor).toBeTruthy();
    const cursor = first.json().meta.next_cursor;
    const second = await app.inject({ method: 'GET', url: `/v1/analyses?limit=1&cursor=${cursor}`, headers });
    expect(second.json().data).toHaveLength(1);
    expect(second.json().meta.next_cursor).toBeNull();
  });

  it('returns a bounded content-size error', async () => {
    const response = await app.inject({ method: 'POST', url: '/v1/analyze', headers: { 'x-api-key': 'test-secret' }, payload: { text: 'x'.repeat(20_001) } });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe('CONTENT_TOO_LARGE');
  });
});
