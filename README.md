# J’eace — AI Content Detection & Moderation Platform

**Evaluation, Authenticity, Classification & Enforcement.** J’eace evaluates submitted text, returns a probabilistic AI-likelihood score, and includes a separate bank transfer-receipt OCR/metadata review sandbox. Text moderation policy and document-field comparison are distinct workflows; both keep consequential decisions with a human reviewer.

> **This repository is a demonstrable academic prototype, not a production detector.** The default scorer is a small deterministic heuristic so the walkthrough works without model weights. It is labeled `j-eace-demo-heuristic` everywhere and must not be used to make consequential decisions. A separate Python service and reproducible Transformer fine-tuning/evaluation pipeline are included; the trained checkpoint and a licensed dataset are intentionally not bundled. The default persistence adapter is in-memory on the API and localStorage in the dashboard. `database/schema.sql` documents the tenant-isolated PostgreSQL target.

## Run the workspace

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
```

The dashboard is served by Vite (normally `http://localhost:5173`) and the Fastify API by `http://localhost:3001`. The Vite proxy forwards browser requests from `/api/*` to the API service, so browser-facing code uses relative URLs. The app binds to `0.0.0.0` for preview/container use.

For a containerized walkthrough, use Docker Compose:

```bash
docker compose up --build
```

Open `http://localhost:5173`. This compose file runs only the web and API demo services; PostgreSQL/Redis workers are not connected in this prototype.

The seeded workspace is clearly marked **Sandbox data**. It includes example analyses, versioned threshold policies, applications, audit events, analytics, and a review queue. Actions such as running an analysis, saving a policy version, creating an application, rotating a placeholder key, and reviewing a flagged item are interactive. Dashboard sample state is stored in localStorage; submitted text is kept only in active page memory and removed before analysis history is persisted to localStorage.

### Local API authentication

Every analysis and application-data API route requires an API key; health and the OpenAPI definition are public. The sandbox recognizes `jeace_local_demo_key` (also accepted as `x-api-key`); it is a public demo credential, **not a secret**. The dev dashboard sends it only to its same-origin proxied API. Override it with `JEACE_DEMO_API_KEY` on the API and `VITE_JEACE_DEMO_API_KEY` on Vite (the Vite value is public by design and must not be a real secret). Set `JEACE_DEMO_MODE=false` and configure `ML_SERVICE_URL` to disable the demo heuristic; without a detector the service reports degraded health and returns 503. Production deployments must replace the demo auth with real tenant-scoped key records/JWTs before exposing the service.

```bash
curl -X POST http://localhost:3001/v1/analyze \
  -H 'x-api-key: jeace_local_demo_key' \
  -H 'Content-Type: application/json' \
  -d '{"text":"A few paragraphs to evaluate.","source":"assignment","locale":"en"}'
```

Implemented API routes: `GET /health`, `POST /v1/analyze`, `POST /v1/documents/analyze`, `GET /v1/analyses`, `GET /v1/analyses/{id}`, `GET /v1/policies`, `GET /v1/analytics`, and `GET /openapi.json`. Requests are input-limited and rate-limited. The text-analysis store keeps a content hash and metadata in process memory, never the submitted text; records disappear when the API restarts.

### Bank transfer-receipt review (new sandbox workflow)

The dashboard's **Bank documents** page accepts one JPEG/PNG transfer receipt (up to 5 MB). Fastify checks the binary image signature and dimensions, reads a limited set of EXIF tags (never GPS coordinates), and runs bundled local English OCR using Tesseract.js. It estimates amount, currency, date, and transaction reference, then can compare amount/currency/reference against optional values supplied in the multipart request. In a real integration those expected values must come from a trusted bank backend, not the customer/browser.

The original image and OCR text are processed in memory and are not persisted; OCR text is returned to the active browser page for a reviewer and is not saved to localStorage. A file hash is returned as a fingerprint, not as anonymization. The page is currently transfer-receipt-only and accepts JPEG/PNG (not PDF). It is **not** a bank-core verification, fraud score, deepfake detector, or image-tampering classifier. EXIF may be absent or altered; a match is not proof of authenticity or payment, and every result requires human verification. Do not upload real customer records to this sandbox.

Run checks:

```bash
npm test
npm run build
# With the ML development requirements installed:
python -m unittest discover -s ml-service -p 'test_*.py' -v
```

## Architecture

```text
React + Vite dashboard ──same-origin /api proxy──> Fastify core API
                                                      │
                                                      ├── DetectorAdapter
                                                      │     ├── sandbox heuristic (default)
                                                      │     └── HTTP adapter → Python inference service (optional)
                                                      ├── deterministic text policy engine
                                                      ├── JPEG/PNG receipt OCR + limited EXIF metadata
                                                      └── in-memory text demonstrator store

PostgreSQL tenant/RLS schema and academic model-training pipeline are supplied separately.
```

The TypeScript detector adapter uses `ML_SERVICE_URL` to call the Python service. Without this setting it selects the transparent sandbox heuristic. If a URL is configured but the detector is unavailable, the API returns a structured `503 DETECTOR_UNAVAILABLE` response rather than silently falling back. The HTTP adapter has a short timeout, one bounded retry, and a circuit breaker.

### Optional Transformer inference service

1. Create a clean Python environment and install `ml-service/requirements.txt`.
2. Obtain a dataset you are licensed to use and document its citation, license, domain, generation sources, label process, and known sampling biases.
3. Prepare a UTF-8 CSV with at least `text,label`; `label` is `human`/`0` or `ai`/`1`. Include a source/document-family `group_id` to keep related examples in one split.
4. Fine-tune and test on a held-out group-disjoint split:

   ```bash
   python -m venv .venv && . .venv/bin/activate
   pip install -r ml-service/requirements.txt
   python ml-service/train.py \
     --csv ./data/labeled_text.csv \
     --group-column group_id \
     --dataset-source 'Full dataset citation, release and license' \
     --output-dir ml-service/artifacts/j-eace-detector-v1
   ```

5. Start inference with the exported checkpoint:

   ```bash
   MODEL_PATH=ml-service/artifacts/j-eace-detector-v1/model \
   uvicorn ml-service.app:app --host 0.0.0.0 --port 8000
   ```

6. In another terminal, set `ML_SERVICE_URL=http://127.0.0.1:8000` and `DETECTOR_MODEL_VERSION=1.0.0` when starting the API. The version value scopes the optional content-hash cache; leave it unset to disable caching for remote models until the deployed model version is known. The Node process, not the browser, calls the private inference URL. For Compose/cloud deployments use the inference service's private service DNS name, not localhost from browser code.

The Python service deliberately starts without a model and reports degraded health/503 until an exported fine-tuned checkpoint exists. It never downloads weights at runtime. Training runs and model artifacts are ignored by Git.

## Academic evaluation plan

The pipeline uses a compact `distilbert-base-uncased` sequence classifier by default, labels human as class 0 and AI as class 1, applies stratified **group** splits where feasible, and exports a held-out report containing accuracy, precision, recall, F1, ROC-AUC, false-positive/false-negative rates, and a confusion matrix. The report also records sample counts, class balance, group counts, base model, hyperparameters, seed, runtime, and device. See [the ML service guide](ml-service/README.md) and [model card](docs/model-card.md).

Do not treat the sample dashboard metrics as detector-accuracy measurements. Report test-set results from a representative held-out dataset, inference latency on declared hardware, and the false-positive/false-negative trade-offs. Do not tune thresholds on the final test set. Discuss domain shift, multilingual performance, short samples, human editing/paraphrasing, unseen generators, model drift, and the consequences of errors.

## Current prototype boundaries

To make the academic prototype runnable with no external services, the dashboard's review/policy/application interactions use browser state, and the Fastify sample store is process memory. The dashboard is not yet backed by PostgreSQL, Redis, BullMQ, JWT/role-based accounts, asynchronous batch jobs, signed/retrying webhooks, or a production key-management service. API keys in the app screen are illustrative placeholders. The SQL migration provides a concrete tenant/RLS persistence design for those next integrations; these pieces should be implemented and security-tested before production deployment.

The ML service is a genuine in-repository training/inference component, but **no model has been trained as part of this checkout** because a dataset and weights were not provided. Do not present invented accuracy numbers as experimental results.

## Privacy and responsible use

A text score is an estimate, not proof of authorship. Short texts, genre, second-language writing, unusual styles, paraphrasing, human editing, and generators absent from the training data can produce false positives or negatives. Use human review and an appeal path, minimize collection, apply retention limits, and keep content out of logs. A text or image hash may still be linkable to its source and is not equivalent to anonymization. Bank receipts and OCR text can expose financial or personal data; the sandbox is for synthetic/redacted examples only. EXIF is user-controlled, may be stripped or modified, and is not reliable proof of capture time or authenticity.

## Project contents

- `src/` — responsive React dashboard, text analysis, and non-persistent bank receipt review page.
- `server/src/` — Fastify API, detector adapter/resilience, API-key demo gate, text policy engine, bounded JPEG/PNG OCR and metadata inspection, hash-only in-memory text store.
- `ml-service/` — FastAPI inference service, Transformer training pipeline, grouped split utility, evaluation metrics.
- `database/schema.sql` — PostgreSQL tenant isolation, RLS policies, immutable audit trail, review, retention, and usage schema.
- `docs/` — API reference, system boundaries, and model card.
- `tests/` — deterministic decision-engine and demo-contract unit tests.
