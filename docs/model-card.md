# Model card — J’eace detector

## Status

**No trained checkpoint is supplied.** The API runs a transparent hand-written demo heuristic unless `ML_SERVICE_URL` is configured. The FastAPI inference service reports `model_loaded=false` and returns 503 until it is given a fine-tuned local checkpoint. Therefore there are no valid accuracy, precision, recall, F1, ROC-AUC, or fairness results to claim from this checkout.

## Intended use

Research and demonstration of a probabilistic human-vs-AI text classification component inside a moderation workflow. Outputs are intended to help prioritize human review, not to establish authorship or make a disciplinary decision on their own.

This model card covers **text only**. The separate bank transfer-receipt sandbox uses English OCR and metadata extraction; it has no image-authenticity or tamper-detection model, and no bank-document OCR performance study or fraud metrics are claimed.

## Out-of-scope use

- Definitive authorship, plagiarism, fraud, or misconduct determinations.
- High-impact decisions without qualified human review and an appeal mechanism.
- Short text snippets, unsupported languages, or domains that were not represented and evaluated.
- Treating confidence as a calibrated probability until calibration is measured.

## Planned model

A compact Hugging Face `distilbert-base-uncased` sequence classifier fine-tuned on documented human-written and AI-generated examples. Class 0 is human-authored and class 1 is AI-generated. The score is the model's class-1 softmax output in `[0,1]`. The policy engine, not the classifier, maps that score to `ALLOW`, `FLAG`, or `BLOCK`.

## Data and evaluation

Dataset and checkpoint are not bundled. The training CLI requires a dataset citation/license and uses group-disjoint train/validation/test splits. A real study must document source/generator families, collection and label procedures, exclusions, class/domain/language distribution, possible prompt or source leakage, hardware, hyperparameters, training time, and held-out metrics. It should separately assess false-positive and false-negative rates and performance across relevant writing groups. Thresholds must not be selected against the final test data.

## Risks and limitations

AI text detectors can misclassify human-written text and miss AI-generated or edited text. Performance can vary by length, genre, language, educational background, author style, prompting, paraphrasing, model family, and time. A training dataset can encode source artifacts rather than authorship. Scores may be overconfident; calibration must be measured before calling the confidence value reliable. Human review, independent evidence, data minimization, and contestability are required.

## Change management

Record each exported checkpoint's version, data manifest, training code revision, run seed, test metrics, and intended evaluation domain. New model versions must not rewrite historical analysis results or policy snapshots. Monitor drift and re-evaluate before deployment or after major model/data changes.
