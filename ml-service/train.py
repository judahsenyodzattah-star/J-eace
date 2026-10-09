"""Fine-tune a compact Transformer detector and evaluate once on a held-out test split.

Example:
  python ml-service/train.py --csv data/labeled_text.csv --group-column source_group \
    --dataset-source "your dataset citation/license" --output-dir artifacts/j-eace-detector-v1
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import random
import time
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from torch.utils.data import Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding, Trainer, TrainingArguments

from data_utils import describe_splits, load_dataset, split_indices
from metrics import binary_metrics


class TextDataset(Dataset):
    def __init__(self, frame, tokenizer, max_length: int):
        self.labels = frame["label"].astype(int).tolist()
        self.encodings = tokenizer(frame["text"].tolist(), truncation=True, max_length=max_length)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, index):
        item = {key: value[index] for key, value in self.encodings.items()}
        item["labels"] = self.labels[index]
        return item


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fine-tune a Transformer on human-written vs AI-generated text.")
    parser.add_argument("--csv", required=True, help="Labeled UTF-8 CSV; requires text and label columns.")
    parser.add_argument("--text-column", default="text")
    parser.add_argument("--label-column", default="label")
    parser.add_argument("--group-column", default="group_id", help="Source/document family identifier to prevent leakage.")
    parser.add_argument("--model-name", default=os.getenv("BASE_MODEL", "distilbert-base-uncased"))
    parser.add_argument("--output-dir", default="artifacts/j-eace-detector-v1")
    parser.add_argument("--dataset-source", required=True, help="Citation, version, and license; recorded in the run manifest.")
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--train-batch-size", type=int, default=8)
    parser.add_argument("--eval-batch-size", type=int, default=16)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not args.dataset_source.strip():
        parser.error("--dataset-source must describe the dataset citation and license.")
    set_seed(args.seed)
    started = time.time()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    frame = load_dataset(args.csv, args.text_column, args.label_column, args.group_column)
    train_ids, validation_ids, test_ids = split_indices(frame, args.seed)
    split_info = describe_splits(frame, (train_ids, validation_ids, test_ids))
    print(json.dumps({"dataset_samples": len(frame), "splits": split_info}, indent=2))

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=2,
        id2label={0: "HUMAN", 1: "AI"},
        label2id={"HUMAN": 0, "AI": 1},
    )
    train_dataset = TextDataset(frame.iloc[train_ids], tokenizer, args.max_length)
    validation_dataset = TextDataset(frame.iloc[validation_ids], tokenizer, args.max_length)
    test_dataset = TextDataset(frame.iloc[test_ids], tokenizer, args.max_length)
    collator = DataCollatorWithPadding(tokenizer=tokenizer)

    def training_metrics(eval_prediction):
        probabilities = torch.softmax(torch.tensor(eval_prediction.predictions), dim=-1).numpy()[:, 1]
        metrics = binary_metrics(eval_prediction.label_ids, probabilities)
        return {key: value for key, value in metrics.items() if key != "confusion_matrix"}

    training_args = TrainingArguments(
        output_dir=str(output_dir / "checkpoints"),
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.train_batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        save_total_limit=1,
        logging_steps=25,
        seed=args.seed,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        processing_class=tokenizer,
        data_collator=collator,
        compute_metrics=training_metrics,
    )
    trainer.train()
    predictions = trainer.predict(test_dataset)
    probabilities = torch.softmax(torch.tensor(predictions.predictions), dim=-1).numpy()[:, 1]
    test_metrics = binary_metrics(predictions.label_ids, probabilities)

    model_dir = output_dir / "model"
    trainer.save_model(str(model_dir))
    tokenizer.save_pretrained(str(model_dir))
    report = {
        "metrics": test_metrics,
        "test_samples": len(test_ids),
        "splits": split_info,
        "threshold": 0.5,
        "positive_class": "AI-generated (label=1)",
        "dataset_source": args.dataset_source,
        "base_model": args.model_name,
        "model_version": "1.0.0",
        "training": {"epochs": args.epochs, "learning_rate": args.learning_rate, "train_batch_size": args.train_batch_size, "max_length": args.max_length, "seed": args.seed},
        "runtime": {"python": platform.python_version(), "pytorch": torch.__version__, "device": "cuda" if torch.cuda.is_available() else "cpu", "elapsed_seconds": round(time.time() - started, 2)},
    }
    (output_dir / "metrics_test.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (output_dir / "run_manifest.json").write_text(json.dumps({"model_path": str(model_dir), "model_version": "1.0.0", "dataset_source": args.dataset_source, "sample_count": len(frame), "splits": split_info}, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
