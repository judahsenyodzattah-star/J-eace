import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { createDetector, DetectorUnavailableError } from './detector.js';
import type { DetectorAdapter, DetectorOutput } from './detector.js';
import { DemoStore, sha256 } from './store.js';
import type { Decision } from './policy.js';

interface BuildServerOptions {
  store?: DemoStore;
  detector?: DetectorAdapter;
  demoMode?: boolean;
  apiKey?: string;
  quiet?: boolean;
}

type CacheItem = { output: DetectorOutput; expiresAt: number };
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 2000;

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: options.quiet ? false : {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: { paths: ['req.headers.authorization', 'req.headers.x-api-key', 'req.headers.cookie'], censor: '[REDACTED]' },
    },
    genReqId: () => `req_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    bodyLimit: 32 * 1024,
  });
  const store = options.store ?? new DemoStore();
  const detector = options.detector ?? createDetector();
  const demoMode = options.demoMode ?? process.env.JEACE_DEMO_MODE !== 'false';
  const apiKeyHash = sha256(options.apiKey ?? process.env.JEACE_DEMO_API_KEY ?? 'jeace_local_demo_key');
  const cache = new Map<string, CacheItem>();

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: false });
  await app.register(rateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined;
      const key = request.headers['x-api-key']?.toString() ?? bearer;
      return key ? `key:${sha256(key)}` : `ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => ({
      error: { code: 'RATE_LIMITED', message: `Too many requests. Retry after ${context.after}.`, request_id: request.id },
      retry_after: context.after,
    }),
  });

  function error(reply: FastifyReply, statusCode: number, code: string, message: string, requestId: string) {
    return reply.code(statusCode).send({ error: { code, message, request_id: requestId } });
  }

  function authorized(request: FastifyRequest): boolean {
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const key = request.headers['x-api-key']?.toString() ?? bearer;
    if (!key) return false;
    const candidate = Buffer.from(sha256(key), 'hex');
    const stored = Buffer.from(apiKeyHash, 'hex');
    return candidate.length === stored.length && timingSafeEqual(candidate, stored);
  }

  function requireApiKey(request: FastifyRequest, reply: FastifyReply): boolean {
    if (authorized(request)) return true;
    void error(reply, 401, 'UNAUTHORIZED', 'A valid application API key is required.', request.id);
    return false;
  }

  function analysisResponse(analysis: ReturnType<DemoStore['createAnalysis']>) {
    return {
      id: analysis.id,
      score: analysis.score,
      confidence: analysis.confidence,
      classification: analysis.classification,
      model: analysis.model,
      model_version: analysis.modelVersion,
      latency_ms: analysis.latencyMs,
      decision: analysis.decision,
      reason: analysis.reason,
      policy_id: analysis.policyId,
      policy_version: analysis.policyVersion,
      flag_threshold: analysis.flagThreshold,
      block_threshold: analysis.blockThreshold,
      review_status: analysis.reviewStatus,
      created_at: analysis.submittedAt,
    };
  }

  app.get('/health', async (_request, reply) => {
    const health = await detector.healthCheck();
    const healthy = health.healthy || (demoMode && detector.name.includes('demo'));
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', detector: health.name, model_loaded: health.modelLoaded, demo_mode: demoMode, detail: health.detail ?? null });
  });

  app.get('/v1/health', async (_request, reply) => {
    const health = await detector.healthCheck();
    const healthy = health.healthy || (demoMode && detector.name.includes('demo'));
    return reply.code(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', detector: health.name, model_loaded: health.modelLoaded, demo_mode: demoMode, detail: health.detail ?? null });
  });

  app.post<{ Body: Record<string, unknown> }>('/v1/analyze', async (request, reply) => {
    if (!requireApiKey(request, reply)) return;
    const body = request.body ?? {};
    const text = body.text;
    if (typeof text !== 'string' || text.trim().length === 0) return error(reply, 400, 'INVALID_REQUEST', 'Text must not be empty.', request.id);
    if (text.length > 20_000) return error(reply, 413, 'CONTENT_TOO_LARGE', 'Text must not exceed 20,000 characters.', request.id);
    const contentType = typeof body.content_type === 'string' ? body.content_type.slice(0, 100) : 'text/plain';
    const source = typeof body.source === 'string' ? body.source.slice(0, 100) : undefined;
    const locale = typeof body.locale === 'string' ? body.locale.slice(0, 35) : undefined;
    const hash = sha256(text);
    // Cache key includes tenant scope and detector version; opaque hash-only keys avoid retaining text.
    const cacheKey = detector.cacheVersion ? `${store.tenantId}:${hash}:${detector.name}:${detector.cacheVersion}` : null;
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    let output: DetectorOutput;
    if (cached && cached.expiresAt > Date.now()) {
      output = { ...cached.output, latencyMs: 0 };
    } else {
      if (cached && cacheKey) cache.delete(cacheKey);
      try {
        output = await detector.analyze({ text, locale, metadata: { source, contentType } });
        if (cacheKey) {
          if (cache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey) cache.delete(oldestKey);
          }
          cache.set(cacheKey, { output, expiresAt: Date.now() + CACHE_TTL_MS });
        }
      } catch (cause) {
        if (cause instanceof DetectorUnavailableError) return error(reply, 503, 'DETECTOR_UNAVAILABLE', 'The content detector is temporarily unavailable. Please retry once after a short delay.', request.id);
        request.log.error({ err: cause }, 'Unexpected detector failure');
        return error(reply, 503, 'DETECTOR_UNAVAILABLE', 'The content detector could not complete this analysis.', request.id);
      }
    }
    // The store snapshots the policy ID/version/thresholds on every decision.
    const analysis = store.createAnalysis(output, hash, { source, contentType, locale });
    reply.header('x-jeace-demo-mode', detector.name.includes('demo') ? 'true' : 'false');
    return reply.code(200).send(analysisResponse(analysis));
  });

  app.get<{ Querystring: { limit?: string; cursor?: string } }>('/v1/analyses', async (request, reply) => {
    if (!requireApiKey(request, reply)) return;
    const rows = store.listAnalyses();
    const limit = request.query.limit === undefined ? 50 : Number(request.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return error(reply, 400, 'INVALID_REQUEST', 'Limit must be an integer between 1 and 100.', request.id);
    const cursorIndex = request.query.cursor ? rows.findIndex((row) => row.id === request.query.cursor) : -1;
    if (request.query.cursor && cursorIndex < 0) return error(reply, 400, 'INVALID_REQUEST', 'The pagination cursor is invalid.', request.id);
    const offset = cursorIndex + 1;
    const page = rows.slice(offset, offset + limit);
    const hasMore = offset + page.length < rows.length;
    return reply.send({ data: page.map(analysisResponse), meta: { total: rows.length, limit, next_cursor: hasMore ? page.at(-1)?.id ?? null : null } });
  });

  app.get<{ Params: { id: string } }>('/v1/analyses/:id', async (request, reply) => {
    if (!requireApiKey(request, reply)) return;
    const row = store.getAnalysis(request.params.id);
    if (!row) return error(reply, 404, 'ANALYSIS_NOT_FOUND', 'The requested analysis was not found.', request.id);
    return reply.send({ ...analysisResponse(row), source: row.source, content_type: row.contentType, locale: row.locale, content_hash: row.contentHash });
  });

  app.get('/v1/policies', async (request, reply) => {
    if (!requireApiKey(request, reply)) return;
    return reply.send({ data: store.listPolicies().map((policy) => ({ id: policy.id, name: policy.name, version: policy.version, strategy: 'THRESHOLD', flag_threshold: policy.flagThreshold, block_threshold: policy.blockThreshold, application_id: policy.applicationId, created_at: policy.createdAt })) });
  });

  app.get('/v1/analytics', async (request, reply) => {
    if (!requireApiKey(request, reply)) return;
    const rows = store.listAnalyses();
    const counts: Record<Decision, number> = { ALLOW: 0, FLAG: 0, BLOCK: 0 };
    rows.forEach((row) => { counts[row.decision] += 1; });
    const averageLatency = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.latencyMs, 0) / rows.length) : 0;
    return reply.send({ total_analyses: rows.length, decisions: counts, average_latency_ms: averageLatency, retention_mode: 'HASH_ONLY', sample_data: false });
  });

  app.get('/openapi.json', async (_request, reply) => reply.send({ openapi: '3.1.0', info: { title: 'J’eace Core API', version: '1.0.0' }, servers: [{ url: '/v1' }], paths: { '/analyze': { post: { summary: 'Analyze content', security: [{ ApiKeyAuth: [] }], responses: { '200': { description: 'Probabilistic detection result and policy decision' }, '400': { description: 'Invalid request' }, '401': { description: 'Unauthorized' }, '429': { description: 'Rate limited' }, '503': { description: 'Detector unavailable' } } } }, '/analyses': { get: { summary: 'List application analyses' } }, '/analyses/{id}': { get: { summary: 'Get analysis by id' } }, '/policies': { get: { summary: 'List application policies' } }, '/analytics': { get: { summary: 'Usage and decision aggregates' } } }, components: { securitySchemes: { ApiKeyAuth: { type: 'http', scheme: 'bearer' } } } }));

  app.setNotFoundHandler((request, reply) => error(reply, 404, 'NOT_FOUND', 'The requested endpoint does not exist.', request.id));
  app.setErrorHandler((cause, request, reply) => {
    if (typeof cause === 'object' && cause !== null && 'validation' in cause && cause.validation) return error(reply, 400, 'INVALID_REQUEST', 'The request body is invalid.', request.id);
    if (typeof cause === 'object' && cause !== null && 'statusCode' in cause && cause.statusCode === 413) return error(reply, 413, 'CONTENT_TOO_LARGE', 'The request body exceeds the configured size limit.', request.id);
    if (typeof cause === 'object' && cause !== null && 'statusCode' in cause && cause.statusCode === 400) return error(reply, 400, 'INVALID_REQUEST', 'The request body could not be parsed.', request.id);
    request.log.error({ err: cause }, 'Unhandled API error');
    return error(reply, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.', request.id);
  });
  return app;
}
