# J’eace architecture and prototype boundaries

## Current runnable slice

```text
Browser
  ├─ React + Vite dashboard (responsive, sandbox/local state)
  └─ same-origin /api proxy
        └─ Fastify core API
             ├─ demo API-key gate + rate limit + input validation
             ├─ DetectorAdapter
             │    ├─ default deterministic demo scorer
             │    └─ configured Python service HTTP adapter
             │         └─ FastAPI + PyTorch/Transformers (local checkpoint)
             ├─ deterministic threshold decision
             └─ hash-only in-memory analysis/audit store
```

The dashboard data store and Fastify store are intentionally separate in the sandbox. The dashboard is pre-populated with labeled example workspace fixtures; new browser actions update localStorage, while API analysis calls use the Fastify adapter and in-memory store. This allows the UX and API contract to be demonstrated without PostgreSQL, Redis, or model artifacts. It is not a deployed multi-tenant system.

## Production-oriented design artifacts

- `database/schema.sql` defines normalized PostgreSQL entities and tenant RLS policies.
- Core API analysis records capture score, model version, policy version and threshold snapshots.
- A detector interface isolates model selection; the HTTP adapter bounds attempts, uses a timeout/circuit breaker, and returns 503 rather than masking configured inference failure.
- The Python training pipeline creates a local fine-tuned checkpoint and test report; it does not rely on a hosted detector.
- Browser requests use relative URLs; the Vite server proxies `/api` to the API service.

## Not yet wired into the runnable prototype

PostgreSQL persistence, Redis-backed quotas/queues/cache, BullMQ batch analysis, webhooks, JWT sessions, dashboard RBAC, per-customer key lifecycle/rotation, cross-tenant integration tests, encryption-at-rest, retention erasure jobs and deployment TLS are schema/specification or future work. The demo key is deliberately public, and the demo store has only one tenant. Do not expose this prototype as a SaaS service.
