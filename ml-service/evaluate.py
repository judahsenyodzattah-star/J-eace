"""Evaluate an exported fine-tuned checkpoint on a group-separated held-out CSV split."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a saved detector without training on its test split.")
    parser.add_argument("--csv", required=True)
    parser.add_argument("--model-path", required=True)
    parser.add_argument("--text-column", default="text")
    parser.add_argument("--label-column", default="label")
    parser.add_argument("--group-column", default="group_id")
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="metrics_evaluation.json")
    args = parser.parse_args()

    frame = load_dataset(args.csv, args.text_column, args.label_column, args.group_column)
    train_ids, validation_ids, test_ids = split_indices(frame, args.seed)
    test = frame.iloc[test_ids]
    tokenizer = AutoTokenizer.from_pretrained(args.model_path, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(args.model_path, local_files_only=True)
    dataset = TextDataset(test, tokenizer, args.max_length)
    evaluation_args = TrainingArguments(output_dir=".evaluation-tmp", per_device_eval_batch_size=16, report_to="none", disable_tqdm=True)
    trainer = Trainer(model=model, args=evaluation_args, processing_class=tokenizer, data_collator=DataCollatorWithPadding(tokenizer=tokenizer))
    result = trainer.predict(dataset)
    probabilities = torch.softmax(torch.tensor(result.predictions), dim=-1).numpy()[:, 1]
    report = {"metrics": binary_metrics(result.label_ids, probabilities), "test_samples": len(test_ids), "splits": describe_splits(frame, (train_ids, validation_ids, test_ids)), "threshold": 0.5, "positive_class": "AI-generated (label=1)"}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
