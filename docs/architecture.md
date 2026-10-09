# J’eace architecture and prototype boundaries

## Current runnable slice

```text
Browser
  ├─ React + Vite dashboard (responsive, sandbox/local state)
  └─ same-origin /api proxy
        └─ Fastify core API
             ├─ demo API-key gate + rate limit + input validation
             ├─ DetectorAdapter for text
             │    ├─ default deterministic demo scorer
             │    └─ configured Python service HTTP adapter
             │         └─ FastAPI + PyTorch/Transformers (local checkpoint)
             ├─ /v1/documents/analyze
             │    ├─ JPEG/PNG signature + dimension checks
             │    ├─ local English Tesseract.js OCR + limited EXIF tags (no GPS)
             │    └─ optional comparison with caller-supplied trusted transaction values
             ├─ deterministic text threshold decision
             └─ hash-only in-memory text analysis/audit store
```

The dashboard data store and Fastify store are intentionally separate in the sandbox. The dashboard is pre-populated with labeled example workspace fixtures; new browser actions update localStorage, while API text-analysis calls use the Fastify adapter and in-memory store. This allows the UX and API contract to be demonstrated without PostgreSQL, Redis, or text-model artifacts. It is not a deployed multi-tenant system.

The bank receipt page uses a separate, transient path: it sends one JPEG/PNG to `POST /v1/documents/analyze`, which OCRs the image in memory and returns OCR text and limited metadata to the caller without retaining them. The page does not save receipt state to localStorage, and these results are not yet connected to the persistent review queue. Expected fields shown in the sandbox are user-editable demo inputs; a bank integration must provide authoritative values server-to-server. No tamper-detection model, bank-core lookup, PDF support, or automated fraud decision is implemented.

## Production-oriented design artifacts

- `database/schema.sql` defines normalized PostgreSQL entities and tenant RLS policies.
- Core API analysis records capture score, model version, policy version and threshold snapshots.
- A detector interface isolates model selection; the HTTP adapter bounds attempts, uses a timeout/circuit breaker, and returns 503 rather than masking configured inference failure.
- The Python training pipeline creates a local fine-tuned checkpoint and test report; it does not rely on a hosted detector.
- Browser requests use relative URLs; the Vite server proxies `/api` to the API service.

## Not yet wired into the runnable prototype

PostgreSQL persistence, Redis-backed quotas/queues/cache, BullMQ batch analysis, webhooks, JWT sessions, dashboard RBAC, per-customer key lifecycle/rotation, cross-tenant integration tests, encryption-at-rest, retention erasure jobs and deployment TLS are schema/specification or future work. The demo key is deliberately public, and the demo store has only one tenant. Do not expose this prototype as a SaaS service.
