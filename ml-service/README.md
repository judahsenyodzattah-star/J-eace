# J’eace ML service and reproducible experiment

This component is intended to be the academic ML contribution, not an API wrapper around a third-party detection service. It fine-tunes an in-repository Transformers sequence-classification model and exports a checkpoint consumed by the FastAPI inference service.

## Dataset contract

Prepare a UTF-8 CSV with columns:

| Column | Required | Meaning |
| --- | --- | --- |
| `text` | yes | Text sample. Empty samples are removed. |
| `label` | yes | `0`/`human` for human-authored, `1`/`ai` for AI-generated. |
| `group_id` | strongly recommended | Source/document family, author cohort, prompt family, or other group that must stay in one split. |
| `source` / `generator` | optional | Useful for provenance and subgroup evaluation; include in your report. |

Do not mix duplicates or closely related passages across train, validation, and test sets. `data_utils.py` uses `StratifiedGroupKFold` when enough independent groups exist. It falls back to deterministic group-shuffle splits for smaller group counts, checks that both labels appear in all three partitions, and fails rather than silently making a row-level split. Without `group_id`, exact normalized duplicates are grouped but source/generator leakage cannot be excluded.

The repository intentionally ships no copyrighted or unlicensed training dataset. Record dataset version, citation, license/terms, collection date, sample counts, class balance, human/AI label method, AI generator/version, prompt provenance, domain, language, filtering, and exclusions. Keep original source data outside Git unless its license explicitly permits distribution.

## Train and evaluate

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r ml-service/requirements.txt
python ml-service/train.py \
  --csv ./data/labeled_text.csv \
  --text-column text --label-column label --group-column group_id \
  --model-name distilbert-base-uncased \
  --dataset-source 'Citation; dataset release; license' \
  --output-dir ml-service/artifacts/j-eace-detector-v1 \
  --epochs 3 --learning-rate 2e-5 --max-length 256 --seed 42
```

The compact DistilBERT checkpoint is a practical baseline, not a claim that it is optimal. The trainer writes model weights and tokenizer files under `model/`, and `metrics_test.json` plus `run_manifest.json` beside it. The test partition is not used for gradient updates or model selection. The validation partition selects the best checkpoint by F1; the held-out test report is produced after training.

Re-evaluate a saved checkpoint and produce a report:

```bash
python ml-service/evaluate.py \
  --csv ./data/labeled_text.csv \
  --model-path ml-service/artifacts/j-eace-detector-v1/model \
  --group-column group_id \
  --output ml-service/artifacts/j-eace-detector-v1/metrics_recheck.json
```

Reported metrics include accuracy, precision, recall, F1, ROC-AUC, false-positive rate, false-negative rate, and the confusion matrix (`[[TN, FP], [FN, TP]]`), with AI-generated text as the positive class. Also evaluate relevant groups separately (domain, language, human source, generator, length, and editing condition) when the dataset supports it. A single aggregate metric can conceal serious subgroup error.

## Internal inference service

```bash
MODEL_PATH=ml-service/artifacts/j-eace-detector-v1/model \
MODEL_VERSION=1.0.0 \
uvicorn ml-service.app:app --host 0.0.0.0 --port 8000
```

- `GET /health` reports whether local checkpoint weights loaded.
- `POST /internal/predict` accepts `{ "text": "...", "locale": "en" }` and returns score `[0,1]`, confidence, classification, model/version and latency.
- Missing weights produce degraded health and `503`; the service does not download a model or substitute a heuristic.
- The service is internal-only: do not expose it directly to the public internet. Deploy it on a private network and add service authentication/TLS at the deployment boundary.
- The Fastify adapter uses a bounded timeout and retry/circuit breaker. If a configured inference service is down, API callers receive a structured error.

## Limitations and reporting discipline

The model estimates association with its training labels, not factual authorship. Paraphrasing, mixed human/AI writing, human editing, short samples, non-native writing, domain-specific vocabulary, multilingual content, unseen model generations, and distribution shift can break the learned signals. Dataset contamination or weak prompt/generator separation can make test metrics unrealistically high. Detection results should be communicated probabilistically and should not be the sole basis for discipline, access, or other high-impact decisions.

No trained model, dataset, or measured result is included in this repository. The project report must use actual experiment artifacts, hardware, run duration, and held-out results; never claim the demo heuristic has Transformer performance.
